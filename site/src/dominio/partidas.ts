import { partidaJogadores, partidas, type Partida } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';

export const MAPAS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_dust2', 'de_overpass'] as const;

export async function criarPartida(
  tx: Transacao,
  dados: { tipo: Partida['tipo']; time1: string[]; time2: string[]; mapa?: string },
): Promise<Partida> {
  const mapa = dados.mapa ?? MAPAS[Math.floor(Math.random() * MAPAS.length)];
  const [partida] = await tx.insert(partidas).values({ tipo: dados.tipo, mapa }).returning();
  const jogadores = [
    ...dados.time1.map((usuarioId) => ({ partidaId: partida.id, usuarioId, time: 1 })),
    ...dados.time2.map((usuarioId) => ({ partidaId: partida.id, usuarioId, time: 2 })),
  ];
  await tx.insert(partidaJogadores).values(jogadores);
  return partida;
}
