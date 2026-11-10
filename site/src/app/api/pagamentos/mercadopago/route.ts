import { obterBd } from '@/bd/conexao';
import { receberAviso } from '@/dominio/pagamentos';
import { mercadoPago } from '@/pagamento/mercadopago';

/** Avisos do Mercado Pago (pagamentos e assinaturas). Erro devolve 500 para o Mercado Pago tentar de novo depois. */
export async function POST(pedido: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return new Response('Pagamentos desligados.', { status: 503 });
  const url = new URL(pedido.url);
  let corpo: { type?: string; topic?: string; data?: { id?: string | number } } = {};
  try {
    corpo = await pedido.json();
  } catch {
    // Alguns avisos vêm só com a consulta na URL.
  }
  const tipo = String(corpo.type ?? corpo.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '');
  const dataId = String(url.searchParams.get('data.id') ?? corpo.data?.id ?? url.searchParams.get('id') ?? '');
  try {
    const status = await receberAviso(
      obterBd(),
      mercadoPago(token),
      { tipo, dataId, cabecalhos: { 'x-signature': pedido.headers.get('x-signature') ?? undefined, 'x-request-id': pedido.headers.get('x-request-id') ?? undefined } },
      process.env.MP_WEBHOOK_SECRET,
    );
    return new Response(null, { status });
  } catch (erro) {
    console.error('[pagamentos] Falha ao processar o aviso:', erro instanceof Error ? erro.message : 'erro');
    return new Response(null, { status: 500 });
  }
}
