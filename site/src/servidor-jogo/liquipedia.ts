/**
 * Cliente da API da Liquipedia, seguindo os termos dela (liquipedia.net/api-terms-of-use):
 * só a api.php, no máximo 1 pedido a cada 2 s e 1 parse a cada 30 s, User-Agent com contato, gzip.
 */
export const INTERVALO_ENTRE_PEDIDOS_MS = 2_000;
export const INTERVALO_DO_PARSE_MS = 30_000;
const ENDERECO_DA_API = 'https://liquipedia.net/counterstrike/api.php';
const PRAZO_DO_PEDIDO_MS = 20_000;

export function userAgentDaLiquipedia(contato: string): string {
  return `MagnatasDoCS/1.0 (https://magnatasdocs.com.br; ${contato})`;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Sem contato, a Liquipedia bloqueia: então não há cliente, e o quadro Tier S fica sem atualizar. */
export function criarClienteLiquipedia(
  contato: string | undefined,
  buscar: typeof fetch = fetch,
): ((parametros: Record<string, string>) => Promise<unknown>) | null {
  const limpo = contato?.trim();
  if (!limpo) return null;
  const cabecalhos = { 'User-Agent': userAgentDaLiquipedia(limpo), 'Accept-Encoding': 'gzip' };
  let ultimoPedido = -Infinity;
  let ultimoParse = -Infinity;
  // Uma fila só: cada pedido espera o anterior terminar e o intervalo passar.
  let fila: Promise<unknown> = Promise.resolve();

  return (parametros) => {
    const vez = fila.then(async () => {
      const ehParse = parametros.action === 'parse';
      const agora = Date.now();
      const pronto = Math.max(ultimoPedido + INTERVALO_ENTRE_PEDIDOS_MS, ehParse ? ultimoParse + INTERVALO_DO_PARSE_MS : -Infinity);
      if (pronto > agora) await esperar(pronto - agora);
      ultimoPedido = Date.now();
      if (ehParse) ultimoParse = ultimoPedido;
      const resposta = await buscar(`${ENDERECO_DA_API}?${new URLSearchParams(parametros)}`, {
        headers: cabecalhos,
        signal: AbortSignal.timeout(PRAZO_DO_PEDIDO_MS),
      });
      if (!resposta.ok) throw new Error(`A Liquipedia respondeu ${resposta.status}.`);
      return resposta.json();
    });
    fila = vez.catch(() => undefined);
    return vez;
  };
}
