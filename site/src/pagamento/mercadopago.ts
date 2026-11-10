import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * O que o site usa da API do Mercado Pago. O site nunca confia no corpo de um aviso: com o id do aviso, busca o
 * pagamento ou a assinatura aqui, com a chave da conta, e só então decide.
 */
export type PagamentoMp = { id: string; status: string; transaction_amount: number; external_reference: string | null };
export type AssinaturaMp = { id: string; status: string; external_reference: string | null };
export type PagamentoAutorizadoMp = {
  id: string;
  preapproval_id: string;
  transaction_amount: number;
  date_created: string;
  payment: { id: string; status: string } | null;
};

export interface MercadoPago {
  criarPreferencia(pedido: { pedidoId: string; titulo: string; valorCentavos: number; site?: string }): Promise<{ id: string; init_point: string }>;
  buscarPagamento(id: string): Promise<PagamentoMp>;
  criarAssinatura(dados: { assinaturaId: string; titulo: string; valorCentavos: number; email: string; site?: string }): Promise<{ id: string; init_point: string }>;
  buscarAssinatura(id: string): Promise<AssinaturaMp>;
  buscarPagamentoAutorizado(id: string): Promise<PagamentoAutorizadoMp>;
  cancelarAssinatura(id: string): Promise<void>;
}

const API = 'https://api.mercadopago.com';

export class MercadoPagoErro extends Error {
  constructor(public readonly status: number, caminho: string) {
    super(`O Mercado Pago respondeu ${status} em ${caminho}.`);
  }
}

/** O cliente de verdade, com a chave da conta (MP_ACCESS_TOKEN). A chave nunca vai para log nem para mensagens de erro. */
export function mercadoPago(token: string, buscar: typeof fetch = fetch): MercadoPago {
  async function pedir<T>(metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown, chave?: string): Promise<T> {
    const resposta = await buscar(`${API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(chave ? { 'X-Idempotency-Key': chave } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) throw new MercadoPagoErro(resposta.status, caminho.split('?')[0]);
    return (await resposta.json()) as T;
  }
  const texto = (valor: unknown) => (valor === null || valor === undefined ? null : String(valor));
  const reais = (centavos: number) => Math.round(centavos) / 100;

  return {
    async criarPreferencia({ pedidoId, titulo, valorCentavos, site }) {
      const resposta = await pedir<{ id: string; init_point: string }>(
        'POST',
        '/checkout/preferences',
        {
          items: [{ id: pedidoId, title: titulo, quantity: 1, currency_id: 'BRL', unit_price: reais(valorCentavos) }],
          external_reference: pedidoId,
          back_urls: site ? { success: `${site}/apoio/retorno`, pending: `${site}/apoio/retorno`, failure: `${site}/apoio/retorno` } : undefined,
          auto_return: site ? 'approved' : undefined,
          notification_url: site ? `${site}/api/pagamentos/mercadopago` : undefined,
          statement_descriptor: 'MAGNATAS',
        },
        `pedido-${pedidoId}`,
      );
      return { id: resposta.id, init_point: resposta.init_point };
    },
    async buscarPagamento(id) {
      const pagamento = await pedir<{ id: number; status: string; transaction_amount: number; external_reference: string | null }>('GET', `/v1/payments/${encodeURIComponent(id)}`);
      return { id: String(pagamento.id), status: pagamento.status, transaction_amount: pagamento.transaction_amount, external_reference: texto(pagamento.external_reference) };
    },
    async criarAssinatura({ assinaturaId, titulo, valorCentavos, email, site }) {
      const resposta = await pedir<{ id: string; init_point: string }>(
        'POST',
        '/preapproval',
        {
          reason: titulo,
          external_reference: assinaturaId,
          payer_email: email,
          auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: reais(valorCentavos), currency_id: 'BRL' },
          back_url: site ? `${site}/apoio/retorno` : undefined,
          notification_url: site ? `${site}/api/pagamentos/mercadopago` : undefined,
          status: 'pending',
        },
        `assinatura-${assinaturaId}`,
      );
      return { id: resposta.id, init_point: resposta.init_point };
    },
    async buscarAssinatura(id) {
      const assinatura = await pedir<{ id: string; status: string; external_reference: string | null }>('GET', `/preapproval/${encodeURIComponent(id)}`);
      return { id: assinatura.id, status: assinatura.status, external_reference: texto(assinatura.external_reference) };
    },
    async buscarPagamentoAutorizado(id) {
      const autorizado = await pedir<{
        id: number;
        preapproval_id: string;
        transaction_amount: number;
        date_created: string;
        payment?: { id: number; status: string } | null;
      }>('GET', `/authorized_payments/${encodeURIComponent(id)}`);
      return {
        id: String(autorizado.id),
        preapproval_id: autorizado.preapproval_id,
        transaction_amount: autorizado.transaction_amount,
        date_created: autorizado.date_created,
        payment: autorizado.payment ? { id: String(autorizado.payment.id), status: autorizado.payment.status } : null,
      };
    },
    async cancelarAssinatura(id) {
      await pedir('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' });
    },
  };
}

/**
 * Confere o cabeçalho x-signature de um aviso: HMAC-SHA256, com a chave secreta dos avisos, do texto
 * `id:{data.id};request-id:{x-request-id};ts:{ts};` (o id em minúsculas), comparado com o v1.
 */
export function assinaturaConfere({ xSignature, xRequestId, dataId, segredo }: { xSignature: string; xRequestId: string; dataId: string; segredo: string }): boolean {
  const partes = Object.fromEntries(
    xSignature.split(',').map((parte) => {
      const [chave, ...resto] = parte.split('=');
      return [chave.trim(), resto.join('=').trim()];
    }),
  );
  const { ts, v1 } = partes as { ts?: string; v1?: string };
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const esperado = createHmac('sha256', segredo).update(`id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`).digest();
  return timingSafeEqual(esperado, Buffer.from(v1, 'hex'));
}
