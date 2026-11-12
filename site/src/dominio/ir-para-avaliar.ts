/**
 * Se a aba deve ir sozinha para a partida a avaliar (dono, 11/11/2026). Não interrompe quem está no apoio, nas
 * compras, com a janela da loja aberta ou já numa partida da Diversão, e vai só uma vez para cada destino.
 */
export function deveIrParaAvaliar(destino: string | null, caminho: string, busca: string, jaFoi: boolean): boolean {
  if (!destino || jaFoi) return false;
  if (caminho.startsWith('/apoio') || caminho.startsWith('/compras')) return false;
  if (caminho.startsWith('/loja') && new URLSearchParams(busca).has('item')) return false;
  if (caminho.startsWith('/partidas/diversao/')) return false;
  return caminho !== destino.split('#')[0];
}
