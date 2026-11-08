import { asc, eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, series, type Partida, type Serie } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { criarPartida } from './partidas';

const MAPAS_PARA_VENCER = 2;

/**
 * Chamada quando um mapa de uma MD3 termina. Soma o mapa na série e, se ninguém chegou a 2 e ainda há mapa,
 * cria a partida do mapa seguinte com os mesmos 10, presa ao mesmo servidor. Devolve essa nova partida.
 */
export async function avancarSerie(
  tx: Transacao,
  partida: Partida,
  vencedor: number | null,
  estado: 'encerrada' | 'cancelada',
  agora: Date,
): Promise<Partida | null> {
  if (!partida.serieId) return null;
  const [serie] = await tx.select().from(series).where(eq(series.id, partida.serieId)).for('update');
  if (!serie || serie.estado !== 'em_andamento') return null;

  if (estado === 'cancelada') {
    await tx.update(series).set({ estado: 'cancelada', vencedor: null }).where(eq(series.id, serie.id));
    return null;
  }

  const vitorias1 = serie.vitorias1 + (vencedor === 1 ? 1 : 0);
  const vitorias2 = serie.vitorias2 + (vencedor === 2 ? 1 : 0);
  const mapa = partida.mapaDaSerie ?? 1;
  const acabou = vitorias1 >= MAPAS_PARA_VENCER || vitorias2 >= MAPAS_PARA_VENCER || mapa >= serie.mapas.length;
  if (acabou) {
    const ganhou = vitorias1 > vitorias2 ? 1 : vitorias2 > vitorias1 ? 2 : null;
    await tx.update(series).set({ vitorias1, vitorias2, estado: 'encerrada', vencedor: ganhou }).where(eq(series.id, serie.id));
    return null;
  }

  await tx.update(series).set({ vitorias1, vitorias2 }).where(eq(series.id, serie.id));
  const jogadores = await tx.select({ usuarioId: partidaJogadores.usuarioId, time: partidaJogadores.time }).from(partidaJogadores).where(eq(partidaJogadores.partidaId, partida.id));
  return criarPartida(tx, {
    tipo: partida.tipo,
    time1: jogadores.filter((jogador) => jogador.time === 1).map((jogador) => jogador.usuarioId),
    time2: jogadores.filter((jogador) => jogador.time === 2).map((jogador) => jogador.usuarioId),
    mapa: serie.mapas[mapa],
    agora,
    nomes: { 1: partida.nomeTime1 ?? 'Time 1', 2: partida.nomeTime2 ?? 'Time 2' },
    clas: { 1: partida.claTime1Id, 2: partida.claTime2Id },
    mapas: 3,
    serie: { id: serie.id, mapa: mapa + 1, servidorPreferidoId: partida.servidorId },
  });
}

export type MapaDaSerie = Pick<Partida, 'id' | 'mapaDaSerie' | 'mapa' | 'placar1' | 'placar2' | 'vencedor' | 'estado'>;

/** A série de uma partida da MD3 e os mapas já criados, para a tela mostrar "Mapa 2 de 3". */
export async function serieDaPartida(bd: Bd, partidaId: string): Promise<{ serie: Serie; partidas: MapaDaSerie[] } | null> {
  const [partida] = await bd.select({ serieId: partidas.serieId }).from(partidas).where(eq(partidas.id, partidaId));
  if (!partida?.serieId) return null;
  const [serie] = await bd.select().from(series).where(eq(series.id, partida.serieId));
  if (!serie) return null;
  const mapas = await bd
    .select({ id: partidas.id, mapaDaSerie: partidas.mapaDaSerie, mapa: partidas.mapa, placar1: partidas.placar1, placar2: partidas.placar2, vencedor: partidas.vencedor, estado: partidas.estado })
    .from(partidas)
    .where(eq(partidas.serieId, serie.id))
    .orderBy(asc(partidas.mapaDaSerie));
  return { serie, partidas: mapas };
}
