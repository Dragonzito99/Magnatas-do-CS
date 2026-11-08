import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidaJogadores, partidas, salas, servidores, usuarios, xpPartidas, type Papel, type Partida, type Sala, type Servidor } from '@/bd/esquema';
import type { ControladorServidor, ServidorAlvo } from '@/servidor-jogo/controlador';
import { PRAZO_DO_ACEITE_MS } from './aceites';
import { ESTADOS_ATIVOS_DE_PARTIDA, type Transacao } from './disponibilidade';
import { situacaoDaGravacao, type SituacaoDaGravacao } from './ficha';
import { lancarXp } from './xp';

export const MAPAS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_dust2', 'de_overpass'] as const;

const JOGADORES_POR_TIME = 5;
const MAIOR_NUMERO_DE_PARTIDA = 2_147_483_647;
const ESPERA_DA_GRAVACAO_NO_SERVIDOR_MS = 5 * 60_000;
const RODADAS_PERDOADAS_POR_QUEDA = 2;

/**
 * Sem mapa, a partida nasce esperando os 10 aceitarem em 30 segundos; o mapa vem dos vetos ou do sorteio.
 * Com mapa, nasce pronta para o servidor: é o caminho dos testes e de uma partida montada pela equipe.
 */
export async function criarPartida(
  tx: Transacao,
  dados: {
    tipo: Partida['tipo'];
    time1: string[];
    time2: string[];
    mapa?: string;
    agora?: Date;
    filaDoMix?: Map<string, Date>;
    nomes?: { 1: string; 2: string };
    clas?: { 1: string | null; 2: string | null };
    mapas?: 1 | 3;
    serie?: { id: string; mapa: number; servidorPreferidoId: string | null };
  },
): Promise<Partida> {
  const agora = dados.agora ?? new Date();
  const extras = {
    claTime1Id: dados.clas?.[1] ?? null,
    claTime2Id: dados.clas?.[2] ?? null,
    mapasDaPartida: dados.mapas ?? 1,
    serieId: dados.serie?.id ?? null,
    mapaDaSerie: dados.serie?.mapa ?? null,
    servidorPreferidoId: dados.serie?.servidorPreferidoId ?? null,
  };
  const [partida] = await tx
    .insert(partidas)
    .values(
      dados.mapa
        ? { tipo: dados.tipo, mapa: dados.mapa, criadoEm: agora, estadoDesde: agora, nomeTime1: dados.nomes?.[1], nomeTime2: dados.nomes?.[2], ...extras }
        : {
            ...extras,
            tipo: dados.tipo,
            mapa: null,
            estado: 'aguardando_aceite',
            aceiteAte: new Date(agora.getTime() + PRAZO_DO_ACEITE_MS),
            criadoEm: agora,
            estadoDesde: agora,
            nomeTime1: dados.nomes?.[1],
            nomeTime2: dados.nomes?.[2],
          },
    )
    .returning();
  const jogadores = [
    ...dados.time1.map((usuarioId) => ({ partidaId: partida.id, usuarioId, time: 1, entrouNaFilaEm: dados.filaDoMix?.get(usuarioId) ?? null })),
    ...dados.time2.map((usuarioId) => ({ partidaId: partida.id, usuarioId, time: 2, entrouNaFilaEm: dados.filaDoMix?.get(usuarioId) ?? null })),
  ];
  await tx.insert(partidaJogadores).values(jogadores);
  return partida;
}

/** Encerra a partida e devolve o servidor e as salas, que voltam a poder jogar. */
export async function finalizarPartida(
  tx: Transacao,
  partidaId: string,
  resultado: { estado: 'encerrada' | 'cancelada'; vencedor: number | null; motivoDoCancelamento?: Partida['motivoDoCancelamento'] },
): Promise<void> {
  const agora = new Date();
  await tx
    .update(partidas)
    .set({ ...resultado, encerradaEm: agora, estadoDesde: agora })
    .where(eq(partidas.id, partidaId));
  await tx.update(servidores).set({ partidaId: null }).where(eq(servidores.partidaId, partidaId));
  await tx.update(salas).set({ partidaId: null }).where(eq(salas.partidaId, partidaId));
  if (resultado.estado === 'encerrada') await lancarXpDaPartida(tx, partidaId, resultado.vencedor);
}

/** O servidor só envia os números de quem está conectado, então quem saiu fica com menos rodadas que a partida. */
export function jogouAteOFim(rodadas: number, totalDeRodadas: number): boolean {
  return rodadas > 0 && rodadas >= totalDeRodadas - RODADAS_PERDOADAS_POR_QUEDA;
}

