import Link from 'next/link';
import type { Usuario } from '@/bd/esquema';

/** O título da tela com a carteira ao lado, igual em todas as telas da Magnata Shop. */
export function CarteiraDaShop({ titulo, usuario }: { titulo: string; usuario: Pick<Usuario, 'grana' | 'magcoin'> }) {
  return (
    <div className="carteira-da-shop">
      <h1>{titulo}</h1>
      <span className="moeda-da-shop grana">
        <i aria-hidden="true">$</i>
        <b>{usuario.grana.toLocaleString('pt-BR')}</b>
        <small>Grana</small>
      </span>
      <span className="moeda-da-shop magcoin">
        <i aria-hidden="true">M</i>
        <b>{usuario.magcoin.toLocaleString('pt-BR')}</b>
        <small>MagCoin</small>
      </span>
      <Link className="moeda-da-shop comprar" href="/apoio">
        + MagCoin
      </Link>
      <Link className="moeda-da-shop" href="/bau">
        Meu baú
      </Link>
    </div>
  );
}
