import { and, asc, count, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { desafios, salaMembros, salas, usuarios, type Sala, type Usuario } from '@/bd/esquema';
import { exigirAtivo, exigirLivre, type Transacao } from './disponibilidade';

export class SalaCheia extends Error {
  constructor() {
    super('Esta sala já está completa.');
  }
}

export class SalaEmPartida extends Error {
  constructor() {
    super('Esta sala está em partida.');
  }
}

export class SemPermissaoNaSala extends Error {
  constructor() {
    super('Só o líder pode fazer isso.');
  }
}

export class SalaInexistente extends Error {
  constructor() {
    super('Sala não encontrada.');
  }
}

export const TAMANHO_DA_SALA = 5;
/** O dono pediu pouco tempo: ninguém fica esperando quem criou a sala e saiu do computador. */
export const TEMPO_FORA_DO_SITE_NA_SALA_MS = 5 * 60_000;

export type UsuarioPublico = Pick<Usuario, 'id' | 'apelido' | 'avatarUrl'>;
export type SalaComMembros = Sala & { membros: UsuarioPublico[] };

async function travarSala(tx: Transacao, salaId: string): Promise<Sala | undefined> {
  const [sala] = await tx.select().from(salas).where(eq(salas.id, salaId)).for('update');
  return sala;
}

/** A sala não tem nome escolhido: leva o nick do líder (e, quando existir, o nome do clã). */
export async function criarSala(bd: Bd, ator: Pick<Usuario, 'id'>): Promise<Sala> {
  return bd.transaction(async (tx) => {
    const lider = await exigirAtivo(tx, ator);
    await exigirLivre(tx, ator.id);
    const [sala] = await tx.insert(salas).values({ nome: lider.apelido, liderId: ator.id }).returning();
    await tx.insert(salaMembros).values({ salaId: sala.id, usuarioId: ator.id });
    return sala;
  });
}

export async function entrarNaSala(bd: Bd, ator: Pick<Usuario, 'id'>, salaId: string): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const sala = await travarSala(tx, salaId);
    if (!sala) throw new SalaInexistente();
    if (sala.partidaId) throw new SalaEmPartida();
    await exigirLivre(tx, ator.id);
    const [{ total }] = await tx.select({ total: count() }).from(salaMembros).where(eq(salaMembros.salaId, salaId));
    if (total >= TAMANHO_DA_SALA) throw new SalaCheia();
    await tx.insert(salaMembros).values({ salaId, usuarioId: ator.id });
  });
}

/** Sala que perde alguém deixa de estar completa, então o desafio pendente cai. */
async function cancelarDesafiosDaSala(tx: Transacao, salaId: string): Promise<void> {
  await tx
    .update(desafios)
    .set({ estado: 'cancelado' })
    .where(and(eq(desafios.estado, 'pendente'), or(eq(desafios.salaOrigemId, salaId), eq(desafios.salaAlvoId, salaId))));
}

/** Tira a pessoa da sala, passa a liderança adiante e apaga a sala vazia. */
export async function removerDaSala(tx: Transacao, sala: Sala, usuarioId: string): Promise<void> {
  await cancelarDesafiosDaSala(tx, sala.id);
  await tx.delete(salaMembros).where(and(eq(salaMembros.salaId, sala.id), eq(salaMembros.usuarioId, usuarioId)));
  if (sala.liderId !== usuarioId) return;
  const [proximo] = await tx
    .select()
    .from(salaMembros)
    .where(eq(salaMembros.salaId, sala.id))
    .orderBy(asc(salaMembros.entrouEm))
    .limit(1);
  if (proximo) {
    const [novoLider] = await tx.select({ apelido: usuarios.apelido }).from(usuarios).where(eq(usuarios.id, proximo.usuarioId));
    await tx.update(salas).set({ liderId: proximo.usuarioId, nome: novoLider.apelido }).where(eq(salas.id, sala.id));
  }
  else await tx.delete(salas).where(eq(salas.id, sala.id));
}

