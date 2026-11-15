import { obterBd } from '@/bd/conexao';
import { respostaDoAviso } from '@/dominio/lemnos/api';

export async function POST(pedido: Request, { params }: { params: Promise<{ aviso: string }> }) {
  const { aviso } = await params;
  return respostaDoAviso(obterBd(), aviso, pedido, process.env.SERVIDOR_TOKEN);
}
