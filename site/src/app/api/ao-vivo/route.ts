import { usuarioAtual } from '@/auth/sessao-atual';
import { ouvir } from '@/dominio/ao-vivo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Um sinal de vida de tempos em tempos, para nenhum proxy achar que a conexão parada morreu.
const SEGUNDOS_ENTRE_SINAIS = 25;

/**
 * Fica aberto enquanto a página está aberta e manda cada novidade da conta (mensagem, amigo, convite) assim que ela
 * acontece. A página então busca o que mudou. Se cair, o navegador reconecta sozinho.
 */
export async function GET(pedido: Request): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const codificar = new TextEncoder();
  let encerrar = () => {};

  const corpo = new ReadableStream<Uint8Array>({
    start(controle) {
      const mandar = (texto: string) => controle.enqueue(codificar.encode(texto));
      mandar(`retry: 3000\n\n`);
      const parar = ouvir(usuario.id, (novidade) => mandar(`data: ${JSON.stringify(novidade)}\n\n`));
      const sinal = setInterval(() => mandar(`: ok\n\n`), SEGUNDOS_ENTRE_SINAIS * 1000);
      encerrar = () => {
        clearInterval(sinal);
        parar();
        try {
          controle.close();
        } catch {
          // Já fechado.
        }
      };
      pedido.signal.addEventListener('abort', () => encerrar());
    },
    cancel() {
      encerrar();
    },
  });

  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Sem compressão: comprimido, o aviso ficava preso esperando juntar mais texto.
      'Content-Encoding': 'none',
      'X-Accel-Buffering': 'no',
    },
  });
}
