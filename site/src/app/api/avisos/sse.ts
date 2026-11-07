/** Formato dos eventos enviados pelo servidor (Server-Sent Events). */

export const INTERVALO_DA_CONFERENCIA_MS = 2_000;
// O Caddy e o navegador derrubam uma conexão parada; o comentário mantém a ligação viva.
export const INTERVALO_DO_PING_MS = 20_000;
export const PING = ': ping\n\n';

export function formatarEvento(nome: string, dados: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dados)}\n\n`;
}
