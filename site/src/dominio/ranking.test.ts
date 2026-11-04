import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { lerMes, mesAnterior, mesDe, MINIMO_DE_PARTIDAS_NO_MES, primeiroMesComPartida, proximoMes, rankingDoMes } from './ranking';

let bd: Bd;
const NOVEMBRO = { ano: 2026, mes: 11 };
const NO_MES = new Date('2026-11-15T15:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function jogar(
  conta: Usuario,
  valores: { kills?: number; deaths?: number; damage?: number; rodadas?: number; time?: number } = {},
  partidaValores: Partial<typeof partidas.$inferInsert> = {},
) {
  const [partida] = await bd
    .insert(partidas)
    .values({ tipo: 'mix', estado: 'encerrada', mapa: 'de_mirage', vencedor: 1, encerradaEm: NO_MES, ...partidaValores })
    .returning();
  await bd.insert(partidaJogadores).values({ partidaId: partida.id, usuarioId: conta.id, time: 1, ...valores });
}

async function jogarVezes(conta: Usuario, vezes: number, valores: Parameters<typeof jogar>[1] = {}) {
  for (let i = 0; i < vezes; i += 1) await jogar(conta, valores);
}

const membro = (apelido: string, estado: Usuario['estado'] = 'ativo') => criarUsuario(bd, { estado, apelido });

test('fica em primeiro quem tem o maior K/D do mês', async () => {
  const fraco = await membro('fraco');
  const forte = await membro('forte');
  await jogarVezes(fraco, 5, { kills: 10, deaths: 10 });
  await jogarVezes(forte, 5, { kills: 20, deaths: 10 });
  const { linhas } = await rankingDoMes(bd, NOVEMBRO);
  expect(linhas.map((linha) => [linha.posicao, linha.jogador.apelido, linha.kd])).toEqual([
    [1, 'forte', 2],
    [2, 'fraco', 1],
  ]);
});

test('a linha traz partidas, vitórias, abates, mortes e dano por rodada', async () => {
  const conta = await membro('conta');
  await jogarVezes(conta, 3, { kills: 10, deaths: 5, damage: 900, rodadas: 10 });
  await jogarVezes(conta, 2, { kills: 10, deaths: 5, damage: 900, rodadas: 10, time: 2 });
  const [linha] = (await rankingDoMes(bd, NOVEMBRO)).linhas;
  expect(linha).toMatchObject({ partidas: 5, vitoriasPct: 60, abates: 50, mortes: 25, adr: 90, kd: 2 });
  expect(linha.jogador).toEqual({ id: conta.id, apelido: 'conta', avatarUrl: conta.avatarUrl });
});

test('no empate de K/D, ganha quem tem mais abates', async () => {
  const menos = await membro('menos');
  const mais = await membro('mais');
  await jogarVezes(menos, 5, { kills: 10, deaths: 5 });
  await jogarVezes(mais, 5, { kills: 20, deaths: 10 });
  const { linhas } = await rankingDoMes(bd, NOVEMBRO);
  expect(linhas.map((linha) => linha.jogador.apelido)).toEqual(['mais', 'menos']);
});

test('quem tem 0 mortes fica com K/D igual aos abates', async () => {
  const conta = await membro('conta');
  await jogarVezes(conta, 5, { kills: 3, deaths: 0 });
  expect((await rankingDoMes(bd, NOVEMBRO)).linhas[0].kd).toBe(15);
});

test(`quem tem menos de ${MINIMO_DE_PARTIDAS_NO_MES} partidas no mês fica fora, e é contado`, async () => {
  const dentro = await membro('dentro');
  const fora = await membro('fora');
  await jogarVezes(dentro, 5, { kills: 1, deaths: 1 });
  await jogarVezes(fora, 4, { kills: 99, deaths: 1 });
  const ranking = await rankingDoMes(bd, NOVEMBRO);
  expect(ranking.linhas.map((linha) => linha.jogador.apelido)).toEqual(['dentro']);
  expect(ranking.foraDoRanking).toBe(1);
});

test('partida de outro mês não conta', async () => {
  const conta = await membro('conta');
  for (let i = 0; i < 5; i += 1) await jogar(conta, { kills: 5, deaths: 5 }, { encerradaEm: new Date('2026-10-20T15:00:00Z') });
  const ranking = await rankingDoMes(bd, NOVEMBRO);
  expect(ranking).toEqual({ linhas: [], foraDoRanking: 0 });
  expect((await rankingDoMes(bd, { ano: 2026, mes: 10 })).linhas).toHaveLength(1);
});

test('a virada do mês segue o horário de Brasília', async () => {
  const conta = await membro('conta');
  // 00:30 do dia 1º em UTC ainda é dia 31 em Brasília.
  for (let i = 0; i < 5; i += 1) await jogar(conta, {}, { encerradaEm: new Date('2026-11-01T00:30:00Z') });
  expect((await rankingDoMes(bd, { ano: 2026, mes: 10 })).linhas).toHaveLength(1);
  expect((await rankingDoMes(bd, NOVEMBRO)).linhas).toHaveLength(0);
});

test('partida cancelada não conta', async () => {
  const conta = await membro('conta');
  for (let i = 0; i < 5; i += 1) await jogar(conta, { kills: 5 }, { estado: 'cancelada', vencedor: null });
  expect(await rankingDoMes(bd, NOVEMBRO)).toEqual({ linhas: [], foraDoRanking: 0 });
});

test.each([['banido'], ['suspenso']] as const)('conta %s some do ranking, e as posições se ajustam', async (estado) => {
  const punido = await membro('punido', estado);
  const limpo = await membro('limpo');
  await jogarVezes(punido, 5, { kills: 99, deaths: 1 });
  await jogarVezes(limpo, 5, { kills: 5, deaths: 5 });
  const ranking = await rankingDoMes(bd, NOVEMBRO);
  expect(ranking.linhas.map((linha) => [linha.posicao, linha.jogador.apelido])).toEqual([[1, 'limpo']]);
  expect(ranking.foraDoRanking).toBe(0);
});

test('mês sem partidas fica vazio', async () => {
  expect(await rankingDoMes(bd, NOVEMBRO)).toEqual({ linhas: [], foraDoRanking: 0 });
});

test('mesDe usa o horário de Brasília', () => {
  expect(mesDe(new Date('2026-11-01T00:30:00Z'))).toEqual({ ano: 2026, mes: 10 });
  expect(mesDe(new Date('2026-11-01T03:30:00Z'))).toEqual({ ano: 2026, mes: 11 });
});

test('mês anterior e próximo atravessam o ano', () => {
  expect(mesAnterior({ ano: 2026, mes: 1 })).toEqual({ ano: 2025, mes: 12 });
  expect(proximoMes({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 });
});

test('lerMes aceita ano-mês válido', () => {
  expect(lerMes('2026-07')).toEqual({ ano: 2026, mes: 7 });
});

test.each([[undefined], [''], ['2026-13'], ['2026-00'], ['abc'], ['2026-7'], ['2026-07-01']])('lerMes recusa %s', (texto) => {
  expect(lerMes(texto)).toBeNull();
});

test('primeiroMesComPartida acha a partida encerrada mais antiga', async () => {
  const conta = await membro('conta');
  expect(await primeiroMesComPartida(bd)).toBeNull();
  await jogar(conta, {}, { encerradaEm: new Date('2026-09-10T15:00:00Z') });
  await jogar(conta);
  expect(await primeiroMesComPartida(bd)).toEqual({ ano: 2026, mes: 9 });
});
