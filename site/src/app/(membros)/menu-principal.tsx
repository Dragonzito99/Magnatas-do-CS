'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DESTINO_DO_JOGAR, ITENS_DO_MENU, itemAtivo } from '@/dominio/navegacao';

export function MenuPrincipal() {
  const caminho = usePathname();
  return (
    <nav className="menu-principal" aria-label="Áreas">
      <div className="largura menu-principal-linha">
        <div className="menu-itens">
          {ITENS_DO_MENU.map((item) =>
            item.href ? (
              <Link
                key={item.nome}
                href={item.href}
                className={item.destaque ? 'item-principal destaque' : 'item-principal'}
                aria-current={itemAtivo(caminho, item.href) ? 'page' : undefined}
              >
                <span>{item.nome}</span>
              </Link>
            ) : (
              <span key={item.nome} className={item.destaque ? 'item-principal destaque em-breve' : 'item-principal em-breve'}>
                <span>
                  {item.nome} <em>em breve</em>
                </span>
              </span>
            ),
          )}
        </div>
        <Link href={DESTINO_DO_JOGAR} className="botao-jogar">
          JOGAR
        </Link>
      </div>
    </nav>
  );
}
