import { and, asc, eq, gt, inArray, lte, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { desafios, salaMembros, salas, usuarios, type Desafio, type Partida, type Sala, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
import { criarPartida } from './partidas';
import { SemPermissaoNaSala, TAMANHO_DA_SALA } from './salas';

export class DesafioIndisponivel extends Error {
  constructor() {
    super('Este desafio não está mais disponível.');
  }
}

export class SalaIncompleta extends Error {
  constructor() {
    super('As duas salas precisam estar completas e com todos liberados para jogar.');
  }
}

const PRAZO_DO_DESAFIO_MS = 60_000;

export type DesafioDaSala = Pick<Desafio, 'id' | 'expiraEm'> & {
  recebido: boolean;
  outraSalaId: string;
  outraSalaNome: string;
};

/** Sempre na mesma ordem, para dois pedidos cruzados não travarem um ao outro. */
function travarSalas(tx: Transacao, ids: string[]): Promise<Sala[]> {
  return tx.select().from(salas).where(inArray(salas.id, ids)).orderBy(asc(salas.id)).for('update');
}

async function exigirCompleta(tx: Transacao, salaId: string): Promise<string[]> {
  const membros = await tx
    .select({ id: usuarios.id, estado: usuarios.estado })
    .from(salaMembros)
    .innerJoin(usuarios, eq(salaMembros.usuarioId, usuarios.id))
    .where(eq(salaMembros.salaId, salaId));
  if (membros.length !== TAMANHO_DA_SALA || membros.some((membro) => membro.estado !== 'ativo')) {
    throw new SalaIncompleta();
  }
  return membros.map((membro) => membro.id);
}

function envolveAsSalas(ids: string[]) {
  return or(inArray(desafios.salaOrigemId, ids), inArray(desafios.salaAlvoId, ids));
}

export async function desafiar(
  bd: Bd,
  lider: Pick<Usuario, 'id'>,
  salaAlvoId: string,
  agora: Date = new Date(),
): Promise<Desafio> {
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, lider.id));
    if (!vinculo) throw new SemPermissaoNaSala();

    const travadas = await travarSalas(tx, [vinculo.salaId, salaAlvoId]);
    const origem = travadas.find((sala) => sala.id === vinculo.salaId);
    const alvo = travadas.find((sala) => sala.id === salaAlvoId);
    if (!origem || origem.liderId !== lider.id) throw new SemPermissaoNaSala();
    if (!alvo || origem.id === alvo.id || origem.partidaId || alvo.partidaId) throw new DesafioIndisponivel();

    await exigirCompleta(tx, origem.id);
    await exigirCompleta(tx, alvo.id);

    const ids = [origem.id, alvo.id];
    await tx
      .update(desafios)
      .set({ estado: 'expirado' })
      .where(and(eq(desafios.estado, 'pendente'), lte(desafios.expiraEm, agora), envolveAsSalas(ids)));
    const [aberto] = await tx
      .select({ id: desafios.id })
      .from(desafios)
      .where(and(eq(desafios.estado, 'pendente'), envolveAsSalas(ids)));
    if (aberto) throw new DesafioIndisponivel();

    const [desafio] = await tx
      .insert(desafios)
      .values({ salaOrigemId: origem.id, salaAlvoId: alvo.id, expiraEm: new Date(agora.getTime() + PRAZO_DO_DESAFIO_MS) })
      .returning();
    return desafio;
  });
}

