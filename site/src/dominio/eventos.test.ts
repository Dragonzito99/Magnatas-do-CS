import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, salas, servidores, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { aplicarEvento, respostaDeEvento } from './eventos';
import going_live from './exemplos/going_live.json';
import map_result from './exemplos/map_result.json';
import round_end from './exemplos/round_end.json';
import series_end from './exemplos/series_end.json';
import series_end_cancelada from './exemplos/series_end_cancelada.json';
import series_start from './exemplos/series_start.json';
import { alocarServidores, criarPartida, criarServidor } from './partidas';
import { controladorFalso } from '@/servidor-jogo/controlador';

let bd: Bd;
let partida: Partida;
let time1: Usuario[];
let time2: Usuario[];

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  time1 = [];
  time2 = [];
  for (let i = 0; i < 5; i += 1) {
    time1.push(await criarUsuario(bd, { estado: 'ativo' }));
    time2.push(await criarUsuario(bd, { estado: 'ativo' }));
  }
  partida = await bd.transaction((tx) =>
    criarPartida(tx, { tipo: 'mix', time1: time1.map((c) => c.id), time2: time2.map((c) => c.id) }),
  );
  await bd.update(partidas).set({ estado: 'carregando' }).where(eq(partidas.id, partida.id));
});

const daPartida = <T extends object>(exemplo: T) => ({ ...exemplo, matchid: partida.numero });

const atual = async () => (await bd.select().from(partidas).where(eq(partidas.id, partida.id)))[0];

const linhaDe = async (conta: Usuario) =>
  (await bd.select().from(partidaJogadores).where(eq(partidaJogadores.usuarioId, conta.id)))[0];

function estatisticas(conta: Usuario, valores: Partial<Record<string, number>>) {
  return {
    steamid: conta.steamid64,
    name: conta.apelido,
    stats: { ...round_end.team1.players[0].stats, ...valores },
  };
}

function fimDeRodada(score1: number, score2: number, jogadores1: object[], jogadores2: object[] = []) {
  return daPartida({
    ...round_end,
    team1: { ...round_end.team1, score: score1, players: jogadores1 },
    team2: { ...round_end.team2, score: score2, players: jogadores2 },
  });
}

test('series_start passa a partida para aguardando jogadores', async () => {
  await aplicarEvento(bd, daPartida(series_start));
  expect((await atual()).estado).toBe('aguardando_jogadores');
});

test('going_live marca a partida como ao vivo e registra o início', async () => {
  await aplicarEvento(bd, daPartida(going_live));
  const linha = await atual();
  expect(linha.estado).toBe('ao_vivo');
  expect(linha.iniciadaEm).toBeInstanceOf(Date);
});

test('round_end atualiza o placar', async () => {
  await aplicarEvento(bd, daPartida(going_live));
  await aplicarEvento(bd, fimDeRodada(3, 2, []));
  expect(await atual()).toMatchObject({ placar1: 3, placar2: 2 });
});

test('round_end sem going_live também marca ao vivo, para a partida não parecer abandonada', async () => {
  await aplicarEvento(bd, fimDeRodada(1, 0, []));
  const linha = await atual();
  expect(linha.estado).toBe('ao_vivo');
  expect(linha.iniciadaEm).toBeInstanceOf(Date);
});

test('round_end grava kills, deaths, assists, dano, tiros na cabeça e rodadas de cada jogador', async () => {
  await aplicarEvento(
    bd,
    fimDeRodada(
      1,
      0,
      [estatisticas(time1[0], { kills: 3, deaths: 1, assists: 2, damage: 250, headshot_kills: 2, rounds_played: 4 })],
      [estatisticas(time2[0], { kills: 1, deaths: 3, assists: 0, damage: 90, headshot_kills: 0, rounds_played: 4 })],
    ),
  );
  expect(await linhaDe(time1[0])).toMatchObject({ kills: 3, deaths: 1, assists: 2, damage: 250, headshotKills: 2, rodadas: 4 });
  expect(await linhaDe(time2[0])).toMatchObject({ kills: 1, deaths: 3, damage: 90, rodadas: 4 });
});

test('round_end repetido ou fora de ordem não soma de novo nem reduz o total', async () => {
  const depois = fimDeRodada(5, 4, [estatisticas(time1[0], { kills: 7, rounds_played: 9 })]);
  const antes = fimDeRodada(2, 1, [estatisticas(time1[0], { kills: 2, rounds_played: 3 })]);
  await aplicarEvento(bd, depois);
  await aplicarEvento(bd, depois);
  await aplicarEvento(bd, antes);
  expect(await linhaDe(time1[0])).toMatchObject({ kills: 7, rodadas: 9 });
  expect(await atual()).toMatchObject({ placar1: 5, placar2: 4 });
});

