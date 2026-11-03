import { obterBd } from '@/bd/conexao';
import { respostaDeEvento } from '@/dominio/eventos';

export async function POST(pedido: Request) {
  return respostaDeEvento(obterBd(), pedido.headers.get('authorization'), process.env.SERVIDOR_TOKEN, await pedido.text());
}