export async function aceitarDesafio(
  bd: Bd,
  lider: Pick<Usuario, 'id'>,
  desafioId: string,
  agora: Date = new Date(),
): Promise<Partida> {
  // Fora da transação, para continuar marcado mesmo com o aceite falhando.
  await bd
    .update(desafios)
    .set({ estado: 'expirado' })
    .where(and(eq(desafios.id, desafioId), eq(desafios.estado, 'pendente'), lte(desafios.expiraEm, agora)));

  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const [desafio] = await tx.select().from(desafios).where(eq(desafios.id, desafioId));
    if (!desafio) throw new DesafioIndisponivel();

    const ids = [desafio.salaOrigemId, desafio.salaAlvoId];
    const travadas = await travarSalas(tx, ids);
    const alvo = travadas.find((sala) => sala.id === desafio.salaAlvoId);
    if (!alvo) throw new DesafioIndisponivel();
    if (alvo.liderId !== lider.id) throw new SemPermissaoNaSala();

    const [aceito] = await tx
      .update(desafios)
      .set({ estado: 'aceito' })
      .where(and(eq(desafios.id, desafioId), eq(desafios.estado, 'pendente'), gt(desafios.expiraEm, agora)))
      .returning();
    if (!aceito || travadas.length !== ids.length) throw new DesafioIndisponivel();

    const time1 = await exigirCompleta(tx, desafio.salaOrigemId);
    const time2 = await exigirCompleta(tx, desafio.salaAlvoId);
    const origem = travadas.find((sala) => sala.id === desafio.salaOrigemId);
    const partida = await criarPartida(tx, { tipo: 'desafio', time1, time2, agora, nomes: { 1: origem?.nome ?? 'Time 1', 2: alvo.nome } });
    await tx.update(salas).set({ partidaId: partida.id }).where(inArray(salas.id, ids));
    return partida;
  });
}

async function encerrarDesafio(
  bd: Bd,
  lider: Pick<Usuario, 'id'>,
  desafioId: string,
  lado: 'salaOrigemId' | 'salaAlvoId',
  estado: 'recusado' | 'cancelado',
): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    const [desafio] = await tx.select().from(desafios).where(eq(desafios.id, desafioId));
    if (!desafio) throw new DesafioIndisponivel();
    const [sala] = await tx.select().from(salas).where(eq(salas.id, desafio[lado]));
    if (!sala) throw new DesafioIndisponivel();
    if (sala.liderId !== lider.id) throw new SemPermissaoNaSala();
    const [alterado] = await tx
      .update(desafios)
      .set({ estado })
      .where(and(eq(desafios.id, desafioId), eq(desafios.estado, 'pendente')))
      .returning();
    if (!alterado) throw new DesafioIndisponivel();
  });
}

export function recusarDesafio(bd: Bd, lider: Pick<Usuario, 'id'>, desafioId: string): Promise<void> {
  return encerrarDesafio(bd, lider, desafioId, 'salaAlvoId', 'recusado');
}

export function cancelarDesafio(bd: Bd, lider: Pick<Usuario, 'id'>, desafioId: string): Promise<void> {
  return encerrarDesafio(bd, lider, desafioId, 'salaOrigemId', 'cancelado');
}

export async function desafiosDaSala(bd: Bd, salaId: string, agora: Date = new Date()): Promise<DesafioDaSala[]> {
  const pendentes = await bd
    .select()
    .from(desafios)
    .where(and(eq(desafios.estado, 'pendente'), gt(desafios.expiraEm, agora), envolveAsSalas([salaId])))
    .orderBy(asc(desafios.criadoEm));
  if (pendentes.length === 0) return [];

  const outraSala = (desafio: Desafio) => (desafio.salaAlvoId === salaId ? desafio.salaOrigemId : desafio.salaAlvoId);
  const nomes = await bd
    .select({ id: salas.id, nome: salas.nome })
    .from(salas)
    .where(inArray(salas.id, pendentes.map(outraSala)));
  return pendentes.flatMap((desafio) => {
    const outra = nomes.find((sala) => sala.id === outraSala(desafio));
    if (!outra) return [];
    return [
      {
        id: desafio.id,
        expiraEm: desafio.expiraEm,
        recebido: desafio.salaAlvoId === salaId,
        outraSalaId: outra.id,
        outraSalaNome: outra.nome,
      },
    ];
  });
}
