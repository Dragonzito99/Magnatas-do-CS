import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { avisoPendente } from '@/dominio/aceites';
import { criarFluxoDeAvisos } from './sse';

export const dynamic = 'force-dynamic';

/**
 * Conexão que o navegador mantém aberta, mesmo com a aba escondida, para saber na hora
 * que uma partida apareceu e precisa do aceite da pessoa.
 */
export async function GET(pedido: Request): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const bd = obterBd();
  const corpo = criarFluxoDeAvisos(() => avisoPendente(bd, usuario.id), pedido.signal);
  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
