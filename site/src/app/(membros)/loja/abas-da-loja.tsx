import Link from 'next/link';

/** As abas da Magnata Shop, iguais ao submenu: a loja, o que a pessoa já comprou e o apoio. O Baú fica no menu ao lado. */
export function AbasDaLoja({ atual }: { atual: 'loja' | 'compras' | 'apoio' }) {
  const aba = (destino: 'loja' | 'compras' | 'apoio', href: string, nome: string) => (
    <Link href={href} className="aba-da-loja" aria-current={atual === destino ? 'page' : undefined}>
      {nome}
    </Link>
  );
  return (
    <nav className="abas-da-loja" aria-label="Magnata Shop">
      {aba('loja', '/loja', 'Loja')}
      {aba('compras', '/compras', 'Minhas compras')}
      {aba('apoio', '/apoio', 'Apoie o clube')}
    </nav>
  );
}
