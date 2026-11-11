import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { assinaturas, envios, itensDoJogador, lancamentosDeGrana, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { bauDe, comprarItem, usarItem, visuaisDe } from './loja';
import { aplicarMensalidade, NIVEIS, nivelAtivo } from './membros';
import { lancarGrana } from './grana';
import { lancarXp } from './xp';

let bd: Bd;
const DIA = 24 * 60 * 60 * 1000;
const PAGO = new Date('2026-11-10T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function assinante(nivel: 'bronze' | 'prata' | 'ouro' | 'premium'): Promise<{ conta: Usuario; assinaturaId: string }> {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [assinatura] = await bd.insert(assinaturas).values({ usuarioId: conta.id, nivel, email: 'x@y.z', mpAssinaturaId: `mp-${conta.id}` }).returning();
  return { conta, assinaturaId: assinatura.id };
}

const pagar = (assinaturaId: string, mpPagamentoId: string, pagoEm = PAGO, valorCentavos = 3000) =>
  bd.transaction((tx) => aplicarMensalidade(tx, { assinaturaId, mpPagamentoId, valorCentavos, pagoEm }));

test('os níveis aprovados pelo dono', () => {
  expect(NIVEIS.bronze).toMatchObject({ precoCentavos: 500, bonusGrana: 0.1, magcoinsPorMes: 0, itens: ['etiqueta-apoiador'] });
  expect(NIVEIS.prata).toMatchObject({ precoCentavos: 1000, bonusGrana: 0.2, magcoinsPorMes: 50, itens: ['etiqueta-apoiador', 'cor-dourada'] });
  expect(NIVEIS.ouro).toMatchObject({ precoCentavos: 1500, bonusGrana: 0.3, magcoinsPorMes: 100, itens: ['etiqueta-apoiador', 'moldura-ouro'] });
  expect(NIVEIS.premium).toMatchObject({ precoCentavos: 3000, bonusGrana: 0.3, magcoinsPorMes: 250, itens: ['etiqueta-apoiador', 'moldura-ouro'], premium: true });
});

test('a mensalidade vale um mês e 3 dias, credita as MagCoins do mês uma vez e liga o nível', async () => {
  const { conta, assinaturaId } = await assinante('prata');
  expect(await pagar(assinaturaId, 'p1')).toBe(true);
  expect(await pagar(assinaturaId, 'p1')).toBe(false);
  const [assinatura] = await bd.select().from(assinaturas).where(eq(assinaturas.id, assinaturaId));
  expect(assinatura).toMatchObject({ estado: 'ativa', mensalidadesPagas: 1 });
  expect(assinatura.pagoAte).toEqual(new Date('2026-12-13T12:00:00Z'));
  expect((await recarregar(bd, conta)).magcoin).toBe(50);
  expect(await nivelAtivo(bd, conta.id, new Date(PAGO.getTime() + 10 * DIA))).toBe('prata');
  expect(await nivelAtivo(bd, conta.id, new Date('2026-12-14T00:00:00Z'))).toBeNull();
});

test('os itens do nível vão para o baú até o fim do que foi pago, e a etiqueta de apoiador entra em uso sozinha', async () => {
  const { conta, assinaturaId } = await assinante('ouro');
  await pagar(assinaturaId, 'p1');
  const bau = await bauDe(bd, conta.id, PAGO);
  expect(bau.map((posse) => posse.item.id).sort()).toEqual(['etiqueta-apoiador', 'moldura-ouro']);
  expect(await visuaisDe(bd, [conta.steamid64], PAGO)).toEqual({ [conta.steamid64]: { etiqueta: '[APOIADOR]' } });
  expect(await visuaisDe(bd, [conta.steamid64], new Date('2026-12-20T00:00:00Z'))).toEqual({});
});

test('quem já usa uma etiqueta comprada continua com ela', async () => {
  const { conta, assinaturaId } = await assinante('bronze');
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 700, referencia: 'x' }));
  await comprarItem(bd, conta, { itemId: 'etiqueta-don', dias: 9, codigo: crypto.randomUUID() }, PAGO);
  await usarItem(bd, conta, 'etiqueta-don', PAGO);
  await pagar(assinaturaId, 'p1');
  expect(await visuaisDe(bd, [conta.steamid64], PAGO)).toEqual({ [conta.steamid64]: { etiqueta: '[DON]' } });
});

test('item do nível que a pessoa já tinha para sempre continua para sempre', async () => {
  const { conta, assinaturaId } = await assinante('prata');
  await bd.insert(itensDoJogador).values({ usuarioId: conta.id, itemId: 'cor-dourada', expiraEm: null });
  await pagar(assinaturaId, 'p1');
  const [linha] = await bd.select().from(itensDoJogador).where(eq(itensDoJogador.itemId, 'cor-dourada'));
  expect(linha.expiraEm).toBeNull();
});

test('o Premium ganha os itens de lançamento para sempre e um envio na 1ª, 3ª e 5ª mensalidade', async () => {
  const { conta, assinaturaId } = await assinante('premium');
  for (let mes = 0; mes < 5; mes += 1) await pagar(assinaturaId, `p${mes}`, new Date(PAGO.getTime() + mes * 30 * DIA));
  const [blindado] = await bd.select().from(itensDoJogador).where(eq(itensDoJogador.itemId, 'mutante-blindado'));
  expect(blindado.expiraEm).toBeNull();
  expect(await bd.select().from(envios).where(eq(envios.usuarioId, conta.id))).toHaveLength(3);
  expect((await recarregar(bd, conta)).magcoin).toBe(5 * 250);
});

test('membro ganha Grana a mais pela partida, pelo nível do dia', async () => {
  const { conta, assinaturaId } = await assinante('ouro');
  await pagar(assinaturaId, 'p1', new Date());
  await bd.transaction((tx) => lancarXp(tx, [{ usuarioId: conta.id, origem: 'partida', referencia: 'partida-1', abates: 10, resultado: 'vitoria', jogouAteOFim: true }]));
  const [linha] = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.tipo, 'partida'));
  // 800 XP: 80 de Grana, mais 30%.
  expect(linha.quantidade).toBe(104);
});
