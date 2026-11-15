import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, lemnosItens, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { lancarGrana, lancarMoeda, SaldoInsuficiente } from '@/dominio/grana';
import { ItemInvalido, JaEhSeu } from '@/dominio/loja';
import { bauDaLemnos, comprarArmaComMagcoin, comprarComGrana, comprarMochila, venderSaque } from './mercado';

let bd: Bd;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-15T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function contaCom(grana: number, magcoin = 0): Promise<Usuario> {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await bd.transaction(async (tx) => {
    if (grana > 0) await lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: grana, referencia: 'inicio' });
    if (magcoin > 0) await lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'ajuste', quantidade: magcoin, referencia: 'inicio' });
  });
  return recarregar(bd, conta);
}

const linhasDe = (conta: Usuario) => bd.select().from(lemnosItens).where(eq(lemnosItens.usuarioId, conta.id));
const compras = (conta: Usuario) => bd.select().from(lancamentosDeGrana).where(and(eq(lancamentosDeGrana.usuarioId, conta.id), eq(lancamentosDeGrana.tipo, 'compra')));

async function darSaque(conta: Usuario, itemId: string, situacao: 'no_bau' | 'vendido' = 'no_bau') {
  const [linha] = await bd.insert(lemnosItens).values({ usuarioId: conta.id, tipo: 'saque', itemId, origem: 'achado', situacao }).returning();
  return linha.id;
}

test('comprar 3 AKs com grana cria 3 linhas e cobra uma vez 135', async () => {
  const conta = await contaCom(200);
  expect(await comprarComGrana(bd, conta, { itemId: 'ak47', quantidade: 3, codigo: randomUUID() }, AGORA)).toBe('comprado');
  const linhas = await linhasDe(conta);
  expect(linhas.map((linha) => [linha.tipo, linha.itemId, linha.origem, linha.situacao, linha.expiraEm])).toEqual(Array(3).fill(['arma', 'ak47', 'grana', 'no_bau', null]));
  expect((await compras(conta)).map((linha) => linha.quantidade)).toEqual([-135]);
  expect((await recarregar(bd, conta)).grana).toBe(65);
});

test('granada com grana vira linha de granada', async () => {
  const conta = await contaCom(50);
  await comprarComGrana(bd, conta, { itemId: 'flashbang', quantidade: 2, codigo: randomUUID() }, AGORA);
  expect((await linhasDe(conta)).map((linha) => [linha.tipo, linha.itemId])).toEqual([
    ['granada', 'flashbang'],
    ['granada', 'flashbang'],
  ]);
  expect((await recarregar(bd, conta)).grana).toBe(42);
});

test('o mesmo código não cobra duas vezes', async () => {
  const conta = await contaCom(200);
  const codigo = randomUUID();
  await comprarComGrana(bd, conta, { itemId: 'ak47', quantidade: 1, codigo }, AGORA);
  expect(await comprarComGrana(bd, conta, { itemId: 'ak47', quantidade: 1, codigo }, AGORA)).toBe('repetido');
  expect(await linhasDe(conta)).toHaveLength(1);
  expect((await recarregar(bd, conta)).grana).toBe(155);
});

test('sem grana lança SaldoInsuficiente e não cria linha', async () => {
  const conta = await contaCom(40);
  await expect(comprarComGrana(bd, conta, { itemId: 'ak47', quantidade: 1, codigo: randomUUID() }, AGORA)).rejects.toThrow(SaldoInsuficiente);
  expect(await linhasDe(conta)).toEqual([]);
});

test('quantidade fora de 1 a 10, item de outro tipo ou código ruim lança ItemInvalido', async () => {
  const conta = await contaCom(2000);
  for (const pedido of [
    { itemId: 'ak47', quantidade: 0, codigo: randomUUID() },
    { itemId: 'ak47', quantidade: 11, codigo: randomUUID() },
    { itemId: 'joias', quantidade: 1, codigo: randomUUID() },
    { itemId: 'media', quantidade: 1, codigo: randomUUID() },
    { itemId: 'ak47', quantidade: 1, codigo: 'nao-e-codigo' },
  ]) {
    await expect(comprarComGrana(bd, conta, pedido, AGORA)).rejects.toThrow(ItemInvalido);
  }
});

test('Magcoin por 3 dias e depois mais 3 soma 6 dias na mesma linha', async () => {
  const conta = await contaCom(0, 500);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'ak47', dias: 3, codigo: randomUUID() }, AGORA);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'ak47', dias: 3, codigo: randomUUID() }, new Date(AGORA.getTime() + DIA));
  const linhas = await linhasDe(conta);
  expect(linhas).toHaveLength(1);
  expect(linhas[0]).toMatchObject({ tipo: 'arma', itemId: 'ak47', origem: 'magcoin' });
  expect(linhas[0].expiraEm?.getTime()).toBe(AGORA.getTime() + 6 * DIA);
  expect((await recarregar(bd, conta)).magcoin).toBe(430);
});

