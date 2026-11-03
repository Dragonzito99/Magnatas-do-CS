import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, salas, servidores, usuarios, type Partida, type Servidor } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import { ESTADOS_ATIVOS_DE_PARTIDA, type Transacao } from './disponibilidade';

export const MAPAS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_dust2', 'de_overpass'] as const;

const JOGADORES_POR_TIME = 5;
const MAIOR_NUMERO_DE_PARTIDA = 2_147_483_647;

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

export async function criarServidor(bd: Bd, dados: { nome: string; host: string; porta: number }): Promise<Servidor> {
  return bd.transaction(async (tx) => {
    const [existente] = await tx
      .select()
      .from(servidores)
      .where(and(eq(servidores.host, dados.host), eq(servidores.porta, dados.porta)));
    if (existente) {
      const [atualizado] = await tx.update(servidores).set({ nome: dados.nome }).where(eq(servidores.id, existente.id)).returning();
      return atualizado;
    }
    const [novo] = await tx.insert(servidores).values(dados).returning();
    return novo;
  });
}

async function reservarServidor(bd: Bd, ignorar: string[]): Promise<{ partida: Partida; servidor: Servidor } | null> {
  return bd.transaction(async (tx) => {
    const [partida] = await tx
      .select()
      .from(partidas)
      .where(eq(partidas.estado, 'aguardando_servidor'))
      .orderBy(asc(partidas.numero))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!partida) return null;
    const [servidor] = await tx
      .select()
      .from(servidores)
      .where(and(eq(servidores.ativo, true), isNull(servidores.partidaId), notInArray(servidores.id, ignorar)))
      .orderBy(asc(servidores.criadoEm), asc(servidores.id))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!servidor) return null;
    await tx
      .update(partidas)
      .set({ estado: 'carregando', servidorId: servidor.id, estadoDesde: new Date() })
      .where(eq(partidas.id, partida.id));
    await tx.update(servidores).set({ partidaId: partida.id }).where(eq(servidores.id, servidor.id));
    return { partida, servidor };
  });
}

async function devolverPartida(bd: Bd, partidaId: string, servidorId: string): Promise<void> {
  await bd.transaction(async (tx) => {
    await tx
      .update(partidas)
      .set({ estado: 'aguardando_servidor', servidorId: null, estadoDesde: new Date() })
      .where(and(eq(partidas.id, partidaId), eq(partidas.estado, 'carregando')));
    await tx
      .update(servidores)
      .set({ partidaId: null })
      .where(and(eq(servidores.id, servidorId), eq(servidores.partidaId, partidaId)));
  });
}

/** Chamada fora de qualquer transação, porque espera a resposta do servidor de jogo. */
export async function alocarServidores(bd: Bd, controlador: ControladorServidor): Promise<void> {
  // Quem falhou fica de fora só nesta rodada, para a partida tentar o próximo servidor.
  const comFalha: string[] = [];
  for (;;) {
    const reserva = await reservarServidor(bd, comFalha);
    if (!reserva) return;
    try {
      await controlador.carregarPartida(reserva.servidor, reserva.partida.numero);
    } catch (erro) {
      console.error(`Servidor ${reserva.servidor.nome} não carregou a partida ${reserva.partida.numero}:`, erro);
      await devolverPartida(bd, reserva.partida.id, reserva.servidor.id);
      comFalha.push(reserva.servidor.id);
    }
  }
}

export async function configDaPartida(bd: Bd, numero: number): Promise<object | null> {
  const [partida] = await bd
    .select()
    .from(partidas)
    .where(and(eq(partidas.numero, numero), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])));
  if (!partida) return null;

  const jogadores = await bd
    .select({ id: usuarios.id, time: partidaJogadores.time, steamid64: usuarios.steamid64, apelido: usuarios.apelido })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(eq(partidaJogadores.partidaId, partida.id));
  const equipe = await bd
    .select({ steamid64: usuarios.steamid64, apelido: usuarios.apelido })
    .from(usuarios)
    .where(and(inArray(usuarios.papel, ['gm', 'adm']), eq(usuarios.estado, 'ativo')));
  const salasDaPartida = await bd.select().from(salas).where(eq(salas.partidaId, partida.id));

  const quemJoga = new Set(jogadores.map((jogador) => jogador.steamid64));
  const time = (numeroDoTime: number) => {
    const doTime = jogadores.filter((jogador) => jogador.time === numeroDoTime);
    const sala = salasDaPartida.find((linha) => doTime.some((jogador) => jogador.id === linha.liderId));
    return {
      name: sala?.nome ?? `Time ${numeroDoTime}`,
      players: Object.fromEntries(doTime.map((jogador) => [jogador.steamid64, jogador.apelido])),
    };
  };

  return {
    matchid: partida.numero,
    maplist: [partida.mapa],
    num_maps: 1,
    players_per_team: JOGADORES_POR_TIME,
    min_players_to_ready: JOGADORES_POR_TIME,
    skip_veto: true,
    team1: time(1),
    team2: time(2),
    spectators: {
      players: Object.fromEntries(
        equipe.filter((conta) => !quemJoga.has(conta.steamid64)).map((conta) => [conta.steamid64, conta.apelido]),
      ),
    },
  };
}

export async function respostaDaConfig(
  bd: Bd,
  numero: string,
  cabecalho: string | null,
  tokenEsperado: string | undefined,
): Promise<Response> {
  if (!tokenConfere(cabecalho, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  const valor = /^\d+$/.test(numero) ? Number(numero) : NaN;
  const config = valor <= MAIOR_NUMERO_DE_PARTIDA ? await configDaPartida(bd, valor) : null;
  if (!config) return new Response('Partida não encontrada.', { status: 404 });
  return Response.json(config, { headers: { 'Cache-Control': 'no-store' } });
}
