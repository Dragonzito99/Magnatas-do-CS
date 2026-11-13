import { and, asc, count, eq, gte, inArray, isNull, lte, ne, notInArray, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { banimentos, chamados, denuncias, denunciasDeMensagem, denunciasDiversao, partidaJogadores, partidas, usuarios, type Chamado, type Denuncia, type Partida, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';
import type { UsuarioPublico } from './salas';

export class MotivoInvalido extends Error {
  constructor() {
    super(`Escreva o motivo, com até ${MAXIMO_DO_TEXTO} caracteres.`);
  }
}

export class ConclusaoInvalida extends Error {
  constructor() {
    super(`Escreva a conclusão, com até ${MAXIMO_DO_TEXTO} caracteres.`);
  }
}

export class NaoJogou extends Error {
  constructor() {
    super('Só quem joga a partida pode fazer isso.');
  }
}

export class AcusadoInvalido extends Error {
  constructor() {
    super('Só dá para denunciar outro jogador desta partida.');
  }
}

export class DenunciaRepetida extends Error {
  constructor() {
    super('Você já denunciou este jogador nesta partida.');
  }
}

export class DenunciaIndisponivel extends Error {
  constructor() {
    super('Esta denúncia não está mais aberta.');
  }
}

export class ChamadoIndisponivel extends Error {
  constructor() {
    super('Este chamado não está mais disponível.');
  }
}

export const MAXIMO_DO_TEXTO = 500;
const TEMPO_ONLINE_MS = 2 * 60_000;
const INTERVALO_DO_VISTO_MS = 30_000;
export const ESTADOS_COM_CHAMADO: Partida['estado'][] = ['aguardando_jogadores', 'ao_vivo'];
const MOTIVO_DO_CHAMADO_SEM_EQUIPE = 'Chamado durante a partida, sem equipe online.';
const MOTIVO_DO_CHAMADO_SEM_RESPOSTA = 'Chamado durante a partida, sem resposta da equipe.';

async function idsDosJogadores(tx: Transacao, partidaId: string): Promise<string[]> {
  const linhas = await tx
    .select({ id: partidaJogadores.usuarioId })
    .from(partidaJogadores)
    .where(eq(partidaJogadores.partidaId, partidaId));
  return linhas.map((linha) => linha.id);
}

export async function denunciar(
  bd: Bd,
  ator: Pick<Usuario, 'id'>,
  dados: { partidaId: string; acusadoId: string; motivo: string },
): Promise<Denuncia> {
  const motivo = dados.motivo.trim();
  if (!motivo || motivo.length > MAXIMO_DO_TEXTO) throw new MotivoInvalido();
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const jogadores = await idsDosJogadores(tx, dados.partidaId);
    if (!jogadores.includes(ator.id)) throw new NaoJogou();
    if (dados.acusadoId === ator.id || !jogadores.includes(dados.acusadoId)) throw new AcusadoInvalido();
    const [denuncia] = await tx
      .insert(denuncias)
      .values({ partidaId: dados.partidaId, denuncianteId: ator.id, acusadoId: dados.acusadoId, motivo })
      .onConflictDoNothing()
      .returning();
    if (!denuncia) throw new DenunciaRepetida();
    return denuncia;
  });
}

export async function chamarEquipe(
  bd: Bd,
  ator: Pick<Usuario, 'id'>,
  partidaId: string,
  agora: Date = new Date(),
): Promise<{ chamado: Chamado; virouDenuncia: boolean }> {
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    // Trava a partida para dois chamados juntos virarem um só.
    const [partida] = await tx.select().from(partidas).where(eq(partidas.id, partidaId)).for('update');
    if (!partida) throw new ChamadoIndisponivel();
    const jogadores = await idsDosJogadores(tx, partidaId);
    if (!jogadores.includes(ator.id)) throw new NaoJogou();
    if (!ESTADOS_COM_CHAMADO.includes(partida.estado)) throw new ChamadoIndisponivel();

    const [aberto] = await tx
      .select()
      .from(chamados)
      .where(and(eq(chamados.partidaId, partidaId), eq(chamados.estado, 'aberto')));
    if (aberto) return { chamado: aberto, virouDenuncia: false };

    const [equipeOnline] = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(
        and(
          inArray(usuarios.papel, ['gm', 'adm']),
          eq(usuarios.estado, 'ativo'),
          gte(usuarios.vistoEm, new Date(agora.getTime() - TEMPO_ONLINE_MS)),
          notInArray(usuarios.id, jogadores),
        ),
      )
      .limit(1);
    if (equipeOnline) {
      const [chamado] = await tx.insert(chamados).values({ partidaId, chamadoPor: ator.id }).returning();
      return { chamado, virouDenuncia: false };
    }

    const [anterior] = await tx
      .select()
      .from(chamados)
      .where(and(eq(chamados.partidaId, partidaId), eq(chamados.chamadoPor, ator.id), eq(chamados.estado, 'virou_denuncia')));
    if (anterior) return { chamado: anterior, virouDenuncia: true };

    const [chamado] = await tx.insert(chamados).values({ partidaId, chamadoPor: ator.id, estado: 'virou_denuncia' }).returning();
    await tx.insert(denuncias).values({ partidaId, denuncianteId: ator.id, motivo: MOTIVO_DO_CHAMADO_SEM_EQUIPE });
    return { chamado, virouDenuncia: true };
  });
}

