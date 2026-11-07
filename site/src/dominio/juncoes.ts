import { and, asc, count, eq, gt, inArray, lte, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { desafios, juncoes, salaMembros, salas, type Juncao, type Sala, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
import { SalaCheia, SalaEmPartida, SemPermissaoNaSala, TAMANHO_DA_SALA } from './salas';

export class JuncaoIndisponivel extends Error {
  constructor() {
    super('Este pedido de junção não está mais disponível.');
  }
}

/** O mesmo prazo do desafio. */
export const PRAZO_DA_JUNCAO_MS = 60_000;

export type JuncaoDaSala = Pick<Juncao, 'id' | 'expiraEm'> & {
  recebido: boolean;
  outraSalaId: string;
  outraSalaNome: string;
  outraSalaTamanho: number;
};

/** Sempre na mesma ordem, para dois pedidos cruzados não travarem um ao outro. */
function travarSalas(tx: Transacao, ids: string[]): Promise<Sala[]> {
  return tx.select().from(salas).where(inArray(salas.id, ids)).orderBy(asc(salas.id)).for('update');
}

async function tamanhoDe(tx: Transacao, salaId: string): Promise<number> {
  const [{ total }] = await tx.select({ total: count() }).from(salaMembros).where(eq(salaMembros.salaId, salaId));
  return total;
}

function envolveAsSalas(ids: string[]) {
  return or(inArray(juncoes.salaOrigemId, ids), inArray(juncoes.salaAlvoId, ids));
}

async function salaDoLider(tx: Transacao, liderId: string): Promise<string> {
  const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, liderId));
  if (!vinculo) throw new SemPermissaoNaSala();
  return vinculo.salaId;
}

export async function pedirJuncao(bd: Bd, lider: Pick<Usuario, 'id'>, salaAlvoId: string, agora: Date = new Date()): Promise<Juncao> {
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const salaId = await salaDoLider(tx, lider.id);
    const travadas = await travarSalas(tx, [salaId, salaAlvoId]);
    const origem = travadas.find((sala) => sala.id === salaId);
    const alvo = travadas.find((sala) => sala.id === salaAlvoId);
    if (!origem || origem.liderId !== lider.id) throw new SemPermissaoNaSala();
    if (!alvo || origem.id === alvo.id) throw new JuncaoIndisponivel();
    if (origem.partidaId || alvo.partidaId) throw new SalaEmPartida();
    if ((await tamanhoDe(tx, origem.id)) + (await tamanhoDe(tx, alvo.id)) > TAMANHO_DA_SALA) throw new SalaCheia();

    const ids = [origem.id, alvo.id];
    await tx
      .update(juncoes)
      .set({ estado: 'expirado' })
      .where(and(eq(juncoes.estado, 'pendente'), lte(juncoes.expiraEm, agora), envolveAsSalas(ids)));
    const [aberto] = await tx
      .select({ id: juncoes.id })
      .from(juncoes)
      .where(
        and(
          eq(juncoes.estado, 'pendente'),
          or(
            and(eq(juncoes.salaOrigemId, origem.id), eq(juncoes.salaAlvoId, alvo.id)),
            and(eq(juncoes.salaOrigemId, alvo.id), eq(juncoes.salaAlvoId, origem.id)),
          ),
        ),
      );
    if (aberto) throw new JuncaoIndisponivel();

    const [pedido] = await tx
      .insert(juncoes)
      .values({ salaOrigemId: origem.id, salaAlvoId: alvo.id, expiraEm: new Date(agora.getTime() + PRAZO_DA_JUNCAO_MS), criadoEm: agora })
      .returning();
    return pedido;
  });
}

