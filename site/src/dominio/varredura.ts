import { rm } from 'node:fs/promises';
import { apagarEnderecosVencidos } from './envios';
import path from 'node:path';
import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { banimentos, denuncias, desafios, gravacoes, partidaJogadores, partidas, servidores, usuarios, type Partida, type ServidorDiversao, type Usuario } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { converterChamadosSemResposta } from './denuncias';
import { resolverAceitesVencidos } from './aceites';
import { ESTADOS_ATIVOS_DE_PARTIDA } from './disponibilidade';
import { fiscalizarDiversao } from './diversao';
import { acompanharDiversao, type ControleDaDiversao, type RespostaDoServidor } from './sob-demanda';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';
import { alocarServidores, devolverPartida, finalizarPartida } from './partidas';
import { expirarJuncoes } from './juncoes';
import { tirarDaFilaQuemSaiuDoSite } from './mix';
import { fecharSalasAbandonadas } from './salas';
import { chamarBotsDosTestes } from './teste-competitivo';
import { aplicarTestesDaMutacao } from './teste-mutacao';
import { resolverVetosVencidos } from './vetos';

const MINUTO_MS = 60_000;
const LIMITE_CARREGANDO_MS = 2 * MINUTO_MS;
// O servidor só avisa que a partida começou depois da rodada de faca, então o tempo inclui preparar e a faca.
export const LIMITE_AGUARDANDO_JOGADORES_MS = 10 * MINUTO_MS;
// Fila normal por servidor ocupado cabe aqui. Passou disso, as pessoas não podem ficar presas.
const LIMITE_SEM_SERVIDOR_MS = 60 * MINUTO_MS;
const LIMITE_SEM_EVENTO_MS = 3 * 60 * MINUTO_MS;
const RETENCAO_DA_GRAVACAO_MS = 30 * 24 * 60 * MINUTO_MS;

export class PartidaIndisponivel extends Error {
  constructor() {
    super('Esta partida não está mais em andamento.');
  }
}

async function expirarDesafios(bd: Bd, agora: Date): Promise<void> {
  await bd
    .update(desafios)
    .set({ estado: 'expirado' })
    .where(and(eq(desafios.estado, 'pendente'), lte(desafios.expiraEm, agora)));
}

async function reabrirCarregamentosPresos(bd: Bd, agora: Date): Promise<void> {
  const presas = await bd
    .select()
    .from(partidas)
    .where(and(eq(partidas.estado, 'carregando'), lte(partidas.estadoDesde, new Date(agora.getTime() - LIMITE_CARREGANDO_MS))));
  for (const partida of presas) await devolverPartida(bd, partida.id, partida.servidorId);
}

async function cancelarPartida(bd: Bd, controlador: ControladorServidor, partida: Partida): Promise<void> {
  const servidor = await bd.transaction(async (tx) => {
    // Confere de novo, porque um evento pode ter chegado depois da busca.
    const [atual] = await tx
      .select()
      .from(partidas)
      .where(and(eq(partidas.id, partida.id), eq(partidas.estado, partida.estado)))
      .for('update');
    if (!atual) return null;
    const [ocupado] = atual.servidorId ? await tx.select().from(servidores).where(eq(servidores.id, atual.servidorId)) : [];
    await finalizarPartida(tx, atual.id, { estado: 'cancelada', vencedor: null, motivoDoCancelamento: 'abandono' });
    return ocupado ?? null;
  });
  if (!servidor) return;
  await controlador.encerrarPartida(servidor).catch((erro) => {
    console.warn(`Não foi possível encerrar a partida ${partida.numero} no servidor ${servidor.nome}:`, erro);
  });
}