export async function atenderChamado(bd: Bd, gm: Pick<Usuario, 'id'>, chamadoId: string): Promise<Chamado> {
  return bd.transaction(async (tx) => {
    await exigirPermissao(tx, gm, 'moderar');
    const [chamado] = await tx.select().from(chamados).where(eq(chamados.id, chamadoId));
    if (!chamado) throw new ChamadoIndisponivel();
    // Quem joga a partida não pode fiscalizá-la.
    if ((await idsDosJogadores(tx, chamado.partidaId)).includes(gm.id)) throw new SemPermissao();
    // Com a partida acabada não há o que assistir, e a varredura transforma o chamado em denúncia.
    const [partida] = await tx.select({ estado: partidas.estado }).from(partidas).where(eq(partidas.id, chamado.partidaId));
    if (!partida || !ESTADOS_COM_CHAMADO.includes(partida.estado)) throw new ChamadoIndisponivel();
    const [atendido] = await tx
      .update(chamados)
      .set({ estado: 'atendido', atendidoPor: gm.id })
      .where(and(eq(chamados.id, chamadoId), eq(chamados.estado, 'aberto')))
      .returning();
    if (!atendido) throw new ChamadoIndisponivel();
    await registrarAuditoria(tx, { atorId: gm.id, acao: 'atender_chamado', detalhes: { chamadoId, partidaId: chamado.partidaId } });
    return atendido;
  });
}

/** Quando a partida acaba sem ninguém atender, a reclamação vira denúncia em vez de sumir. */
export async function converterChamadosSemResposta(bd: Bd): Promise<void> {
  const parados = await bd
    .select({ id: chamados.id, tipo: partidas.tipo })
    .from(chamados)
    .innerJoin(partidas, eq(chamados.partidaId, partidas.id))
    .where(and(eq(chamados.estado, 'aberto'), inArray(partidas.estado, ['encerrada', 'cancelada'])));
  for (const { id, tipo } of parados) {
    // Teste do Adm contra bots: não há ninguém para denunciar, o chamado só fecha (13/11/2026).
    if (tipo === 'teste') {
      await bd.update(chamados).set({ estado: 'atendido' }).where(and(eq(chamados.id, id), eq(chamados.estado, 'aberto')));
      continue;
    }
    try {
      await bd.transaction(async (tx) => {
        const [chamado] = await tx
          .update(chamados)
          .set({ estado: 'virou_denuncia' })
          .where(and(eq(chamados.id, id), eq(chamados.estado, 'aberto')))
          .returning();
        if (!chamado) return;
        const [jaTem] = await tx
          .select({ id: denuncias.id })
          .from(denuncias)
          .where(
            and(
              eq(denuncias.partidaId, chamado.partidaId),
              eq(denuncias.denuncianteId, chamado.chamadoPor),
              isNull(denuncias.acusadoId),
              ne(denuncias.estado, 'encerrada'),
            ),
          )
          .limit(1);
        if (!jaTem) {
          await tx.insert(denuncias).values({ partidaId: chamado.partidaId, denuncianteId: chamado.chamadoPor, motivo: MOTIVO_DO_CHAMADO_SEM_RESPOSTA });
        }
      });
    } catch (erro) {
      console.error(`Não foi possível converter o chamado ${id} em denúncia:`, erro);
    }
  }
}

export async function contagemDeCasos(bd: Bd, leitor: Pick<Usuario, 'id'>): Promise<{ chamados: number; denuncias: number; propostas: number }> {
  await exigirPermissao(bd, leitor, 'moderar');
  const [{ abertos }] = await bd.select({ abertos: count() }).from(chamados).where(eq(chamados.estado, 'aberto'));
  const [{ pendentes }] = await bd.select({ pendentes: count() }).from(denuncias).where(ne(denuncias.estado, 'encerrada'));
  const [{ daDiversao }] = await bd.select({ daDiversao: count() }).from(denunciasDiversao).where(ne(denunciasDiversao.estado, 'encerrada'));
  const [{ deMensagem }] = await bd.select({ deMensagem: count() }).from(denunciasDeMensagem).where(ne(denunciasDeMensagem.estado, 'encerrada'));
  const [{ propostas }] = await bd.select({ propostas: count() }).from(banimentos).where(eq(banimentos.estado, 'proposto'));
  return { chamados: abertos, denuncias: pendentes + daDiversao + deMensagem, propostas };
}

export async function contarCasos(bd: Bd, leitor: Pick<Usuario, 'id'>): Promise<number> {
  const contagem = await contagemDeCasos(bd, leitor);
  return contagem.chamados + contagem.denuncias + contagem.propostas;
}

/** Escreve no máximo uma vez a cada 30 segundos, porque as páginas se atualizam sozinhas. */
export async function marcarVisto(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<void> {
  const limite = new Date(agora.getTime() - INTERVALO_DO_VISTO_MS);
  await bd
    .update(usuarios)
    .set({ vistoEm: agora })
    .where(and(eq(usuarios.id, usuarioId), or(isNull(usuarios.vistoEm), lte(usuarios.vistoEm, limite))));
}

export async function membrosOnline(bd: Bd, agora: Date = new Date()): Promise<UsuarioPublico[]> {
  return bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(usuarios)
    .where(and(eq(usuarios.estado, 'ativo'), gte(usuarios.vistoEm, new Date(agora.getTime() - TEMPO_ONLINE_MS))))
    .orderBy(asc(usuarios.apelido))
    .limit(30);
}
