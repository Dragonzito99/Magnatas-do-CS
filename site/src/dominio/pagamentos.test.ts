import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { assinaturas, auditoria, lancamentosDeGrana, pedidos, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { assinaturaConfere, type MercadoPago, type PagamentoMp } from '@/pagamento/mercadopago';
import { lancarMoeda } from './grana';
import { abrirPedido, assinar, cancelarAssinatura, JaEhMembro, PACOTES, processarAssinatura, processarMensalidade, processarPagamento, receberAviso } from './pagamentos';

let bd: Bd;
let mp: MercadoPagoFalso;
const ENDERECOS = { site: 'https://magnatas.test' };

class MercadoPagoFalso implements MercadoPago {
  pagamentos = new Map<string, PagamentoMp>();
  assinaturas = new Map<string, { id: string; status: string; external_reference: string }>();
  autorizados = new Map<string, { id: string; preapproval_id: string; transaction_amount: number; date_created: string; payment: { id: string; status: string } | null }>();
  preferencias: unknown[] = [];
  canceladas: string[] = [];

  async criarPreferencia(pedido: { pedidoId: string; titulo: string; valorCentavos: number }) {
    this.preferencias.push(pedido);
    return { id: `pref-${pedido.pedidoId}`, init_point: `https://mp.test/checkout/${pedido.pedidoId}` };
  }
  async buscarPagamento(id: string) {
    const pagamento = this.pagamentos.get(id);
    if (!pagamento) throw new Error('não existe');
    return pagamento;
  }
  async criarAssinatura(dados: { assinaturaId: string; titulo: string; valorCentavos: number; email: string }) {
    const id = `pre-${dados.assinaturaId}`;
    this.assinaturas.set(id, { id, status: 'pending', external_reference: dados.assinaturaId });
    return { id, init_point: `https://mp.test/assinar/${id}` };
  }
  async buscarAssinatura(id: string) {
    const assinatura = this.assinaturas.get(id);
    if (!assinatura) throw new Error('não existe');
    return assinatura;
  }
  async buscarPagamentoAutorizado(id: string) {
    const autorizado = this.autorizados.get(id);
    if (!autorizado) throw new Error('não existe');
    return autorizado;
  }
  async cancelarAssinatura(id: string) {
    this.canceladas.push(id);
    const assinatura = this.assinaturas.get(id);
    if (assinatura) assinatura.status = 'cancelled';
  }
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  mp = new MercadoPagoFalso();
});

const conta = () => criarUsuario(bd, { estado: 'ativo' });

async function pedidoPago(dono: Usuario, pacote: keyof typeof PACOTES = 'pequeno', valor?: number) {
  await abrirPedido(bd, mp, dono, pacote, ENDERECOS);
  const [pedido] = await bd.select().from(pedidos).where(eq(pedidos.usuarioId, dono.id));
  const id = `pay-${pedido.id.slice(0, 8)}`;
  mp.pagamentos.set(id, { id, status: 'approved', transaction_amount: valor ?? PACOTES[pacote].precoCentavos / 100, external_reference: pedido.id });
  return { pedido, id };
}

test('os pacotes aprovados pelo dono', () => {
  expect(PACOTES).toMatchObject({
    pequeno: { precoCentavos: 1000, magcoins: 100 },
    medio: { precoCentavos: 2500, magcoins: 260 },
    grande: { precoCentavos: 5000, magcoins: 550 },
  });
});

test('abrir um pedido leva para a página de pagamento do Mercado Pago', async () => {
  const dono = await conta();
  const endereco = await abrirPedido(bd, mp, dono, 'medio', ENDERECOS);
  const [pedido] = await bd.select().from(pedidos);
  expect(endereco).toBe(`https://mp.test/checkout/${pedido.id}`);
  expect(pedido).toMatchObject({ pacote: 'medio', valorCentavos: 2500, magcoins: 260, estado: 'aberto' });
});

test('pagamento aprovado credita as MagCoins uma vez, mesmo com o aviso repetido', async () => {
  const dono = await conta();
  const { id } = await pedidoPago(dono);
  await processarPagamento(bd, mp, id);
  await processarPagamento(bd, mp, id);
  expect((await recarregar(bd, dono)).magcoin).toBe(100);
  const [pedido] = await bd.select().from(pedidos);
  expect(pedido).toMatchObject({ estado: 'pago', mpPagamentoId: id });
});

