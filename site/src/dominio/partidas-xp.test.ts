import { and, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { insigniasDoJogador, partidaJogadores, partidas, usuarios, xpPartidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { aplicarEvento } from './eventos';
import { criarPartida, finalizarPartida, jogouAteOFim } from './partidas';

let bd: Bd;
let partida: Partida;
let vencedor: Usuario;
let perdedor: Usuario;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  vencedor = await criarUsuario(bd, { estado: 'ativo' });
  perdedor = await criarUsuario(bd, { estado: 'ativo' });
  partida = await bd.transaction((tx) => criarPartida(tx, { tipo: 'mix', time1: [vencedor.id], time2: [perdedor.id] }));
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: 13, placar2: 7 }).where(eq(partidas.id, partida.id));
  await bd.update(partidaJogadores).set({ kills: 12, rodadas: 20 }).where(eq(partidaJogadores.partidaId, partida.id));
});

const encerrar = (time: 'team1' | 'team2' | 'none' = 'team1') =>
  aplicarEvento(bd, { event: 'series_end', matchid: partida.numero, winner: { team: time } });

const xpDe = async (conta: Usuario) => (await bd.select().from(usuarios).where(eq(usuarios.id, conta.id)))[0].xpTotal;

const definirRodadas = (conta: Usuario, rodadas: number) =>
  bd
    .update(partidaJogadores)
    .set({ rodadas })
    .where(and(eq(partidaJogadores.partidaId, partida.id), eq(partidaJogadores.usuarioId, conta.id)));

test('quem venceu e quem perdeu ganham o XP da fórmula', async () => {
  await encerrar();
  expect(await xpDe(vencedor)).toBe(840);
  expect(await xpDe(perdedor)).toBe(540);
});

test('a linha guarda a partida como referência', async () => {
  await encerrar();
  const [linha] = await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, vencedor.id));
  expect(linha).toMatchObject({ origem: 'partida', referencia: partida.id, abates: 12, resultado: 'vitoria', xp: 840 });
});

test('quem saiu cedo fica com 0 XP', async () => {
  await definirRodadas(perdedor, 5);
  await encerrar();
  expect(await xpDe(perdedor)).toBe(0);
  const [linha] = await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, perdedor.id));
  expect(linha.xp).toBe(0);
});

test('perder até 2 rodadas por uma queda não tira o XP', async () => {
  await definirRodadas(perdedor, 18);
  await encerrar();
  expect(await xpDe(perdedor)).toBe(540);
});

test('perder 3 rodadas conta como sair antes do fim', async () => {
  await definirRodadas(perdedor, 17);
  await encerrar();
  expect(await xpDe(perdedor)).toBe(0);
});

test('partida cancelada não dá XP a ninguém', async () => {
  await encerrar('none');
  expect(await xpDe(vencedor)).toBe(0);
  expect(await bd.select().from(xpPartidas)).toEqual([]);
});

test('o mesmo fim de partida repetido não soma de novo', async () => {
  await encerrar();
  await encerrar();
  await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado: 'encerrada', vencedor: 1 }));
  expect(await xpDe(vencedor)).toBe(840);
});

test('conta suspensa durante a partida não ganha', async () => {
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, perdedor.id));
  await encerrar();
  expect(await xpDe(perdedor)).toBe(0);
  expect(await xpDe(vencedor)).toBe(840);
});

test('partida encerrada sem vencedor vale como empate', async () => {
  await bd.transaction((tx) => finalizarPartida(tx, partida.id, { estado: 'encerrada', vencedor: null }));
  expect(await xpDe(vencedor)).toBe(690);
  expect(await xpDe(perdedor)).toBe(690);
});

test.each([
  [20, 20, true],
  [18, 20, true],
  [17, 20, false],
  [0, 20, false],
  [0, 0, false],
  [1, 1, true],
])('com %i de %i rodadas, jogou até o fim: %s', (rodadas, total, esperado) => {
  expect(jogouAteOFim(rodadas, total)).toBe(esperado);
});

test('no fim da partida, quem chega a 10 MVPs ganha a Estrela Bronze; partida de teste não dá insígnia', async () => {
  await bd.update(partidaJogadores).set({ mvps: 10 }).where(and(eq(partidaJogadores.partidaId, partida.id), eq(partidaJogadores.usuarioId, vencedor.id)));
  await encerrar();
  const insignias = await bd.select().from(insigniasDoJogador).where(eq(insigniasDoJogador.usuarioId, vencedor.id));
  expect(insignias.map((linha) => `${linha.familia}:${linha.nivel}`)).toEqual(['estrela:0']);
  expect(await xpDe(vencedor)).toBe(840 + 200);

  const teste = await bd.transaction((tx) => criarPartida(tx, { tipo: 'teste', time1: [perdedor.id], time2: [] }));
  await bd.update(partidas).set({ estado: 'ao_vivo', placar1: 13, placar2: 0 }).where(eq(partidas.id, teste.id));
  await bd.update(partidaJogadores).set({ kills: 30, rodadas: 13, mvps: 50 }).where(eq(partidaJogadores.partidaId, teste.id));
  await aplicarEvento(bd, { event: 'series_end', matchid: teste.numero, winner: { team: 'team1' } });
  expect(await bd.select().from(insigniasDoJogador).where(eq(insigniasDoJogador.usuarioId, perdedor.id))).toEqual([]);
});
