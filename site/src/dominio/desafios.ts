import { and, asc, eq, gt, inArray, lte, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, desafios, salaMembros, salas, usuarios, type Desafio, type Partida, type Sala, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
import { criarPartida } from './partidas';
import { SemPermissaoNaSala, TAMANHO_DA_SALA } from './salas';
import { exigirServidoresNoAr } from './manutencao';

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

export type DesafioDaSala = Pick<Desafio, 'id' | 'expiraEm' | 'formato'> & {
  mapas: 1 | 3;
  recebido: boolean;
  outraSalaId: string;
  outraSalaNome: string;
  outroClaSigla: string | null;
};

export type FormatoDoDesafio = { formato: Desafio['formato']; mapas: 1 | 3 };
const COMUM: FormatoDoDesafio = { formato: 'comum', mapas: 1 };

type ClaDaSala = { id: string; nome: string; sigla: string } | null;

/** A sala vale como clã com os 5 do mesmo clã e o líder Dono ou Capitão dele. */
async function claDaSala(tx: Bd | Transacao, salaId: string): Promise<ClaDaSala> {
  const [sala] = await tx.select().from(salas).where(eq(salas.id, salaId));
  if (!sala) return null;
  const linhas = await tx
    .select({ usuarioId: salaMembros.usuarioId, claId: claMembros.claId, cargo: claMembros.cargo, nome: clas.nome, sigla: clas.sigla })
    .from(salaMembros)
    .leftJoin(claMembros, eq(claMembros.usuarioId, salaMembros.usuarioId))
    .leftJoin(clas, eq(clas.id, claMembros.claId))
    .where(eq(salaMembros.salaId, salaId));
  const primeiro = linhas[0];
  if (linhas.length !== TAMANHO_DA_SALA || !primeiro?.claId || linhas.some((linha) => linha.claId !== primeiro.claId)) return null;
  const lider = linhas.find((linha) => linha.usuarioId === sala.liderId);
  if (!lider || lider.cargo === 'membro') return null;
  return { id: primeiro.claId, nome: primeiro.nome!, sigla: primeiro.sigla! };
}

/** O que uma sala pode propor à outra: o desafio comum sempre; clã x clã ou treino quando as duas são de clã. */
export async function opcoesDeDesafio(bd: Bd | Transacao, salaOrigemId: string, salaAlvoId: string): Promise<Desafio['formato'][]> {
  const [origem, alvo] = [await claDaSala(bd, salaOrigemId), await claDaSala(bd, salaAlvoId)];
  if (!origem || !alvo) return ['comum'];
  return origem.id === alvo.id ? ['comum', 'treino'] : ['comum', 'cla'];
}

async function exigirFormato(tx: Transacao, salaOrigemId: string, salaAlvoId: string, escolha: FormatoDoDesafio): Promise<void> {
  if (escolha.mapas !== 1 && escolha.mapas !== 3) throw new DesafioIndisponivel();
  if (escolha.formato === 'comum' && escolha.mapas !== 1) throw new DesafioIndisponivel();
  if (!(await opcoesDeDesafio(tx, salaOrigemId, salaAlvoId)).includes(escolha.formato)) throw new DesafioIndisponivel();
}

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
  escolha: FormatoDoDesafio = COMUM,
): Promise<Desafio> {
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, lider);
    await exigirServidoresNoAr(tx);
    const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, lider.id));
    if (!vinculo) throw new SemPermissaoNaSala();

    const travadas = await travarSalas(tx, [vinculo.salaId, salaAlvoId]);
    const origem = travadas.find((sala) => sala.id === vinculo.salaId);
    const alvo = travadas.find((sala) => sala.id === salaAlvoId);
    if (!origem || origem.liderId !== lider.id) throw new SemPermissaoNaSala();
    if (!alvo || origem.id === alvo.id || origem.partidaId || alvo.partidaId) throw new DesafioIndisponivel();

    await exigirCompleta(tx, origem.id);
    await exigirCompleta(tx, alvo.id);
    await exigirFormato(tx, origem.id, alvo.id, escolha);

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
      .values({ salaOrigemId: origem.id, salaAlvoId: alvo.id, expiraEm: new Date(agora.getTime() + PRAZO_DO_DESAFIO_MS), formato: escolha.formato, mapas: escolha.mapas })
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
    await exigirServidoresNoAr(tx);
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
    const nomesDasSalas = { 1: origem?.nome ?? 'Time 1', 2: alvo.nome };
    if (desafio.formato === 'comum') {
      const partida = await criarPartida(tx, { tipo: 'desafio', time1, time2, agora, nomes: nomesDasSalas });
      await tx.update(salas).set({ partidaId: partida.id }).where(inArray(salas.id, ids));
      return partida;
    }
    // Alguém pode ter saído do clã ou trocado de sala desde o desafio: confere de novo.
    await exigirFormato(tx, desafio.salaOrigemId, desafio.salaAlvoId, { formato: desafio.formato, mapas: desafio.mapas as 1 | 3 });
    const [claOrigem, claAlvo] = [await claDaSala(tx, desafio.salaOrigemId), await claDaSala(tx, desafio.salaAlvoId)];
    // No treino os dois lados são do mesmo clã: o nome da sala diferencia melhor que a sigla.
    const nomes = desafio.formato === 'cla' ? { 1: `[${claOrigem!.sigla}] ${claOrigem!.nome}`, 2: `[${claAlvo!.sigla}] ${claAlvo!.nome}` } : nomesDasSalas;
    const partida = await criarPartida(tx, {
      tipo: desafio.formato,
      time1,
      time2,
      agora,
      nomes,
      clas: { 1: claOrigem!.id, 2: claAlvo!.id },
      mapas: desafio.mapas as 1 | 3,
    });
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
  const siglas = new Map<string, string>();
  for (const desafio of pendentes) {
    if (desafio.formato === 'comum') continue;
    const cla = await claDaSala(bd, outraSala(desafio));
    if (cla) siglas.set(outraSala(desafio), cla.sigla);
  }
  return pendentes.flatMap((desafio) => {
    const outra = nomes.find((sala) => sala.id === outraSala(desafio));
    if (!outra) return [];
    return [
      {
        id: desafio.id,
        expiraEm: desafio.expiraEm,
        formato: desafio.formato,
        mapas: desafio.mapas as 1 | 3,
        recebido: desafio.salaAlvoId === salaId,
        outraSalaId: outra.id,
        outraSalaNome: outra.nome,
        outroClaSigla: siglas.get(outra.id) ?? null,
      },
    ];
  });
}