test('arma vencida comprada de novo conta os dias a partir de agora', async () => {
  const conta = await contaCom(0, 500);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'awp', dias: 1, codigo: randomUUID() }, AGORA);
  const depois = new Date(AGORA.getTime() + 5 * DIA);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'awp', dias: 1, codigo: randomUUID() }, depois);
  expect((await linhasDe(conta))[0].expiraEm?.getTime()).toBe(depois.getTime() + DIA);
});

test('arma para sempre comprada de novo lança JaEhSeu', async () => {
  const conta = await contaCom(0, 1000);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'ak47', dias: null, codigo: randomUUID() }, AGORA);
  expect((await linhasDe(conta))[0].expiraEm).toBeNull();
  await expect(comprarArmaComMagcoin(bd, conta, { itemId: 'ak47', dias: 3, codigo: randomUUID() }, AGORA)).rejects.toThrow(JaEhSeu);
  expect((await recarregar(bd, conta)).magcoin).toBe(700);
});

test('arma por dias que vira para sempre fica na mesma linha', async () => {
  const conta = await contaCom(0, 1000);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'deagle', dias: 1, codigo: randomUUID() }, AGORA);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'deagle', dias: null, codigo: randomUUID() }, AGORA);
  const linhas = await linhasDe(conta);
  expect(linhas).toHaveLength(1);
  expect(linhas[0].expiraEm).toBeNull();
});

test('mochila média por 1 dia cobra 40 de grana', async () => {
  const conta = await contaCom(100);
  await comprarMochila(bd, conta, { itemId: 'media', dias: 1, codigo: randomUUID() }, AGORA);
  const [linha] = await linhasDe(conta);
  expect(linha).toMatchObject({ tipo: 'mochila', itemId: 'media', origem: 'grana' });
  expect(linha.expiraEm?.getTime()).toBe(AGORA.getTime() + DIA);
  expect((await recarregar(bd, conta)).grana).toBe(60);
});

test('mochila para sempre cobra 300 de Magcoin na tática', async () => {
  const conta = await contaCom(0, 300);
  await comprarMochila(bd, conta, { itemId: 'tatica', dias: null, codigo: randomUUID() }, AGORA);
  const [linha] = await linhasDe(conta);
  expect(linha).toMatchObject({ tipo: 'mochila', itemId: 'tatica', origem: 'magcoin', expiraEm: null });
  expect((await recarregar(bd, conta)).magcoin).toBe(0);
});

test('a mochila básica não se compra', async () => {
  const conta = await contaCom(1000, 1000);
  await expect(comprarMochila(bd, conta, { itemId: 'basica', dias: 1, codigo: randomUUID() }, AGORA)).rejects.toThrow(ItemInvalido);
});

test('vender joias e relógio dá 23 de grana numa linha venda', async () => {
  const conta = await contaCom(0);
  const linhas = [await darSaque(conta, 'joias'), await darSaque(conta, 'relogio')];
  const codigo = randomUUID();
  expect(await venderSaque(bd, conta, { linhas, codigo })).toEqual({ grana: 23 });
  expect(await venderSaque(bd, conta, { linhas, codigo })).toBe('repetido');
  const vendas = await bd.select().from(lancamentosDeGrana).where(and(eq(lancamentosDeGrana.usuarioId, conta.id), eq(lancamentosDeGrana.tipo, 'venda')));
  expect(vendas.map((linha) => linha.quantidade)).toEqual([23]);
  expect((await linhasDe(conta)).every((linha) => linha.situacao === 'vendido')).toBe(true);
  expect((await recarregar(bd, conta)).grana).toBe(23);
});

test('vender linha de outra conta ou já vendida lança ItemInvalido', async () => {
  const conta = await contaCom(0);
  const outra = await contaCom(0);
  await expect(venderSaque(bd, conta, { linhas: [await darSaque(outra, 'joias')], codigo: randomUUID() })).rejects.toThrow(ItemInvalido);
  await expect(venderSaque(bd, conta, { linhas: [await darSaque(conta, 'joias', 'vendido')], codigo: randomUUID() })).rejects.toThrow(ItemInvalido);
  await expect(venderSaque(bd, conta, { linhas: [], codigo: randomUUID() })).rejects.toThrow(ItemInvalido);
});

test('o baú mostra só o que está no baú ou em campo, com nome e vencimento', async () => {
  const conta = await contaCom(500, 500);
  await comprarComGrana(bd, conta, { itemId: 'ak47', quantidade: 1, codigo: randomUUID() }, AGORA);
  await comprarArmaComMagcoin(bd, conta, { itemId: 'awp', dias: 1, codigo: randomUUID() }, AGORA);
  await darSaque(conta, 'joias', 'vendido');
  const bau = await bauDaLemnos(bd, conta.id, new Date(AGORA.getTime() + 2 * DIA));
  expect(bau.map((item) => [item.itemId, item.nome, item.vencido, item.emCampo]).sort()).toEqual([
    ['ak47', 'AK-47', false, false],
    ['awp', 'AWP', true, false],
  ]);
});
