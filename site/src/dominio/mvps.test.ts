import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, type Partida, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { mvpsDoPeriodo, periodoDeBrasilia } from './mvps';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function partida(encerradaEm: string, linhas: [Usuario, { mvps: number; kills: number }][], estado: Partida['estado'] = 'encerrada') {
  const [criada] = await bd.insert(partidas).values({ tipo: 'mix', estado, mapa: 'de_mirage', encerradaEm: new Date(encerradaEm) }).returning();
  await bd.insert(partidaJogadores).values(linhas.map(([conta, numeros], i) => ({ partidaId: criada.id, usuarioId: conta.id, time: (i % 2) + 1, ...numeros })));
}

const conta = (apelido: string) => criarUsuario(bd, { estado: 'ativo', apelido });

test('o mês de uma partida 23:30 de 31/10 em Brasília é outubro', () => {
  expect(periodoDeBrasilia(new Date('2026-11-01T02:30:00Z'), 'mes')).toEqual({
    inicio: new Date('2026-10-01T03:00:00Z'),
    fim: new Date('2026-11-01T03:00:00Z'),
  });
});

test('o dia de Brasília começa às 3h UTC', () => {
  expect(periodoDeBrasilia(new Date('2026-11-07T01:00:00Z'), 'dia')).toEqual({
    inicio: new Date('2026-11-06T03:00:00Z'),
    fim: new Date('2026-11-07T03:00:00Z'),
  });
});

test('soma as estrelas entre partidas, e conta as partidas', async () => {
  const [a, b] = [await conta('Ana'), await conta('Bia')];
  await partida('2026-11-06T15:00:00Z', [[a, { mvps: 3, kills: 20 }], [b, { mvps: 4, kills: 10 }]]);
  await partida('2026-11-06T18:00:00Z', [[a, { mvps: 2, kills: 15 }], [b, { mvps: 0, kills: 5 }]]);
  const lista = await mvpsDoPeriodo(bd, periodoDeBrasilia(new Date('2026-11-06T20:00:00Z'), 'dia'), 5);
  expect(lista.map((linha) => [linha.apelido, linha.mvps, linha.kills, linha.partidas])).toEqual([
    ['Ana', 5, 35, 2],
    ['Bia', 4, 15, 2],
  ]);
});

test('empate em estrelas vai para mais kills, depois para o apelido', async () => {
  const [a, b, c] = [await conta('Zeca'), await conta('Caio'), await conta('Ana')];
  await partida('2026-11-06T15:00:00Z', [[a, { mvps: 3, kills: 10 }], [b, { mvps: 3, kills: 12 }], [c, { mvps: 3, kills: 12 }]]);
  const lista = await mvpsDoPeriodo(bd, periodoDeBrasilia(new Date('2026-11-06T20:00:00Z'), 'dia'), 5);
  expect(lista.map((linha) => linha.apelido)).toEqual(['Ana', 'Caio', 'Zeca']);
});

test('partida cancelada e partida de ontem não contam no dia; quem não tem estrela fica de fora', async () => {
  const [a, b] = [await conta('Ana'), await conta('Bia')];
  await partida('2026-11-06T15:00:00Z', [[a, { mvps: 9, kills: 30 }]], 'cancelada');
  await partida('2026-11-06T02:00:00Z', [[a, { mvps: 5, kills: 30 }]]);
  await partida('2026-11-06T15:00:00Z', [[a, { mvps: 1, kills: 3 }], [b, { mvps: 0, kills: 40 }]]);
  const lista = await mvpsDoPeriodo(bd, periodoDeBrasilia(new Date('2026-11-06T20:00:00Z'), 'dia'), 5);
  expect(lista.map((linha) => [linha.apelido, linha.mvps])).toEqual([['Ana', 1]]);
});

test('respeita o limite', async () => {
  const contas = [await conta('A'), await conta('B'), await conta('C')];
  await partida('2026-11-06T15:00:00Z', contas.map((c, i) => [c, { mvps: i + 1, kills: 1 }] as [Usuario, { mvps: number; kills: number }]));
  expect(await mvpsDoPeriodo(bd, periodoDeBrasilia(new Date('2026-11-06T20:00:00Z'), 'mes'), 2)).toHaveLength(2);
});
