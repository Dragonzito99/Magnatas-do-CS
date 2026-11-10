import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from './conexao';
import { assinaturas, enderecos, envios, lancamentosDeGrana, mensalidades, pedidos, usuarios } from './esquema';
import { criarBancoDeTeste, criarUsuario } from './teste';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('conta nasce com 0 MagCoin e o banco recusa saldo negativo', async () => {
  const conta = await criarUsuario(bd);
  expect(conta.magcoin).toBe(0);
  await expect(bd.update(usuarios).set({ magcoin: -1 }).where(eq(usuarios.id, conta.id))).rejects.toThrow();
});

test('a mesma referência pode existir em moedas diferentes, mas não duas vezes na mesma moeda', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, moeda: 'magcoin', tipo: 'pagamento', quantidade: 100, referencia: 'p1' });
  await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, moeda: 'grana', tipo: 'pagamento', quantidade: 100, referencia: 'p1' });
  await expect(bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, moeda: 'magcoin', tipo: 'pagamento', quantidade: 100, referencia: 'p1' })).rejects.toThrow();
  const [antiga] = await bd.insert(lancamentosDeGrana).values({ usuarioId: conta.id, tipo: 'ajuste', quantidade: 5, referencia: 'x' }).returning();
  expect(antiga.moeda).toBe('grana');
});

test('um pagamento do Mercado Pago só vira um pedido pago', async () => {
  const conta = await criarUsuario(bd);
  await bd.insert(pedidos).values({ usuarioId: conta.id, pacote: 'pequeno', valorCentavos: 1000, magcoins: 100, mpPagamentoId: '123' });
  await expect(bd.insert(pedidos).values({ usuarioId: conta.id, pacote: 'pequeno', valorCentavos: 1000, magcoins: 100, mpPagamentoId: '123' })).rejects.toThrow();
});

test('mensalidade única por pagamento, envio único por mensalidade, endereço um por conta', async () => {
  const conta = await criarUsuario(bd);
  const [assinatura] = await bd.insert(assinaturas).values({ usuarioId: conta.id, nivel: 'premium', email: 'a@b.c' }).returning();
  expect(assinatura).toMatchObject({ estado: 'pendente', mensalidadesPagas: 0, pagoAte: null });
  const [mensalidade] = await bd.insert(mensalidades).values({ assinaturaId: assinatura.id, mpPagamentoId: '9', valorCentavos: 3000, pagoEm: new Date() }).returning();
  await expect(bd.insert(mensalidades).values({ assinaturaId: assinatura.id, mpPagamentoId: '9', valorCentavos: 3000, pagoEm: new Date() })).rejects.toThrow();
  await bd.insert(envios).values({ usuarioId: conta.id, mensalidadeId: mensalidade.id });
  await expect(bd.insert(envios).values({ usuarioId: conta.id, mensalidadeId: mensalidade.id })).rejects.toThrow();
  const endereco = { usuarioId: conta.id, nome: 'Fulano', cep: '59000000', rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Natal', uf: 'RN', telefone: '84999999999' };
  await bd.insert(enderecos).values(endereco);
  await expect(bd.insert(enderecos).values(endereco)).rejects.toThrow();
});
