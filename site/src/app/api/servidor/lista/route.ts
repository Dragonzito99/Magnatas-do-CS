import { obterBd } from '@/bd/conexao';
import { respostaDaLista } from '@/dominio/lista';

export function GET(pedido: Request) {
  return respostaDaLista(obterBd(), pedido.headers.get('authorization'), process.env.SERVIDOR_TOKEN);
}
