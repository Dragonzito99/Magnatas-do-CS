'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DESTINO_DO_JOGAR, ITENS_DO_MENU, itemAtivo } from '@/dominio/navegacao';

/** O Discord entra no submenu da Comunidade quando o endereço estiver configurado. */
export function MenuPrincipal({ discord }: { discord: string | null }) {
  const caminho = usePathname();
  return (
    <nav className="menu-principal" aria-label="Áreas">
      <div className="largura menu-principal-linha">
        <div className="menu-itens">
          {ITENS_DO_MENU.map((item) =>
            item.href ? (
              <div key={item.nome} className="item-com-submenu">
                <Link
                  href={item.href}
                  className={item.destaque ? 'item-principal destaque' : 'item-principal'}
                  aria-current={itemAtivo(caminho, item.href, item.filhos) ? 'page' : undefined}
                >
                  <span>{item.nome}</span>
                </Link>
                {item.filhos && (
                  <div className="submenu">
                    {item.filhos.map((filho) => (
                      <Link key={filho.href} href={filho.href}>
                        {filho.nome}
                      </Link>
                    ))}
                    {item.nome === 'Comunidade' && discord && (
                      <a href={discord} target="_blank" rel="noreferrer">
                        Discord
                      </a>
                    )}
                  </div>
                )}
              </div>
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