/** Todos da sala que pediu passam para a sala que aceitou, que mantém líder e nome. A sala que pediu some. */
export async function aceitarJuncao(bd: Bd, lider: Pick<Usuario, 'id'>, juncaoId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const [pedido] = await tx.select().from(juncoes).where(eq(juncoes.id, juncaoId)).for('update');
    if (!pedido) throw new JuncaoIndisponivel();
    const travadas = await travarSalas(tx, [pedido.salaOrigemId, pedido.salaAlvoId]);
    const origem = travadas.find((sala) => sala.id === pedido.salaOrigemId);
    const alvo = travadas.find((sala) => sala.id === pedido.salaAlvoId);
    if (!alvo) throw new JuncaoIndisponivel();
    if (alvo.liderId !== lider.id) throw new SemPermissaoNaSala();
    if (pedido.estado !== 'pendente' || pedido.expiraEm <= agora || !origem) throw new JuncaoIndisponivel();
    if (origem.partidaId || alvo.partidaId) throw new SalaEmPartida();
    // Confere de novo: alguém pode ter entrado em uma das salas depois do pedido.
    if ((await tamanhoDe(tx, origem.id)) + (await tamanhoDe(tx, alvo.id)) > TAMANHO_DA_SALA) throw new SalaCheia();

    await tx.update(juncoes).set({ estado: 'aceito' }).where(eq(juncoes.id, juncaoId));
    await tx.update(salaMembros).set({ salaId: alvo.id, entrouEm: agora }).where(eq(salaMembros.salaId, origem.id));
    await tx
      .update(desafios)
      .set({ estado: 'cancelado' })
      .where(and(eq(desafios.estado, 'pendente'), or(eq(desafios.salaOrigemId, origem.id), eq(desafios.salaAlvoId, origem.id))));
    await tx.update(juncoes).set({ estado: 'cancelado' }).where(and(eq(juncoes.estado, 'pendente'), envolveAsSalas([origem.id])));
    await tx.delete(salas).where(eq(salas.id, origem.id));
  });
}

async function encerrarJuncao(
  bd: Bd,
  lider: Pick<Usuario, 'id'>,
  juncaoId: string,
  lado: 'salaOrigemId' | 'salaAlvoId',
  estado: 'recusado' | 'cancelado',
): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const [pedido] = await tx.select().from(juncoes).where(eq(juncoes.id, juncaoId));
    if (!pedido) throw new JuncaoIndisponivel();
    const [sala] = await tx.select().from(salas).where(eq(salas.id, pedido[lado]));
    if (!sala) throw new JuncaoIndisponivel();
    if (sala.liderId !== lider.id) throw new SemPermissaoNaSala();
    const [alterado] = await tx
      .update(juncoes)
      .set({ estado })
      .where(and(eq(juncoes.id, juncaoId), eq(juncoes.estado, 'pendente')))
      .returning();
    if (!alterado) throw new JuncaoIndisponivel();
  });
}

export function recusarJuncao(bd: Bd, lider: Pick<Usuario, 'id'>, juncaoId: string): Promise<void> {
  return encerrarJuncao(bd, lider, juncaoId, 'salaAlvoId', 'recusado');
}

export function cancelarJuncao(bd: Bd, lider: Pick<Usuario, 'id'>, juncaoId: string): Promise<void> {
  return encerrarJuncao(bd, lider, juncaoId, 'salaOrigemId', 'cancelado');
}

export async function expirarJuncoes(bd: Bd, agora: Date = new Date()): Promise<void> {
  await bd
    .update(juncoes)
    .set({ estado: 'expirado' })
    .where(and(eq(juncoes.estado, 'pendente'), lte(juncoes.expiraEm, agora)));
}

export async function juncoesDaSala(bd: Bd, salaId: string, agora: Date = new Date()): Promise<JuncaoDaSala[]> {
  const pendentes = await bd
    .select()
    .from(juncoes)
    .where(and(eq(juncoes.estado, 'pendente'), gt(juncoes.expiraEm, agora), envolveAsSalas([salaId])))
    .orderBy(asc(juncoes.criadoEm));
  if (pendentes.length === 0) return [];

  const outraSala = (pedido: Juncao) => (pedido.salaAlvoId === salaId ? pedido.salaOrigemId : pedido.salaAlvoId);
  const outras = await bd
    .select({ id: salas.id, nome: salas.nome, tamanho: count(salaMembros.usuarioId) })
    .from(salas)
    .leftJoin(salaMembros, eq(salaMembros.salaId, salas.id))
    .where(inArray(salas.id, pendentes.map(outraSala)))
    .groupBy(salas.id, salas.nome);
  return pendentes.flatMap((pedido) => {
    const outra = outras.find((sala) => sala.id === outraSala(pedido));
    if (!outra) return [];
    return [
      {
        id: pedido.id,
        expiraEm: pedido.expiraEm,
        recebido: pedido.salaAlvoId === salaId,
        outraSalaId: outra.id,
        outraSalaNome: outra.nome,
        outraSalaTamanho: outra.tamanho,
      },
    ];
  });
}