test('pagamento pendente ou recusado não credita', async () => {
  const dono = await conta();
  const { id } = await pedidoPago(dono);
  for (const status of ['pending', 'in_process', 'rejected']) {
    mp.pagamentos.get(id)!.status = status;
    await processarPagamento(bd, mp, id);
  }
  expect((await recarregar(bd, dono)).magcoin).toBe(0);
});

test('valor diferente do pacote não credita', async () => {
  const dono = await conta();
  const { id } = await pedidoPago(dono, 'grande', 10);
  await processarPagamento(bd, mp, id);
  expect((await recarregar(bd, dono)).magcoin).toBe(0);
});

test('um pagamento não paga dois pedidos', async () => {
  const dono = await conta();
  const primeiro = await pedidoPago(dono);
  await processarPagamento(bd, mp, primeiro.id);
  await abrirPedido(bd, mp, dono, 'pequeno', ENDERECOS);
  const [segundo] = (await bd.select().from(pedidos).where(eq(pedidos.estado, 'aberto')));
  mp.pagamentos.set(primeiro.id, { ...mp.pagamentos.get(primeiro.id)!, external_reference: segundo.id });
  await processarPagamento(bd, mp, primeiro.id);
  expect((await recarregar(bd, dono)).magcoin).toBe(100);
});

test('estorno tira as MagCoins; se já gastou, zera e avisa o Painel', async () => {
  const dono = await conta();
  const { id } = await pedidoPago(dono);
  await processarPagamento(bd, mp, id);
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: dono.id, tipo: 'compra', quantidade: -70, referencia: 'gastou' }));
  mp.pagamentos.get(id)!.status = 'charged_back';
  await processarPagamento(bd, mp, id);
  await processarPagamento(bd, mp, id);
  expect((await recarregar(bd, dono)).magcoin).toBe(0);
  const [pedido] = await bd.select().from(pedidos);
  expect(pedido.estado).toBe('estornado');
  const estornos = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.tipo, 'estorno'));
  expect(estornos.map((linha) => linha.quantidade)).toEqual([-30]);
  expect(await bd.select().from(auditoria).where(eq(auditoria.acao, 'estorno_sem_saldo'))).toHaveLength(1);
});

test('assinar cria a assinatura pendente e leva para o Mercado Pago; quem já é membro não assina outra', async () => {
  const dono = await conta();
  const endereco = await assinar(bd, mp, dono, 'ouro', 'eu@mp.com', ENDERECOS);
  const [assinatura] = await bd.select().from(assinaturas);
  expect(endereco).toBe(`https://mp.test/assinar/pre-${assinatura.id}`);
  expect(assinatura).toMatchObject({ nivel: 'ouro', estado: 'pendente', mpAssinaturaId: `pre-${assinatura.id}`, email: 'eu@mp.com' });
  mp.autorizados.set('a1', { id: 'a1', preapproval_id: `pre-${assinatura.id}`, transaction_amount: 15, date_created: new Date().toISOString(), payment: { id: 'pg1', status: 'approved' } });
  await processarMensalidade(bd, mp, 'a1');
  await expect(assinar(bd, mp, dono, 'premium', 'eu@mp.com', ENDERECOS)).rejects.toBeInstanceOf(JaEhMembro);
});

test('mensalidade só conta aprovada e com o valor do nível', async () => {
  const dono = await conta();
  await assinar(bd, mp, dono, 'prata', 'eu@mp.com', ENDERECOS);
  const [assinatura] = await bd.select().from(assinaturas);
  const preapproval = `pre-${assinatura.id}`;
  mp.autorizados.set('a1', { id: 'a1', preapproval_id: preapproval, transaction_amount: 10, date_created: new Date().toISOString(), payment: { id: 'pg1', status: 'rejected' } });
  mp.autorizados.set('a2', { id: 'a2', preapproval_id: preapproval, transaction_amount: 1, date_created: new Date().toISOString(), payment: { id: 'pg2', status: 'approved' } });
  mp.autorizados.set('a3', { id: 'a3', preapproval_id: preapproval, transaction_amount: 10, date_created: new Date().toISOString(), payment: { id: 'pg3', status: 'approved' } });
  for (const id of ['a1', 'a2', 'a3', 'a3']) await processarMensalidade(bd, mp, id);
  expect((await recarregar(bd, dono)).magcoin).toBe(50);
});

