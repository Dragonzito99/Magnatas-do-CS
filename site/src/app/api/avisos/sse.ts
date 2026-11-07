/** Formato e ciclo de vida dos eventos enviados pelo servidor (Server-Sent Events). */

export const INTERVALO_DA_CONFERENCIA_MS = 2_000;
// O Caddy e o navegador derrubam uma conexão parada; o comentário mantém a ligação viva.
export const INTERVALO_DO_PING_MS = 20_000;
export const PING = ': ping\n\n';

export function formatarEvento(nome: string, dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}

export type AvisoDePartida = { partidaId: string; aceiteAte: Date } | null;

/**
 * Confere a cada 2 s se há partida esperando o aceite e manda o evento quando ela muda.
 * Para de conferir quando o pedido é abortado ou o navegador cancela a leitura, para não deixar relógio vivo.
 */
export function criarFluxoDeAvisos(buscar: () => Promise<AvisoDePartida>, sinal: AbortSignal): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  let fechar = () => {};
  return new ReadableStream<Uint8Array>({
    start(controle) {
      let ultimaPartidaId: string | null = null;
      let encerrado = false;
      const enviar = (texto: string) => {
        if (encerrado) return;
        try {
          controle.enqueue(codificador.encode(texto));
        } catch {
          // O leitor já se foi; o fluxo acaba aqui.
          fechar();
        }
      };
      const conferir = async () => {
        if (encerrado) return;
        try {
          const aviso = await buscar();
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
      fechar = () => {
        if (encerrado) return;
        encerrado = true;
        clearInterval(conferencia);
        clearInterval(ping);
        sinal.removeEventListener('abort', fechar);
        try {
          controle.close();
        } catch {
          // A conexão já tinha caído.
        }
      };
      sinal.addEventListener('abort', fechar);
      enviar(PING);
      void conferir();
    },
    cancel() {
      fechar();
    },
  });
}
