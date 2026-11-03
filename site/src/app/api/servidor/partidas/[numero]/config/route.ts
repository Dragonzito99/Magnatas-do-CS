import { obterBd } from '@/bd/conexao';
import { respostaDaConfig } from '@/dominio/partidas';

export async function GET(pedido: Request, { params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  return respostaDaConfig(obterBd(), numero, pedido.headers.get('authorization'), process.env.SERVIDOR_TOKEN);
}
