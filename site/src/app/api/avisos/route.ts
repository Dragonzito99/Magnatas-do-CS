import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { avisoPendente } from '@/dominio/aceites';
import { formatarEvento, INTERVALO_DA_CONFERENCIA_MS, INTERVALO_DO_PING_MS, PING } from './sse';

export const dynamic = 'force-dynamic';

/**
 * Conexão que o navegador mantém aberta, mesmo com a aba escondida, para saber na hora
 * que uma partida apareceu e precisa do aceite da pessoa.
 */
export async function GET(pedido: Request): Promise<Response> {
  const usuario = await usuarioAtual();
  if (!usuario || usuario.estado !== 'ativo') return new Response(null, { status: 401 });
  const bd = obterBd();
  const codificador = new TextEncoder();

  const corpo = new ReadableStream<Uint8Array>({
    start(controle) {
      let ultimaPartidaId: string | null = null;
      let encerrado = false;
      const enviar = (texto: string) => {
        if (!encerrado) controle.enqueue(codificador.encode(texto));
      };
      const conferir = async () => {
        try {
          const aviso = await avisoPendente(bd, usuario.id);
          const partidaId = aviso?.partidaId ?? null;
          if (partidaId === ultimaPartidaId) return;
          ultimaPartidaId = partidaId;
          if (aviso) enviar(formatarEvento('partida', { partidaId: aviso.partidaId, aceiteAte: aviso.aceiteAte.toISOString() }));
        } catch (erro) {
          console.warn('Falha ao conferir o aviso de partida:', erro);
        }
      };
      const conferencia = setInterval(conferir, INTERVALO_DA_CONFERENCIA_MS);
      const ping = setInterval(() => enviar(PING), INTERVALO_DO_PING_MS);
      const fechar = () => {
        if (encerrado) return;
        encerrado = true;
        clearInterval(conferencia);
        clearInterval(ping);
        try {
          controle.close();
        } catch {
          // A conexão já tinha caído.
        }
      };
      pedido.signal.addEventListener('abort', fechar);
      enviar(PING);
      void conferir();
    },
  });

  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
