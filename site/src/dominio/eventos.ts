import { and, eq, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, usuarios, type Partida } from '@/bd/esquema';
import { ESTADOS_ATIVOS_DE_PARTIDA, type Transacao } from './disponibilidade';
import { finalizarPartida } from './partidas';

// Um evento de verdade tem poucos KB. O limite impede que um pedido enorme ocupe a memória do site.
const LIMITE_DO_EVENTO_BYTES = 1024 * 1024;
const matchid = z.number().int().positive().max(2_147_483_647);
const inteiro = z.number().int();

const jogador = z.object({
  steamid: z.string(),
  stats: z.object({
    kills: inteiro,
    deaths: inteiro,
    assists: inteiro,
    damage: inteiro,
    headshot_kills: inteiro,
    rounds_played: inteiro,
    // Um servidor antigo pode não mandar estes; aí ficam em 0.
    mvp: inteiro.default(0),
    kast: inteiro.default(0),
    '1k': inteiro.default(0),
    '2k': inteiro.default(0),
    '3k': inteiro.default(0),
    '4k': inteiro.default(0),
    '5k': inteiro.default(0),
  }),
});

const placar = z.object({ score: inteiro });
const timeComJogadores = placar.extend({ players: z.array(jogador) });

const Evento = z.discriminatedUnion('event', [
  z.object({ event: z.literal('series_start'), matchid }),
  z.object({ event: z.literal('going_live'), matchid }),
  z.object({ event: z.literal('round_end'), matchid, team1: timeComJogadores, team2: timeComJogadores }),
  z.object({ event: z.literal('map_result'), matchid, team1: placar, team2: placar }),
  z.object({ event: z.literal('series_end'), matchid, winner: z.object({ team: z.enum(['team1', 'team2', 'none']) }) }),
]);

async function marcarAoVivo(tx: Transacao, partida: Partida): Promise<void> {
  if (partida.estado === 'ao_vivo') return;
  const agora = new Date();
  await tx
    .update(partidas)
    .set({ estado: 'ao_vivo', iniciadaEm: partida.iniciadaEm ?? agora, estadoDesde: agora })
    .where(eq(partidas.id, partida.id));
}

/** O placar nunca desce, para um evento atrasado não desfazer o que já chegou. */
async function atualizarPlacar(tx: Transacao, partida: Partida, placar1: number, placar2: number): Promise<void> {
  await tx
    .update(partidas)
    .set({ placar1: Math.max(partida.placar1, placar1), placar2: Math.max(partida.placar2, placar2) })
    .where(eq(partidas.id, partida.id));
}

/** Os números do MatchZy já são acumulados: cada evento substitui a linha, e o mais antigo não vale. */
async function gravarEstatisticas(tx: Transacao, partida: Partida, recebidos: z.infer<typeof jogador>[]): Promise<void> {
  if (recebidos.length === 0) return;
  const daPartida = await tx
    .select({ id: usuarios.id, steamid64: usuarios.steamid64 })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(
      and(
        eq(partidaJogadores.partidaId, partida.id),
        inArray(
          usuarios.steamid64,
          recebidos.map((linha) => linha.steamid),
        ),
      ),
    );
  for (const conta of daPartida) {
    const { stats } = recebidos.find((linha) => linha.steamid === conta.steamid64)!;
    await tx
      .update(partidaJogadores)
      .set({
        kills: stats.kills,
        deaths: stats.deaths,
        assists: stats.assists,
        damage: stats.damage,
        headshotKills: stats.headshot_kills,
        rodadas: stats.rounds_played,
        mvps: stats.mvp,
        kast: stats.kast,
        k1: stats['1k'],
        k2: stats['2k'],
        k3: stats['3k'],
        k4: stats['4k'],
        k5: stats['5k'],
      })
      .where(
        and(
          eq(partidaJogadores.partidaId, partida.id),
          eq(partidaJogadores.usuarioId, conta.id),
          lte(partidaJogadores.rodadas, stats.rounds_played),
        ),
      );
  }
}

export async function aplicarEvento(bd: Bd, evento: unknown): Promise<void> {
  const lido = Evento.safeParse(evento);
  if (!lido.success) return;
  const dados = lido.data;

  await bd.transaction(async (tx) => {
    // Só partida em andamento muda, e a trava faz os eventos dela passarem um de cada vez.
    const [partida] = await tx
      .select()
      .from(partidas)
      .where(and(eq(partidas.numero, dados.matchid), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])))
      .for('update');
    if (!partida) return;
    await tx.update(partidas).set({ ultimoEventoEm: new Date() }).where(eq(partidas.id, partida.id));

    switch (dados.event) {
      case 'series_start':
        if (partida.estado === 'carregando') {
          await tx
            .update(partidas)
            .set({ estado: 'aguardando_jogadores', estadoDesde: new Date() })
            .where(eq(partidas.id, partida.id));
        }
        break;
      case 'going_live':
        await marcarAoVivo(tx, partida);
        break;
      case 'round_end':
        await marcarAoVivo(tx, partida);
        await atualizarPlacar(tx, partida, dados.team1.score, dados.team2.score);
        await gravarEstatisticas(tx, partida, [...dados.team1.players, ...dados.team2.players]);
        break;
      case 'map_result':
        await atualizarPlacar(tx, partida, dados.team1.score, dados.team2.score);
        break;
      case 'series_end':
        // Antes de o servidor assumir a partida, o cancelamento só pode vir de limpar uma sobra dele.
        if (dados.winner.team === 'none' && (partida.estado === 'carregando' || partida.estado === 'aguardando_servidor')) break;
        await finalizarPartida(
          tx,
          partida.id,
          dados.winner.team === 'none'
            ? { estado: 'cancelada', vencedor: null }
            : { estado: 'encerrada', vencedor: dados.winner.team === 'team1' ? 1 : 2 },
        );
        break;
    }
  });
}

/** Lê o corpo até o limite, sem guardar na memória o que passar dele. */
export async function lerAte(pedido: Request, limite: number): Promise<string | null> {
  if (Number(pedido.headers.get('content-length') ?? 0) > limite) return null;
  if (!pedido.body) return '';
  const partes: Uint8Array[] = [];
  let total = 0;
  const leitor = pedido.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) return new TextDecoder().decode(Buffer.concat(partes));
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
}

export async function respostaDeEvento(bd: Bd, pedido: Request, tokenEsperado: string | undefined): Promise<Response> {
  if (!tokenConfere(pedido.headers.get('authorization'), tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  const texto = await lerAte(pedido, LIMITE_DO_EVENTO_BYTES);
  if (texto === null) return new Response('Evento grande demais.', { status: 413 });
  let evento: unknown = null;
  try {
    evento = JSON.parse(texto);
  } catch {
    // Corpo inválido vira evento estranho, que é ignorado.
  }
  await aplicarEvento(bd, evento);
  return new Response(null, { status: 200 });
}