/** Tira das salas quem fechou o site. Sala em partida fica como está, porque o pessoal está jogando. */
export async function fecharSalasAbandonadas(bd: Bd, agora: Date = new Date()): Promise<void> {
  const limite = new Date(agora.getTime() - TEMPO_FORA_DO_SITE_NA_SALA_MS);
  const ausentes = await bd
    .select({ salaId: salaMembros.salaId, usuarioId: salaMembros.usuarioId })
    .from(salaMembros)
    .innerJoin(usuarios, eq(usuarios.id, salaMembros.usuarioId))
    .where(or(isNull(usuarios.vistoEm), lt(usuarios.vistoEm, limite)));
  for (const ausente of ausentes) {
    await bd.transaction(async (tx) => {
      const sala = await travarSala(tx, ausente.salaId);
      if (!sala || sala.partidaId) return;
      await removerDaSala(tx, sala, ausente.usuarioId);
    });
  }
}

export async function sairDaSala(bd: Bd, ator: Pick<Usuario, 'id'>): Promise<void> {
  await bd.transaction(async (tx) => {
    const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, ator.id));
    if (!vinculo) return;
    const sala = await travarSala(tx, vinculo.salaId);
    if (!sala) return;
    if (sala.partidaId) throw new SalaEmPartida();
    await removerDaSala(tx, sala, ator.id);
  });
}

export async function expulsarDaSala(bd: Bd, lider: Pick<Usuario, 'id'>, usuarioId: string): Promise<void> {
  await bd.transaction(async (tx) => {
    if (usuarioId === lider.id) throw new SemPermissaoNaSala();
    const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, lider.id));
    if (!vinculo) throw new SemPermissaoNaSala();
    const sala = await travarSala(tx, vinculo.salaId);
    if (!sala || sala.liderId !== lider.id) throw new SemPermissaoNaSala();
    if (sala.partidaId) throw new SalaEmPartida();
    const removidos = await tx
      .delete(salaMembros)
      .where(and(eq(salaMembros.salaId, sala.id), eq(salaMembros.usuarioId, usuarioId)))
      .returning();
    if (removidos.length === 0) throw new SemPermissaoNaSala();
    await cancelarDesafiosDaSala(tx, sala.id);
  });
}

async function comMembros(bd: Bd, lista: Sala[]): Promise<SalaComMembros[]> {
  if (lista.length === 0) return [];
  const linhas = await bd
    .select({ salaId: salaMembros.salaId, id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(salaMembros)
    .innerJoin(usuarios, eq(salaMembros.usuarioId, usuarios.id))
    .where(
      inArray(
        salaMembros.salaId,
        lista.map((sala) => sala.id),
      ),
    )
    .orderBy(asc(salaMembros.entrouEm));
  return lista.map((sala) => ({
    ...sala,
    membros: linhas
      .filter((linha) => linha.salaId === sala.id)
      .map(({ id, apelido, avatarUrl }) => ({ id, apelido, avatarUrl })),
  }));
}

export async function listarSalas(bd: Bd): Promise<SalaComMembros[]> {
  const lista = await comMembros(bd, await bd.select().from(salas).orderBy(asc(salas.criadoEm)));
  const prontas = lista.filter((sala) => sala.membros.length === TAMANHO_DA_SALA);
  const demais = lista.filter((sala) => sala.membros.length !== TAMANHO_DA_SALA);
  return [...prontas, ...demais];
}

export async function minhaSala(bd: Bd, usuarioId: string): Promise<SalaComMembros | null> {
  const [vinculo] = await bd.select().from(salaMembros).where(eq(salaMembros.usuarioId, usuarioId));
  if (!vinculo) return null;
  const [sala] = await comMembros(bd, await bd.select().from(salas).where(eq(salas.id, vinculo.salaId)));
  return sala ?? null;
}