test('jogador que não é da partida é ignorado', async () => {
  const fora = await criarUsuario(bd, { estado: 'ativo' });
  await aplicarEvento(bd, fimDeRodada(1, 0, [estatisticas(fora, { kills: 9 })]));
  expect(await bd.select().from(partidaJogadores).where(eq(partidaJogadores.usuarioId, fora.id))).toEqual([]);
});

test('map_result atualiza o placar', async () => {
  await aplicarEvento(bd, daPartida(map_result));
  expect(await atual()).toMatchObject({ placar1: map_result.team1.score, placar2: map_result.team2.score });
});

test('series_end encerra, grava o vencedor e libera o servidor', async () => {
  const servidor = await criarServidor(bd, { nome: 'SP', host: '10.0.0.1', porta: 27015 });
  await bd.update(partidas).set({ estado: 'aguardando_servidor' }).where(eq(partidas.id, partida.id));
  await alocarServidores(bd, controladorFalso());
  await aplicarEvento(bd, daPartida(series_end));
  const linha = await atual();
  expect(linha).toMatchObject({ estado: 'encerrada', vencedor: 1 });
  expect(linha.encerradaEm).toBeInstanceOf(Date);
  const [livre] = await bd.select().from(servidores).where(eq(servidores.id, servidor.id));
  expect(livre.partidaId).toBeNull();
});

test('series_end devolve as salas, que podem jogar de novo', async () => {
  const [sala] = await bd.insert(salas).values({ nome: 'Sala', liderId: time1[0].id, partidaId: partida.id }).returning();
  await aplicarEvento(bd, daPartida(series_end));
  const [livre] = await bd.select().from(salas).where(eq(salas.id, sala.id));
  expect(livre.partidaId).toBeNull();
});

test('series_end com winner none marca como cancelada', async () => {
  await aplicarEvento(bd, daPartida(series_end_cancelada));
  expect(await atual()).toMatchObject({ estado: 'cancelada', vencedor: null });
});

test('evento de partida encerrada não reabre nem muda nada', async () => {
  await aplicarEvento(bd, fimDeRodada(13, 5, [estatisticas(time1[0], { kills: 20, rounds_played: 18 })]));
  await aplicarEvento(bd, daPartida(series_end));
  const antes = await atual();
  await aplicarEvento(bd, fimDeRodada(14, 5, [estatisticas(time1[0], { kills: 25, rounds_played: 19 })]));
  await aplicarEvento(bd, daPartida(series_end_cancelada));
  expect(await atual()).toEqual(antes);
  expect((await linhaDe(time1[0])).kills).toBe(20);
});

test('going_live depois de series_end é ignorado', async () => {
  await aplicarEvento(bd, daPartida(series_end));
  await aplicarEvento(bd, daPartida(going_live));
  expect((await atual()).estado).toBe('encerrada');
});

test('evento de matchid desconhecido é ignorado', async () => {
  await aplicarEvento(bd, { ...going_live, matchid: partida.numero + 100 });
  expect((await atual()).estado).toBe('carregando');
});

test.each([
  null,
  'texto',
  {},
  { event: 'x' },
  { event: 'going_live' },
  { event: 'going_live', matchid: 'abc' },
  { event: 'going_live', matchid: 99999999999 },
  { event: 'round_end', matchid: 1, team1: 'x' },
  { event: 'series_end', matchid: 1, winner: { team: 'time3' } },
])('evento estranho %j é ignorado sem erro', async (evento) => {
  await expect(aplicarEvento(bd, evento)).resolves.toBeUndefined();
});

test('a rota de eventos recusa token errado e responde 200 com o certo', async () => {
  const corpo = JSON.stringify(daPartida(going_live));
  expect((await respostaDeEvento(bd, 'Bearer errado', 'certo', corpo)).status).toBe(401);
  expect((await atual()).estado).toBe('carregando');
  expect((await respostaDeEvento(bd, 'Bearer certo', 'certo', corpo)).status).toBe(200);
  expect((await atual()).estado).toBe('ao_vivo');
});

test('a rota de eventos responde 200 para corpo que não é JSON, para o servidor não repetir o envio', async () => {
  expect((await respostaDeEvento(bd, 'Bearer certo', 'certo', 'não é json')).status).toBe(200);
});
