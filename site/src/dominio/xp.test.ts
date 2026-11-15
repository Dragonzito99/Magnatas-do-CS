import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, usuarios, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { COMO_GANHAR_XP, lancarXp, PATENTES, patenteDe, patentesPorGrupo, progressoDe, xpDaPartida, xpDeLemnos, type GanhoDePartida } from './xp';

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

test('são 83 degraus em 6 grupos, como o dono aprovou, do Recruta ao Magnata Lendário', () => {
  expect(PATENTES).toHaveLength(83);
  expect(PATENTES.map((patente) => patente.nivel)).toEqual(PATENTES.map((_, indice) => indice + 1));
  expect([...new Set(PATENTES.map((patente) => patente.grupo))]).toEqual(['Rua', 'Família', 'Negócios', 'Poder', 'Elite', 'Topo']);
  expect([...new Set(PATENTES.map((patente) => patente.base))]).toEqual([
    'Recruta', 'Novato', 'Olheiro',
    'Associado', 'Soldado', 'Mafioso',
    'Magnata Jr.', 'Empresário', 'Investidor',
    'Consigliere', 'Caporegime', 'Ministro',
    'Milionário', 'Bilionário', 'Don',
    'Magnata', 'Ministro Mafioso', 'Magnata Supremo', 'Magnata Lendário',
  ]);
});

test('cada patente tem os níveis aprovados, e o nome mostra o nível só quando há mais de um', () => {
  const niveis = (base: string) => PATENTES.filter((patente) => patente.base === base).map((patente) => patente.nome);
  expect(niveis('Recruta')).toEqual(['Recruta']);
  expect(niveis('Novato')).toEqual(['Novato 1', 'Novato 2', 'Novato 3']);
  expect(niveis('Soldado')).toHaveLength(4);
  expect(niveis('Investidor')).toHaveLength(6);
  expect(niveis('Caporegime')).toHaveLength(6);
  expect(niveis('Don')).toEqual(['Don 1', 'Don 2', 'Don 3', 'Don 4', 'Don 5', 'Don 6', 'Don 7', 'Don 8']);
  expect(niveis('Ministro Mafioso')).toEqual(['Ministro Mafioso']);
});

test('o XP sobe a cada degrau, rápido no começo e devagar no fim', () => {
  const xp = (nome: string) => PATENTES.find((patente) => patente.nome === nome)?.xp;
  expect(xp('Recruta')).toBe(0);
  expect(xp('Novato 1')).toBe(600);
  expect(xp('Novato 2')).toBe(1250);
  expect(xp('Don 8')).toBe(399_650);
  expect(xp('Magnata')).toBe(459_650);
  expect(xp('Ministro Mafioso')).toBe(549_650);
  expect(xp('Magnata Supremo')).toBe(699_650);
  expect(xp('Magnata Lendário')).toBe(1_099_650);
  const passos = PATENTES.slice(1).map((patente, indice) => patente.xp - PATENTES[indice].xp);
  expect(passos.every((passo, indice) => passo > 0 && (indice === 0 || passo >= passos[indice - 1]))).toBe(true);
});

test.each([
  [0, 'Recruta'],
  [599, 'Recruta'],
  [600, 'Novato 1'],
  [699_649, 'Ministro Mafioso'],
  [699_650, 'Magnata Supremo'],
  [99_999_999, 'Magnata Lendário'],
])('com %i XP a patente é %s', (xp, nome) => {
  expect(patenteDe(xp).nome).toBe(nome);
});

test('o progresso mostra quanto falta para o próximo degrau', () => {
  expect(progressoDe(1000)).toMatchObject({ patente: { nome: 'Novato 1' }, proxima: { nome: 'Novato 2' }, faltam: 250, porcentagem: 61 });
});

test('no último degrau não há próximo, e a barra fica cheia', () => {
  expect(progressoDe(2_000_000)).toMatchObject({ patente: { nome: 'Magnata Lendário' }, proxima: null, faltam: 0, porcentagem: 100 });
});

