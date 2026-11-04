import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { usuarios, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { lancarXp, PATENTES, patenteDe, progressoDe, xpDaPartida, type GanhoDePartida } from './xp';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

function ganho(usuarioId: string, dados: Partial<GanhoDePartida> = {}): GanhoDePartida {
  return { usuarioId, origem: 'partida', referencia: 'partida-1', abates: 10, resultado: 'vitoria', jogouAteOFim: true, ...dados };
}

test('quem não jogou até o fim não ganha nada, mesmo com vitória e abates', () => {
  expect(xpDaPartida({ jogouAteOFim: false, resultado: 'vitoria', abates: 30 })).toBe(0);
});

test.each([
  ['derrota', 10, 500],
  ['vitoria', 20, 1000],
  ['vitoria', 25, 1100],
  ['vitoria', 200, 1100],
  ['empate', 0, 450],
  ['derrota', 0, 300],
] as const)('%s com %i abates dá %i XP', (resultado, abates, esperado) => {
  expect(xpDaPartida({ jogouAteOFim: true, resultado, abates })).toBe(esperado);
});

test('abates negativos valem zero', () => {
  expect(xpDaPartida({ jogouAteOFim: true, resultado: 'derrota', abates: -5 })).toBe(300);
});

test('as patentes são as dez aprovadas, em ordem', () => {
  expect(PATENTES.map(({ nivel, nome, xp }) => [nivel, nome, xp])).toEqual([
    [1, 'Recruta', 0],
    [2, 'Magnata Jr.', 4500],
    [3, 'Associado', 13500],
    [4, 'Mafioso', 31500],
    [5, 'Empresário', 63000],
    [6, 'Consigliere', 112500],
    [7, 'Ministro', 180000],
    [8, 'Milionário', 270000],
    [9, 'Don', 405000],
    [10, 'Magnata Supremo', 630000],
  ]);
});

test.each([
  [0, 'Recruta'],
  [4499, 'Recruta'],
  [4500, 'Magnata Jr.'],
  [629999, 'Don'],
  [630000, 'Magnata Supremo'],
  [9999999, 'Magnata Supremo'],
])('com %i XP a patente é %s', (xp, nome) => {
  expect(patenteDe(xp).nome).toBe(nome);
});

test('o progresso mostra quanto falta para a próxima patente', () => {
  expect(progressoDe(9000)).toMatchObject({ patente: { nome: 'Magnata Jr.' }, proxima: { nome: 'Associado' }, faltam: 4500, porcentagem: 50 });
});

test('na última patente não há próxima, e a barra fica cheia', () => {
  expect(progressoDe(700000)).toMatchObject({ patente: { nome: 'Magnata Supremo' }, proxima: null, faltam: 0, porcentagem: 100 });
});

test('lançar grava a linha e soma no total da conta', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  expect(lancado).toEqual({ usuarioId: conta.id, xp: 800, xpTotal: 800, subiuPara: null });
  const [linha] = await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, conta.id));
  expect(linha).toMatchObject({ origem: 'partida', referencia: 'partida-1', abates: 10, resultado: 'vitoria', xp: 800 });
  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(atual.xpTotal).toBe(800);
});

test('a mesma referência não conta duas vezes', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  const repetido = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  expect(repetido).toEqual([]);
  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(atual.xpTotal).toBe(800);
});

test('referências diferentes somam', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id, { referencia: 'partida-2' })]));
  expect(lancado.xpTotal).toBe(1600);
});

test('ao cruzar o limite, avisa a patente nova', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await bd.update(usuarios).set({ xpTotal: 4000 }).where(eq(usuarios.id, conta.id));
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  expect(lancado.subiuPara?.nome).toBe('Magnata Jr.');
});

test('quem não jogou até o fim fica com linha de 0 XP, e nada muda no total', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id, { jogouAteOFim: false })]));
  expect(lancado).toEqual({ usuarioId: conta.id, xp: 0, xpTotal: 0, subiuPara: null });
});
