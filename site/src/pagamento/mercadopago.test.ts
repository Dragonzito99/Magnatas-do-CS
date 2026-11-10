import { expect, test } from 'vitest';
import { mercadoPago, MercadoPagoErro } from './mercadopago';

function fetchFalso(respostas: Record<string, unknown>, chamadas: { url: string; init: RequestInit }[]) {
  return (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const caminho = new URL(url).pathname;
    const corpo = respostas[caminho];
    if (corpo === undefined) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(corpo), { status: 200 });
  }) as unknown as typeof fetch;
}

test('a página de pagamento leva o valor em reais, o pedido e onde avisar', async () => {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const mp = mercadoPago('TOKEN-TESTE', fetchFalso({ '/checkout/preferences': { id: 'p1', init_point: 'https://mp/1' } }, chamadas));
  expect(await mp.criarPreferencia({ pedidoId: 'abc', titulo: '100 MagCoins', valorCentavos: 1000, site: 'https://site' })).toEqual({ id: 'p1', init_point: 'https://mp/1' });
  const corpo = JSON.parse(String(chamadas[0].init.body));
  expect(corpo).toMatchObject({
    items: [{ id: 'abc', quantity: 1, currency_id: 'BRL', unit_price: 10 }],
    external_reference: 'abc',
    notification_url: 'https://site/api/pagamentos/mercadopago',
  });
  expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN-TESTE');
  expect((chamadas[0].init.headers as Record<string, string>)['X-Idempotency-Key']).toBe('pedido-abc');
});

test('a assinatura é mensal no valor do nível', async () => {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const mp = mercadoPago('T', fetchFalso({ '/preapproval': { id: 'pre1', init_point: 'https://mp/a' } }, chamadas));
  await mp.criarAssinatura({ assinaturaId: 'as1', titulo: 'Ouro', valorCentavos: 1500, email: 'a@b.c' });
  expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({
    external_reference: 'as1',
    payer_email: 'a@b.c',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 15, currency_id: 'BRL' },
    status: 'pending',
  });
});

test('ids numéricos viram texto, e erro do Mercado Pago não mostra a chave', async () => {
  const mp = mercadoPago('SEGREDO', fetchFalso({ '/v1/payments/7': { id: 7, status: 'approved', transaction_amount: 10, external_reference: 'x' } }, []));
  expect(await mp.buscarPagamento('7')).toEqual({ id: '7', status: 'approved', transaction_amount: 10, external_reference: 'x' });
  const erro = await mp.buscarPagamento('8').catch((falha) => falha);
  expect(erro).toBeInstanceOf(MercadoPagoErro);
  expect(String(erro.message)).not.toContain('SEGREDO');
});
