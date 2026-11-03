import { obterBd } from '@/bd/conexao';
import { respostaDaGravacao } from '@/dominio/gravacoes';

export async function POST(pedido: Request, { params }: { params: Promise<{ token: string }> }) {
  const pasta = process.env.GRAVACOES_PASTA;
  if (!pasta) return new Response('GRAVACOES_PASTA não configurada.', { status: 500 });
  const { token } = await params;
  return respostaDaGravacao(obterBd(), pasta, token, process.env.SERVIDOR_TOKEN, pedido);
}
