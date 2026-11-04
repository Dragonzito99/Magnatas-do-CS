import { obterBd } from '@/bd/conexao';
import { respostaDoResultado } from '@/dominio/xp-diversao';

export async function POST(pedido: Request) {
  return respostaDoResultado(obterBd(), pedido, process.env.SERVIDOR_TOKEN);
}