test('lançar grava a linha e soma no total da conta', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id)]));
  // Com os níveis, a primeira partida já sobe para Novato 1.
  expect(lancado).toMatchObject({ usuarioId: conta.id, xp: 800, xpTotal: 800, subiuPara: { nome: 'Novato 1' } });
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
  expect(lancado.subiuPara?.nome).toBe('Olheiro 3');
});

test('quem não jogou até o fim fica com linha de 0 XP, e nada muda no total', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho(conta.id, { jogouAteOFim: false })]));
  expect(lancado).toEqual({ usuarioId: conta.id, xp: 0, xpTotal: 0, subiuPara: null });
});

test('a migração das patentes usa a mesma escada e deixa como vista a patente atual de cada um', async () => {
  const migracao = readFileSync(path.resolve(__dirname, '../../drizzle/0019_patentes_com_niveis.sql'), 'utf8');
  const degraus = [...migracao.matchAll(/\((\d+)\)/g)].map((achado) => Number(achado[1]));
  expect(degraus).toEqual(PATENTES.map((patente) => patente.xp));
  const contas = await Promise.all([0, 9000, 700_000].map(() => criarUsuario(bd, { estado: 'ativo' })));
  for (const [indice, xpTotal] of [0, 9000, 700_000].entries()) {
    await bd.update(usuarios).set({ xpTotal, patenteVista: 3 }).where(eq(usuarios.id, contas[indice].id));
  }
  await bd.execute(sql.raw(migracao));
  const vistas = await Promise.all(contas.map(async (conta) => (await bd.select().from(usuarios).where(eq(usuarios.id, conta.id)))[0].patenteVista));
  expect(vistas).toEqual([patenteDe(0).nivel, patenteDe(9000).nivel, patenteDe(700_000).nivel]);
});

test('a página das patentes mostra os 6 grupos, cada patente com os seus níveis e a faixa de XP', () => {
  const grupos = patentesPorGrupo();
  expect(grupos.map((grupo) => grupo.grupo)).toEqual(['Rua', 'Família', 'Negócios', 'Poder', 'Elite', 'Topo']);
  expect(grupos[0].patentes.map((patente) => [patente.base, patente.niveis, patente.xpInicial, patente.xpFinal])).toEqual([
    ['Recruta', 1, 0, 0],
    ['Novato', 3, 600, 1900],
    ['Olheiro', 3, 2600, 4050],
  ]);
  expect(grupos[5].patentes.map((patente) => patente.base)).toEqual(['Magnata', 'Ministro Mafioso', 'Magnata Supremo', 'Magnata Lendário']);
  expect(grupos.flatMap((grupo) => grupo.patentes).reduce((total, patente) => total + patente.niveis, 0)).toBe(83);
});

test('o "como ganhar XP" da página usa os mesmos valores da conta', () => {
  expect(COMO_GANHAR_XP).toEqual({ jogar: 300, vitoria: 300, empate: 150, abate: 20, maximoPorAbates: 500, maximoPorPartida: 1100 });
  expect(xpDaPartida({ jogouAteOFim: true, resultado: 'vitoria', abates: 1 })).toBe(COMO_GANHAR_XP.jogar + COMO_GANHAR_XP.vitoria + COMO_GANHAR_XP.abate);
});

test('xpDeLemnos conta só os abates, com o teto dos abates', () => {
  expect(xpDeLemnos(0)).toBe(0);
  expect(xpDeLemnos(3)).toBe(60);
  expect(xpDeLemnos(30)).toBe(500);
});

test('xpFixo substitui a conta e semGrana não cria linha de grana', async () => {
  const conta = await criarUsuario(bd);
  const ganho: GanhoDePartida = { usuarioId: conta.id, origem: 'diversao', referencia: 'lemnos:sessao-1', abates: 3, resultado: 'derrota', jogouAteOFim: true, xpFixo: 60, semGrana: true };
  const [lancado] = await bd.transaction((tx) => lancarXp(tx, [ganho]));
  expect(lancado.xp).toBe(60);
  const grana = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.usuarioId, conta.id));
  expect(grana).toEqual([]);
  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(atual.xpTotal).toBe(60);
  expect(atual.grana).toBe(0);
});
