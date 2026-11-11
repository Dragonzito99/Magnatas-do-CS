/** O preço com o símbolo da moeda; com `antes`, o preço cheio aparece riscado ao lado (oferta do dia). */
export function Preco({ valor, antes, moeda = 'grana' }: { valor: number; antes?: number; moeda?: 'grana' | 'magcoin' }) {
  return (
    <span className={`preco-da-shop ${moeda}`}>
      <i aria-hidden="true">{moeda === 'grana' ? '$' : 'M'}</i>
      {antes !== undefined && <s>{antes}</s>}
      <b>{valor.toLocaleString('pt-BR')}</b>
      <span className="so-leitor">{moeda === 'grana' ? ' Grana' : ' MagCoin'}</span>
    </span>
  );
}
