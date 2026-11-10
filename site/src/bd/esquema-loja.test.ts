import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from './conexao';
import { itensDoJogador, lancamentosDeGrana, usuarios } from './esquema';
import { criarBancoDeTeste, criarUsuario } from './teste';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('conta nasce com 0 de Grana e o banco recusa saldo negativo', async () => {
  const conta = await criarUsuario(bd);
  expect(conta.grana).toBe(0);
  await expect(bd.update(usuarios).set({ grana: -1 }).where(eq(usuarios.id, conta.id))).rejects.toThrow();
});

test('a mesma referência não entra duas vezes no livro-caixa do mesmo tipo', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'partida', quantidade: 50, referencia: 'p1' });
  await expect(bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'partida', quantidade: 50, referencia: 'p1' })).rejects.toThrow();
});

test('a mesma referência com tipo diferente entra', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'partida', quantidade: 50, referencia: 'x' });
  await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'ajuste', quantidade: -5, referencia: 'x' });
  expect(await bd.select().from(lancamentosDeGrana)).toHaveLength(2);
});

test('linha com quantidade 0 é recusada', async () => {
  const conta = await criarUsuario(bd);
  await expect(bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'ajuste', quantidade: 0, referencia: 'z' })).rejects.toThrow();
});

test('cada item aparece uma vez no baú da conta, e sem prazo vale para sempre', async () => {
  const conta = await criarUsuario(bd);
  const [item] = await bd.insert(itensDoJogador).values({ usuarioId: conta.id, itemId: 'cor-verde' }).returning();
  expect(item.expiraEm).toBeNull();
  expect(item.usando).toBe(false);
  await expect(bd.insert(itensDoJogador).values({ usuarioId: conta.id, itemId: 'cor-verde' })).rejects.toThrow();
});
