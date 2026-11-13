import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoGrande } from './logo-grande';

/** Página de texto aberta a todos (Regras, Privacidade): logo, título, data e o texto em coluna estreita. */
export function PaginaDeTexto({ titulo, atualizada, children }: { titulo: string; atualizada: string; children: ReactNode }) {
  return (
    <div className="pagina-de-texto">
      <main>
        <Link href="/" aria-label="Voltar ao início">
          <LogoGrande />
        </Link>
        <h1>{titulo}</h1>
        <p className="apoio">Atualizada em {atualizada}.</p>
        {children}
        <nav className="links-de-texto" aria-label="Outras páginas">
          <Link href="/regras">Regras do clube</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/">Início</Link>
        </nav>
      </main>
    </div>
  );
}
