/** O CS2 não roda no celular: pelo celular dá para ver tudo, mas ligar um servidor só deixaria ele vazio, gastando vaga. */
const NAVEGADOR_DE_CELULAR = /Mobi|Android|iPhone|iPad|iPod/i;

/** Pelos cabeçalhos do pedido. O Chrome manda "sec-ch-ua-mobile: ?1" no celular mesmo quando pede a versão de computador. */
export function ehCelular(cabecalhos: Pick<Headers, 'get'>): boolean {
  if (cabecalhos.get('sec-ch-ua-mobile') === '?1') return true;
  return NAVEGADOR_DE_CELULAR.test(cabecalhos.get('user-agent') ?? '');
}
