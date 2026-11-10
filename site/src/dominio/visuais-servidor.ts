import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { visuaisDe } from './loja';

const MAXIMO_POR_PEDIDO = 64;
const STEAMID = /^\d{17}$/;

/**
 * O plugin MagnatasVisual pergunta, ao entrar alguém e a cada rodada, o que os jogadores estão usando. O site responde
 * só o resultado pronto (cor, etiqueta, aviso): o servidor não sabe de saldo nem de preço.
 */
export async function respostaDosVisuais(bd: Bd, cabecalho: string | null, tokenEsperado: string | undefined, url: string): Promise<Response> {
  if (!tokenConfere(cabecalho, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  const pedidos = (new URL(url).searchParams.get('steamids') ?? '').split(',').filter((steamid) => STEAMID.test(steamid));
  if (pedidos.length > MAXIMO_POR_PEDIDO) return new Response('Contas demais.', { status: 400 });
  return Response.json(await visuaisDe(bd, [...new Set(pedidos)]), { headers: { 'Cache-Control': 'no-store' } });
}
