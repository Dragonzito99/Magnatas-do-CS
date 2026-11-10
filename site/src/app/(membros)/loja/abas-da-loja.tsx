import Link from 'next/link';

/** As duas abas da Magnata Shop, iguais ao submenu: a loja e o que a pessoa já comprou. O Baú fica no menu ao lado. */
export function AbasDaLoja({ atual }: { atual: 'loja' | 'compras' }) {
  return (
    <nav className="abas-da-loja" aria-label="Magnata Shop">
      <Link href="/loja" className="aba-da-loja" aria-current={atual === 'loja' ? 'page' : undefined}>
        Loja
      </Link>
      <Link href="/compras" className="aba-da-loja" aria-current={atual === 'compras' ? 'page' : undefined}>
        Minhas compras
      </Link>
    </nav>
  );
}
