'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CAMINHOS_DOS_ICONES: Record<string, React.ReactNode> = {
  salas: (
    <>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" x2="9" y1="14" y2="18" />
      <line x1="7" x2="4" y1="17" y2="20" />
      <line x1="3" x2="5" y1="19" y2="21" />
    </>
  ),
  mix: (
    <>
      <path d="m18 14 4 4-4 4" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
    </>
  ),
  diversao: (
    <>
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
    </>
  ),
  convites: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </>
  ),
  equipe: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  'olho-de-aguia': (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export function Menu({ mostrarEquipe, casos }: { mostrarEquipe: boolean; casos: number }) {
  const caminho = usePathname();
  const itens: { id: string; nome: string; exato?: boolean; contador?: number }[] = [
    { id: 'salas', nome: 'Salas' },
    { id: 'mix', nome: 'Mix' },
    { id: 'diversao', nome: 'Diversão' },
    { id: 'convites', nome: 'Convites' },
    ...(mostrarEquipe
      ? [
          { id: 'equipe', nome: 'Equipe', exato: true },
          { id: 'olho-de-aguia', nome: 'Olho de Águia', contador: casos },
        ]
      : []),
  ];

  return (
    <nav className="menu" aria-label="Áreas">
      <Link href="/salas" className="item-menu casa">
        <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </svg>
        MAGNATAS
      </Link>
      {itens.map((item) => {
        const destino = `/${item.id}`;
        return (
          <Link
            key={item.id}
            href={destino}
            className="item-menu"
            aria-current={caminho === destino || (!item.exato && caminho.startsWith(`${destino}/`)) ? 'page' : undefined}
          >
            <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
              {CAMINHOS_DOS_ICONES[item.id]}
            </svg>
            {item.nome}
            {!!item.contador && <small className="contador">{item.contador}</small>}
          </Link>
        );
      })}
    </nav>
  );
}
