import { obterBd } from '@/bd/conexao';
import { aplicarResultadoVerificacao } from '@/dominio/verificacao';
import { assinaturaValida, decidida, resultadoDaDecisao, type DecisaoDaDidit } from '@/verificacao/didit';

export const dynamic = 'force-dynamic';

type Aviso = { session_id?: string; status?: string; decision?: DecisaoDaDidit };

/**
 * O aviso da Didit quando a verificação termina. Só vale com a assinatura certa; aprovada ou recusada, o resultado
 * entra igual ao da volta pela página (o que chegar primeiro decide, o segundo não muda nada).
 */
export async function POST(pedido: Request): Promise<Response> {
  const corpo = await pedido.text();
  const segredo = process.env.DIDIT_WEBHOOK_SECRET ?? '';
  if (!assinaturaValida(corpo, pedido.headers.get('x-signature'), pedido.headers.get('x-timestamp'), segredo)) {
    return new Response(null, { status: 401 });
  }
  let aviso: Aviso;
  try {
    aviso = JSON.parse(corpo) as Aviso;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!aviso.session_id || !decidida(aviso.status)) return new Response(null, { status: 200 });
  try {
    await aplicarResultadoVerificacao(
      obterBd(),
      resultadoDaDecisao(aviso.session_id, { ...aviso.decision, status: aviso.status }),
      process.env.CPF_HMAC_CHAVE ?? '',
    );
  } catch (erro) {
    // Sessão que não é deste site (ou de teste) não é erro da Didit: responde 200 para ela não repetir.
    if (erro instanceof Error && erro.message === 'Verificação desconhecida.') return new Response(null, { status: 200 });
    throw erro;
  }
  return new Response(null, { status: 200 });
}
