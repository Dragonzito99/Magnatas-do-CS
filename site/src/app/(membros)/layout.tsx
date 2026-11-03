import { redirect } from 'next/navigation';
import { pode } from '@/auth/permissoes';
import { usuarioAtual } from '@/auth/sessao-atual';
import { Avatar } from './avatar';
import { Menu } from './menu';

export default async function LayoutDeMembros({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');

  return (
    <div className="app">
      <aside className="lateral">
        <div className="logo">
          <i aria-hidden="true">
            <svg className="icone" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 2v5" />
              <path d="M12 17v5" />
              <path d="M2 12h5" />
              <path d="M17 12h5" />
            </svg>
          </i>
          <div>
            MAGNA<span>TAS</span>
          </div>
        </div>
        <Menu mostrarEquipe={pode(usuario, 'ver_equipe')} />
        <div className="rodape-lateral">
          <div className="perfil">
            <Avatar usuario={usuario} />
            <b>{usuario.apelido}</b>
          </div>
          <form action="/api/auth/sair" method="post">
            <button type="submit" className="botao-texto">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="conteudo">{children}</main>
    </div>
  );
}
