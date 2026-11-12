/** As páginas só de navegar: delas a aba pode sair sozinha sem cortar nada que a pessoa esteja fazendo. */
const PAGINAS_DE_NAVEGAR = ['/inicio', '/noticias', '/ranking', '/comunidade', '/jogadores', '/loja', '/bau', '/patentes', '/diversao'];

/**
 * Se a aba deve ir sozinha para a partida a avaliar (dono, 11/11/2026). Só sai de páginas de navegar (nunca de fila,
 * sala, partida, painel, compras ou apoio), não fecha a janela aberta da loja e vai só uma vez para cada destino.
 */
export function deveIrParaAvaliar(destino: string | null, caminho: string, busca: string, jaFoi: boolean): boolean {
  if (!destino || jaFoi) return false;
  if (!PAGINAS_DE_NAVEGAR.some((pagina) => caminho === pagina || caminho.startsWith(`${pagina}/`))) return false;
  if (caminho.startsWith('/loja') && new URLSearchParams(busca).has('item')) return false;
  return caminho !== destino.split('#')[0];
}