async function cancelarPartidasAbandonadas(bd: Bd, controlador: ControladorServidor, agora: Date): Promise<void> {
  const limiteSemEvento = new Date(agora.getTime() - LIMITE_SEM_EVENTO_MS);
  const abandonadas = await bd
    .select()
    .from(partidas)
    .where(
      or(
        and(
          eq(partidas.estado, 'aguardando_jogadores'),
          lte(partidas.estadoDesde, new Date(agora.getTime() - LIMITE_AGUARDANDO_JOGADORES_MS)),
        ),
        and(
          eq(partidas.estado, 'ao_vivo'),
          or(
            lte(partidas.ultimoEventoEm, limiteSemEvento),
            and(isNull(partidas.ultimoEventoEm), lte(partidas.estadoDesde, limiteSemEvento)),
          ),
        ),
        and(
          inArray(partidas.estado, ['aguardando_servidor', 'carregando']),
          lte(partidas.criadoEm, new Date(agora.getTime() - LIMITE_SEM_SERVIDOR_MS)),
        ),
      ),
    );
  for (const partida of abandonadas) await cancelarPartida(bd, controlador, partida);
}

/** Saída para partida presa: sem isto, as pessoas dela não conseguem entrar em sala nem no mix. */
export async function cancelarPartidaPelaEquipe(
  bd: Bd,
  controlador: ControladorServidor,
  gm: Pick<Usuario, 'id'>,
  partidaId: string,
): Promise<void> {
  const servidor = await bd.transaction(async (tx) => {
    await exigirPermissao(tx, gm, 'moderar');
    const [partida] = await tx
      .select()
      .from(partidas)
      .where(and(eq(partidas.id, partidaId), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])))
      .for('update');
    if (!partida) throw new PartidaIndisponivel();
    const [jogando] = await tx
      .select({ id: partidaJogadores.usuarioId })
      .from(partidaJogadores)
      .where(and(eq(partidaJogadores.partidaId, partidaId), eq(partidaJogadores.usuarioId, gm.id)));
    // Quem joga a partida não pode cancelar a que está perdendo.
    if (jogando) throw new SemPermissao();
    const [ocupado] = partida.servidorId ? await tx.select().from(servidores).where(eq(servidores.id, partida.servidorId)) : [];
    await finalizarPartida(tx, partidaId, { estado: 'cancelada', vencedor: null, motivoDoCancelamento: 'equipe' });
    await registrarAuditoria(tx, { atorId: gm.id, acao: 'cancelar_partida', detalhes: { partidaId, numero: partida.numero } });
    return ocupado ?? null;
  });
  if (!servidor) return;
  await controlador.encerrarPartida(servidor).catch((erro) => {
    console.warn(`Não foi possível encerrar a partida no servidor ${servidor.nome}:`, erro);
  });
}

/**
 * O kickid derruba, mas a pessoa continua na lista da partida carregada e poderia voltar.
 * Repetir a cada varredura mantém a punição de pé, e também cobre um kick que falhou.
 */
async function expulsarPunidos(bd: Bd, controlador: ControladorServidor): Promise<void> {
  const ocupados = await bd.select().from(servidores).where(isNotNull(servidores.partidaId));
  if (ocupados.length === 0) return;
  const punidos = inArray(usuarios.estado, ['suspenso', 'banido']);
  const daEquipe = await bd
    .select({ steamid64: usuarios.steamid64 })
    .from(usuarios)
    .where(and(punidos, inArray(usuarios.papel, ['gm', 'adm'])));
  const daPartida = await bd
    .select({ partidaId: partidaJogadores.partidaId, steamid64: usuarios.steamid64 })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(and(punidos, inArray(partidaJogadores.partidaId, ocupados.flatMap((servidor) => (servidor.partidaId ? [servidor.partidaId] : [])))));

  for (const servidor of ocupados) {
    const alvos = new Set([
      ...daEquipe.map((conta) => conta.steamid64),
      ...daPartida.filter((linha) => linha.partidaId === servidor.partidaId).map((linha) => linha.steamid64),
    ]);
    for (const steamid64 of alvos) {
      await controlador.expulsar(servidor, steamid64).catch((erro) => {
        console.warn(`Não foi possível expulsar uma conta punida do servidor ${servidor.nome}:`, erro);
      });
    }
  }
}

