import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { respostaDoDownload } from '@/dominio/gravacoes';

export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }) {
  const pasta = process.env.GRAVACOES_PASTA;
  if (!pasta) return new Response('GRAVACOES_PASTA não configurada.', { status: 500 });
  const { id } = await params;
  return respostaDoDownload(obterBd(), pasta, await usuarioAtual(), id);
}
