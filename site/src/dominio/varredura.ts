import { rm } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { banimentos, denuncias, desafios, gravacoes, partidaJogadores, partidas, servidores, usuarios, type Partida } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { converterChamadosSemResposta } from './denuncias';
import { alocarServidores, devolverPartida, finalizarPartida } from './partidas';

const MINUTO_MS = 60_000;
const LIMITE_CARREGANDO_MS = 2 * MINUTO_MS;
const LIMITE_AGUARDANDO_JOGADORES_MS = 5 * MINUTO_MS;
const LIMITE_SEM_EVENTO_MS = 3 * 60 * MINUTO_MS;
const RETENCAO_DA_GRAVACAO_MS = 30 * 24 * 60 * MINUTO_MS;

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
    await finalizarPartida(tx, atual.id, { estado: 'cancelada', vencedor: null });
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
      ),
    );
  for (const partida of abandonadas) await cancelarPartida(bd, controlador, partida);
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

export async function varrer(bd: Bd, controlador: ControladorServidor, pasta: string | undefined, agora: Date = new Date()): Promise<void> {
  const etapas = [
    () => expirarDesafios(bd, agora),
    () => reabrirCarregamentosPresos(bd, agora),
    () => cancelarPartidasAbandonadas(bd, controlador, agora),
    () => alocarServidores(bd, controlador),
    // Vem antes de apagar, porque a denúncia nova protege a gravação da partida.
    () => converterChamadosSemResposta(bd),
    () => apagarGravacoesVencidas(bd, pasta, agora),
  ];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (erro) {
      console.error('Falha em uma etapa da varredura:', erro);
    }
  }
}