test('cancelar no site cancela no Mercado Pago e mantém o que já foi pago', async () => {
  const dono = await conta();
  await assinar(bd, mp, dono, 'bronze', 'eu@mp.com', ENDERECOS);
  const [assinatura] = await bd.select().from(assinaturas);
  mp.autorizados.set('a1', { id: 'a1', preapproval_id: `pre-${assinatura.id}`, transaction_amount: 5, date_created: new Date().toISOString(), payment: { id: 'pg1', status: 'approved' } });
  await processarMensalidade(bd, mp, 'a1');
  await cancelarAssinatura(bd, mp, dono);
  const [depois] = await bd.select().from(assinaturas);
  expect(mp.canceladas).toEqual([`pre-${assinatura.id}`]);
  expect(depois.estado).toBe('cancelada');
  expect(depois.pagoAte!.getTime()).toBeGreaterThan(Date.now());
});

test('o aviso de assinatura cancelada pelo Mercado Pago marca a assinatura como cancelada', async () => {
  const dono = await conta();
  await assinar(bd, mp, dono, 'bronze', 'eu@mp.com', ENDERECOS);
  const [assinatura] = await bd.select().from(assinaturas);
  mp.assinaturas.get(`pre-${assinatura.id}`)!.status = 'cancelled';
  await processarAssinatura(bd, mp, `pre-${assinatura.id}`);
  expect((await bd.select().from(assinaturas))[0].estado).toBe('cancelada');
});

test('a assinatura do aviso confere com a chave secreta, e qualquer mudança é recusada', () => {
  const segredo = 'chave-de-teste';
  const ts = '1704908010';
  const manifesto = 'id:abc123;request-id:req-1;ts:1704908010;';
  const v1 = createHmac('sha256', segredo).update(manifesto).digest('hex');
  const cabecalho = `ts=${ts},v1=${v1}`;
  expect(assinaturaConfere({ xSignature: cabecalho, xRequestId: 'req-1', dataId: 'ABC123', segredo })).toBe(true);
  expect(assinaturaConfere({ xSignature: cabecalho, xRequestId: 'req-2', dataId: 'abc123', segredo })).toBe(false);
  expect(assinaturaConfere({ xSignature: cabecalho, xRequestId: 'req-1', dataId: 'abc124', segredo })).toBe(false);
  expect(assinaturaConfere({ xSignature: 'lixo', xRequestId: 'req-1', dataId: 'abc123', segredo })).toBe(false);
});

test('o aviso leva ao processamento certo; assinatura errada é recusada sem consultar nada', async () => {
  const dono = await conta();
  const { id } = await pedidoPago(dono);
  const segredo = 'chave-de-teste';
  const assinar = (dataId: string, requestId = 'req-1') => {
    const ts = '1704908010';
    const v1 = createHmac('sha256', segredo).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
  };
  expect(await receberAviso(bd, mp, { tipo: 'payment', dataId: id, cabecalhos: { 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'r' } }, segredo)).toBe(401);
  expect((await recarregar(bd, dono)).magcoin).toBe(0);
  expect(await receberAviso(bd, mp, { tipo: 'payment', dataId: id, cabecalhos: assinar(id) }, segredo)).toBe(200);
  expect((await recarregar(bd, dono)).magcoin).toBe(100);
  // Sem cabeçalho (avisos de assinatura não passam pelo painel de webhooks): vale, porque o que decide é a API.
  expect(await receberAviso(bd, mp, { tipo: 'payment', dataId: id, cabecalhos: {} }, segredo)).toBe(200);
  expect(await receberAviso(bd, mp, { tipo: 'outra_coisa', dataId: 'x', cabecalhos: {} }, segredo)).toBe(200);
  expect(await receberAviso(bd, mp, { tipo: 'payment', dataId: '', cabecalhos: {} }, segredo)).toBe(400);
});
