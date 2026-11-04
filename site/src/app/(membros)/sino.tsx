import Link from 'next/link';
import type { Notificacao } from '@/dominio/notificacoes';
import { MenuSuspenso } from './menu-suspenso';

export function Sino({ notificacoes }: { notificacoes: Notificacao[] }) {
  const total = notificacoes.reduce((soma, item) => soma + item.quantidade, 0);
  return (
    <MenuSuspenso
      titulo={total > 0 ? `Notificações: ${total}` : 'Notificações'}
      classe="botao-barra botao-sino"
      rotulo={
        <>
          <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {total > 0 && <span className="contador-do-sino">{total}</span>}
        </>
      }
    >
      {notificacoes.length === 0 && <p className="nada-no-sino">Nada esperando por você</p>}
      {notificacoes.map((item) => (
        <Link key={item.tipo} href={item.href} className="item-suspenso">
          {item.texto}
        </Link>
      ))}
    </MenuSuspenso>
  );
}