/** Fica guardada a gravação com caso aberto, e a de quem foi punido ou tem proposta aberta, porque é a prova. */
async function gravacaoProtegida(bd: Bd, partidaId: string): Promise<boolean> {
  const jogadores = (
    await bd.select({ id: partidaJogadores.usuarioId }).from(partidaJogadores).where(eq(partidaJogadores.partidaId, partidaId))
  ).map((linha) => linha.id);
  const [emAberto] = await bd
    .select({ id: denuncias.id })
    .from(denuncias)
    .where(and(ne(denuncias.estado, 'encerrada'), or(eq(denuncias.partidaId, partidaId), inArray(denuncias.acusadoId, jogadores))))
    .limit(1);
  if (emAberto) return true;
  const [punido] = await bd
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(inArray(usuarios.estado, ['banido', 'suspenso']), inArray(usuarios.id, jogadores)))
    .limit(1);
  if (punido) return true;
  const [proposta] = await bd
    .select({ id: banimentos.id })
    .from(banimentos)
    .where(and(eq(banimentos.estado, 'proposto'), inArray(banimentos.usuarioId, jogadores)))
    .limit(1);
  return Boolean(proposta);
}

async function apagarGravacoesVencidas(bd: Bd, pasta: string | undefined, agora: Date): Promise<void> {
  if (!pasta) return;
  const vencidas = await bd
    .select()
    .from(gravacoes)
    .where(and(isNull(gravacoes.apagadaEm), lte(gravacoes.criadoEm, new Date(agora.getTime() - RETENCAO_DA_GRAVACAO_MS))));
  for (const gravacao of vencidas) {
    if (await gravacaoProtegida(bd, gravacao.partidaId)) continue;
    await rm(path.join(pasta, gravacao.arquivo), { force: true });
    await bd.update(gravacoes).set({ apagadaEm: agora }).where(eq(gravacoes.id, gravacao.id));
  }
}

export async function varrer(
  bd: Bd,
  controlador: ControladorServidor,
  pasta: string | undefined,
  agora: Date = new Date(),
  hostDaDiversao: string | undefined = undefined,
  diversao?: { controle: ControleDaDiversao; perguntar: (servidor: ServidorDiversao) => Promise<RespostaDoServidor> },
): Promise<void> {
  const etapas = [
    // Antes da fiscalização: ela só pergunta a quem o site sabe estar ligado.
    () => (diversao ? acompanharDiversao(bd, diversao.controle, diversao.perguntar, agora) : Promise.resolve()),
    () => fiscalizarDiversao(bd, controlador, hostDaDiversao),
    () => aplicarTestesDaMutacao(bd, controlador, hostDaDiversao),
    () => fecharSalasAbandonadas(bd, agora),
    () => tirarDaFilaQuemSaiuDoSite(bd, agora),
    () => expirarDesafios(bd, agora),
    () => expirarJuncoes(bd, agora),
    () => reabrirCarregamentosPresos(bd, agora),
    () => cancelarPartidasAbandonadas(bd, controlador, agora),
    () => resolverAceitesVencidos(bd, agora),
    () => resolverVetosVencidos(bd, agora),
    () => alocarServidores(bd, controlador, agora),
    () => expulsarPunidos(bd, controlador),
    () => chamarBotsDosTestes(bd, controlador),
    // Vem antes de apagar, porque a denúncia nova protege a gravação da partida.
    () => converterChamadosSemResposta(bd),
    () => apagarGravacoesVencidas(bd, pasta, agora),
    // Endereço do Premium só fica guardado enquanto precisa (90 dias depois do fim).
    () => apagarEnderecosVencidos(bd, agora),
  ];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (erro) {
      console.error('Falha em uma etapa da varredura:', erro);
    }
  }
}