async function lancarXpDaPartida(tx: Transacao, partidaId: string, vencedor: number | null): Promise<void> {
  const [partida] = await tx.select().from(partidas).where(eq(partidas.id, partidaId));
  const jogadores = await tx
    .select({ usuarioId: partidaJogadores.usuarioId, time: partidaJogadores.time, kills: partidaJogadores.kills, rodadas: partidaJogadores.rodadas })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(and(eq(partidaJogadores.partidaId, partidaId), eq(usuarios.estado, 'ativo')));
  const totalDeRodadas = partida.placar1 + partida.placar2;
  await lancarXp(
    tx,
    jogadores.map((jogador) => ({
      usuarioId: jogador.usuarioId,
      origem: 'partida',
      referencia: partidaId,
      abates: jogador.kills,
      resultado: vencedor === null ? 'empate' : jogador.time === vencedor ? 'vitoria' : 'derrota',
      jogouAteOFim: jogouAteOFim(jogador.rodadas, totalDeRodadas),
    })),
  );
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

async function reservarServidor(bd: Bd, ignorar: string[], agora: Date): Promise<{ partida: Partida; servidor: Servidor } | null> {
  return bd.transaction(async (tx) => {
    const [partida] = await tx
      .select()
      .from(partidas)
      .where(eq(partidas.estado, 'aguardando_servidor'))
      .orderBy(asc(partidas.numero))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!partida) return null;
    // A gravação chega minutos depois do fim, e é a prova: carregar outra partida antes pode cortar o envio.
    const esperandoGravacao = await tx
      .select({ id: partidas.servidorId })
      .from(partidas)
      .leftJoin(gravacoes, eq(gravacoes.partidaId, partidas.id))
      .where(
        and(
          eq(partidas.estado, 'encerrada'),
          isNotNull(partidas.servidorId),
          isNull(gravacoes.id),
          gt(partidas.encerradaEm, new Date(agora.getTime() - ESPERA_DA_GRAVACAO_NO_SERVIDOR_MS)),
        ),
      );
    const foraDaVez = [...ignorar, ...esperandoGravacao.flatMap((linha) => (linha.id ? [linha.id] : []))];
    const [servidor] = await tx
      .select()
      .from(servidores)
      .where(and(eq(servidores.ativo, true), isNull(servidores.partidaId), notInArray(servidores.id, foraDaVez)))
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

export async function devolverPartida(bd: Bd, partidaId: string, servidorId: string | null): Promise<void> {
  await bd.transaction(async (tx) => {
    const devolvidas = await tx
      .update(partidas)
      .set({ estado: 'aguardando_servidor', servidorId: null, estadoDesde: new Date() })
      .where(and(eq(partidas.id, partidaId), eq(partidas.estado, 'carregando')))
      .returning({ id: partidas.id });
    // Se a partida já avançou enquanto o comando falhava, o servidor continua sendo dela.
    if (devolvidas.length === 0 || !servidorId) return;
    await tx
      .update(servidores)
      .set({ partidaId: null })
      .where(and(eq(servidores.id, servidorId), eq(servidores.partidaId, partidaId)));
  });
}

/** Chamada fora de qualquer transação, porque espera a resposta do servidor de jogo. */
export async function alocarServidores(bd: Bd, controlador: ControladorServidor, agora: Date = new Date()): Promise<void> {
  // Quem falhou fica de fora só nesta rodada, para a partida tentar o próximo servidor.
  const comFalha: string[] = [];
  for (;;) {
    const reserva = await reservarServidor(bd, comFalha, agora);
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

export async function configDaPartida(bd: Bd, numero: number, minimoDeProntos: number = JOGADORES_POR_TIME): Promise<object | null> {
  const [partida] = await bd
    .select()
    .from(partidas)
    .where(and(eq(partidas.numero, numero), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])));
  // Sem mapa a partida ainda está no aceite ou nos vetos, e o servidor não tem o que carregar.
  if (!partida || !partida.mapa) return null;

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
    min_players_to_ready: minimoDeProntos,
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

export async function partidaAtualDe(bd: Bd, usuarioId: string): Promise<Partida | null> {
  const [linha] = await bd
    .select({ partida: partidas })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .where(and(eq(partidaJogadores.usuarioId, usuarioId), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])));
  return linha?.partida ?? null;
}

export async function partidasEmAndamento(bd: Bd): Promise<Partida[]> {
  return bd
    .select()
    .from(partidas)
    .where(inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA]))
    .orderBy(desc(partidas.numero));
}

export type JogadorDaPartida = {
  id: string;
  apelido: string;
  avatarUrl: string | null;
  time: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  rodadas: number;
  headshotKills: number;
  mvps: number;
  kast: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  xp: number | null;
  xpTotal: number;
};

/** A sala de cada time, para a página mostrar o nome e saber quem é o líder que veta. */
export type SalasDaPartida = { 1?: Pick<Sala, 'id' | 'nome' | 'liderId'>; 2?: Pick<Sala, 'id' | 'nome' | 'liderId'> };

