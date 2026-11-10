import { obterBd } from '@/bd/conexao';
import { respostaDosVisuais } from '@/dominio/visuais-servidor';

export function GET(pedido: Request) {
  return respostaDosVisuais(obterBd(), pedido.headers.get('authorization'), process.env.SERVIDOR_TOKEN, pedido.url);
}
