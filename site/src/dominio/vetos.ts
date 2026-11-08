import { randomInt } from 'node:crypto';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, salas, series, vetos, type Partida, type Usuario, type Veto } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { MAPAS } from './partidas';
import { SemPermissaoNaSala } from './salas';

/** Cada líder tem 20 segundos para vetar um mapa. Passou, o site veta um por ele. */
export const PRAZO_DO_VETO_MS = 20_000;

export class VetoIndisponivel extends Error {
  constructor() {
    super('Este veto não vale agora: não é a sua vez, o mapa já saiu ou o prazo acabou.');
  }
}

type Time = 1 | 2;

type Acao = Veto['acao'];

/** Na MD3, o jeito comum do CS: cada time veta um, cada um escolhe um, cada um veta mais um, e o que sobra é o desempate. */
export const ACOES_DA_MD3 = ['veta', 'veta', 'escolhe', 'escolhe', 'veta', 'veta'] as const;

export function acaoDaVez(mapas: number, feitos: number): Acao {
  return mapas === 3 ? (ACOES_DA_MD3[feitos] ?? 'veta') : 'veta';
}

/** Quem ganhou o cara ou coroa veta primeiro, e depois vai alternando. */
export function vezDeVetar(primeiro: Time, vetosFeitos: number): Time {
  return vetosFeitos % 2 === 0 ? primeiro : primeiro === 1 ? 2 : 1;
}

async function travarPartida(tx: Transacao, partidaId: string): Promise<Partida | undefined> {
  const [partida] = await tx.select().from(partidas).where(eq(partidas.id, partidaId)).for('update');
  return partida;
}

async function vetadosDe(tx: Bd | Transacao, partidaId: string) {
  return tx.select().from(vetos).where(eq(vetos.partidaId, partidaId)).orderBy(asc(vetos.ordem));
}

/** O líder vale pelo que a sala diz agora: se a liderança mudou no meio dos vetos, o novo líder veta. */
async function timeDoLider(tx: Transacao, partidaId: string, liderId: string): Promise<Time | null> {
  const [sala] = await tx.select().from(salas).where(and(eq(salas.partidaId, partidaId), eq(salas.liderId, liderId)));
  if (!sala) return null;
  const [vaga] = await tx
    .select({ time: partidaJogadores.time })
    .from(partidaJogadores)
    .where(and(eq(partidaJogadores.partidaId, partidaId), eq(partidaJogadores.usuarioId, liderId)));
  return vaga?.time === 1 || vaga?.time === 2 ? vaga.time : null;
}

export async function vetarMapa(bd: Bd, lider: Pick<Usuario, 'id'>, partidaId: string, mapa: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    const partida = await travarPartida(tx, partidaId);
    if (!partida || partida.estado !== 'vetando' || !partida.vetoAte || partida.vetoAte <= agora) throw new VetoIndisponivel();
    const time = await timeDoLider(tx, partidaId, lider.id);
    if (!time) throw new SemPermissaoNaSala();
    const feitos = await vetadosDe(tx, partidaId);
    if (vezDeVetar(partida.primeiroAVetar as Time, feitos.length) !== time) throw new VetoIndisponivel();
    if (!(MAPAS as readonly string[]).includes(mapa) || feitos.some((veto) => veto.mapa === mapa)) throw new VetoIndisponivel();
    await registrarVeto(tx, partida, feitos.length + 1, time, mapa, false, agora);
  });
}

async function registrarVeto(tx: Transacao, partida: Partida, ordem: number, time: Time, mapa: string, automatico: boolean, agora: Date): Promise<void> {
  const acao = acaoDaVez(partida.mapasDaPartida, ordem - 1);
  await tx.insert(vetos).values({ partidaId: partida.id, ordem, time, mapa, automatico, acao, criadoEm: agora });
  const restantes = MAPAS.length - ordem;
  if (restantes > 1) {
    await tx.update(partidas).set({ vetoAte: new Date(agora.getTime() + PRAZO_DO_VETO_MS) }).where(eq(partidas.id, partida.id));
    return;
  }
  const feitos = await vetadosDe(tx, partida.id);
  const usados = new Set(feitos.map((veto) => veto.mapa));
  const sobrou = MAPAS.find((candidato) => !usados.has(candidato))!;
  if (partida.mapasDaPartida !== 3) {
    await tx
      .update(partidas)
      .set({ mapa: sobrou, estado: 'aguardando_servidor', vetoAte: null, estadoDesde: agora })
      .where(eq(partidas.id, partida.id));
    return;
  }
  // MD3: os dois escolhidos, na ordem, e a sobra como desempate. A primeira partida já é o mapa 1 da série.
  const escolhidos = feitos.filter((veto) => veto.acao === 'escolhe').map((veto) => veto.mapa);
  const [serie] = await tx
    .insert(series)
    .values({ mapas: [...escolhidos, sobrou], criadoEm: agora })
    .returning();
  await tx
    .update(partidas)
    .set({ mapa: escolhidos[0], serieId: serie.id, mapaDaSerie: 1, estado: 'aguardando_servidor', vetoAte: null, estadoDesde: agora })
    .where(eq(partidas.id, partida.id));
}

/** O líder deixou os 20 segundos passarem: o site veta um mapa aleatório no lugar dele. */
export async function resolverVetosVencidos(bd: Bd, agora: Date = new Date()): Promise<void> {
  const vencidas = await bd
    .select({ id: partidas.id })
    .from(partidas)
    .where(and(eq(partidas.estado, 'vetando'), lte(partidas.vetoAte, agora)));
  for (const { id } of vencidas) {
    await bd.transaction(async (tx) => {
      const partida = await travarPartida(tx, id);
      if (!partida || partida.estado !== 'vetando' || !partida.vetoAte || partida.vetoAte > agora) return;
      const feitos = await vetadosDe(tx, id);
      const vetados = new Set(feitos.map((veto) => veto.mapa));
      const restantes = MAPAS.filter((mapa) => !vetados.has(mapa));
      const time = vezDeVetar(partida.primeiroAVetar as Time, feitos.length);
      await registrarVeto(tx, partida, feitos.length + 1, time, restantes[randomInt(restantes.length)], true, agora);
    });
  }
}

export async function vetosDaPartida(
  bd: Bd,
  partidaId: string,
): Promise<{
  primeiroAVetar: Time;
  vez: Time | null;
  acaoDaVez: Acao | null;
  vetoAte: Date | null;
  vetados: { mapa: string; time: Time; automatico: boolean; acao: Acao }[];
  escolhidos: string[];
  restantes: string[];
}> {
  const [partida] = await bd.select().from(partidas).where(eq(partidas.id, partidaId));
  const feitos = await vetadosDe(bd, partidaId);
  const vetados = new Set(feitos.map((veto) => veto.mapa));
  const primeiro = (partida?.primeiroAVetar ?? 1) as Time;
  return {
    primeiroAVetar: primeiro,
    vez: partida?.estado === 'vetando' ? vezDeVetar(primeiro, feitos.length) : null,
    acaoDaVez: partida?.estado === 'vetando' ? acaoDaVez(partida.mapasDaPartida, feitos.length) : null,
    vetoAte: partida?.vetoAte ?? null,
    vetados: feitos.map((veto) => ({ mapa: veto.mapa, time: veto.time as Time, automatico: veto.automatico, acao: veto.acao })),
    escolhidos: feitos.filter((veto) => veto.acao === 'escolhe').map((veto) => veto.mapa),
    restantes: MAPAS.filter((mapa) => !vetados.has(mapa)),
  };
}