export async function detalheDaPartida(
  bd: Bd,
  id: string,
): Promise<{ partida: Partida; servidor: Servidor | null; jogadores: JogadorDaPartida[]; salasDaPartida: SalasDaPartida } | null> {
  const [partida] = await bd.select().from(partidas).where(eq(partidas.id, id));
  if (!partida) return null;
  const [servidor] = partida.servidorId ? await bd.select().from(servidores).where(eq(servidores.id, partida.servidorId)) : [];
  const jogadores = await bd
    .select({
      id: usuarios.id,
      apelido: usuarios.apelido,
      avatarUrl: usuarios.avatarUrl,
      time: partidaJogadores.time,
      kills: partidaJogadores.kills,
      deaths: partidaJogadores.deaths,
      assists: partidaJogadores.assists,
      damage: partidaJogadores.damage,
      rodadas: partidaJogadores.rodadas,
      headshotKills: partidaJogadores.headshotKills,
      mvps: partidaJogadores.mvps,
      kast: partidaJogadores.kast,
      k1: partidaJogadores.k1,
      k2: partidaJogadores.k2,
      k3: partidaJogadores.k3,
      k4: partidaJogadores.k4,
      k5: partidaJogadores.k5,
      xp: xpPartidas.xp,
      xpTotal: usuarios.xpTotal,
    })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .leftJoin(xpPartidas, and(eq(xpPartidas.usuarioId, usuarios.id), eq(xpPartidas.referencia, id)))
    .where(eq(partidaJogadores.partidaId, id))
    .orderBy(desc(partidaJogadores.kills), asc(usuarios.apelido));
  const salasLigadas = await bd.select({ id: salas.id, nome: salas.nome, liderId: salas.liderId }).from(salas).where(eq(salas.partidaId, id));
  const salasDaPartida: SalasDaPartida = {};
  for (const sala of salasLigadas) {
    const lider = jogadores.find((jogador) => jogador.id === sala.liderId);
    if (lider?.time === 1 || lider?.time === 2) salasDaPartida[lider.time] = sala;
  }
  return { partida, servidor: servidor ?? null, jogadores, salasDaPartida };
}

/** Quem da partida já está no servidor, para a tela de entrar. Servidor fora do ar conta como ninguém. */
export async function quemEntrouNoServidor(bd: Bd, controlador: ControladorServidor, servidor: ServidorAlvo | null, ids: string[]): Promise<Set<string>> {
  if (!servidor || ids.length === 0) return new Set();
  const conectados = await controlador.jogadoresConectados(servidor).catch(() => [] as string[]);
  if (conectados.length === 0) return new Set();
  const linhas = await bd
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(inArray(usuarios.steamid64, conectados), inArray(usuarios.id, ids)));
  return new Set(linhas.map((linha) => linha.id));
}

/** A gravação da partida, para o botão de baixar no fim. */
export async function gravacaoDaPartida(
  bd: Bd,
  partida: Pick<Partida, 'id' | 'encerradaEm'>,
  agora: Date = new Date(),
): Promise<{ situacao: SituacaoDaGravacao; id?: string }> {
  const [gravacao] = await bd.select({ id: gravacoes.id, apagadaEm: gravacoes.apagadaEm }).from(gravacoes).where(eq(gravacoes.partidaId, partida.id));
  const situacao = situacaoDaGravacao(partida, gravacao ?? null, agora);
  return situacao === 'disponivel' ? { situacao, id: gravacao.id } : { situacao };
}

const ESTADOS_COM_SERVIDOR_PRONTO: Partida['estado'][] = ['aguardando_jogadores', 'ao_vivo'];

/** A senha do servidor só aparece para quem joga a partida e para a equipe, e só com o servidor pronto. */
export function dadosDeConexao(
  partida: Pick<Partida, 'estado'>,
  servidor: Pick<Servidor, 'host' | 'porta'> | null,
  usuario: { papel: Papel; jogaNaPartida: boolean },
  senha: string,
): { url: string } | null {
  if (!servidor || !ESTADOS_COM_SERVIDOR_PRONTO.includes(partida.estado)) return null;
  if (!usuario.jogaNaPartida && usuario.papel === 'jogador') return null;
  return { url: `steam://connect/${servidor.host}:${servidor.porta}/${encodeURIComponent(senha)}` };
}

export async function respostaDaConfig(
  bd: Bd,
  numero: string,
  cabecalho: string | null,
  tokenEsperado: string | undefined,
): Promise<Response> {
  if (!tokenConfere(cabecalho, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  const valor = /^\d+$/.test(numero) ? Number(numero) : NaN;
  // Só para testar sem 10 pessoas: em produção essa variável não existe, e valem os 5 por time.
  const minimoDeProntos = Number(process.env.PARTIDA_MIN_PRONTOS) || undefined;
  const config = valor <= MAIOR_NUMERO_DE_PARTIDA ? await configDaPartida(bd, valor, minimoDeProntos) : null;
  if (!config) return new Response('Partida não encontrada.', { status: 404 });
  return Response.json(config, { headers: { 'Cache-Control': 'no-store' } });
}
