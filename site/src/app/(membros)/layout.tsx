import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pode } from '@/auth/permissoes';
import { usuarioAtual } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { enderecoDoDiscord } from '@/dominio/discord';
import { casosDe, notificacoesDe } from '@/dominio/notificacoes';
import { patenteDe } from '@/dominio/xp';
import { Atualizar } from './atualizar';
import { Banner } from './banner';
import { Menu } from './menu';
import { Sino } from './sino';

export default async function LayoutDeMembros({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/');

  const mostrarEquipe = pode(usuario, 'ver_equipe');
  const notificacoes = await notificacoesDe(obterBd(), usuario);
  const casos = casosDe(notificacoes);

  return (
    <div className="app">
      <Atualizar segundos={15} />
      <Banner usuario={usuario} patente={patenteDe(usuario.xpTotal).nome} discord={enderecoDoDiscord(process.env.DISCORD_URL)} sino={<Sino notificacoes={notificacoes} />} />
      <div className="app-corpo">
        <aside className="lateral">
          <Menu mostrarEquipe={mostrarEquipe} casos={casos} />
          <Link href="/convites" className="seja-magnata">
            <svg viewBox="0 0 24 18" aria-hidden="true">
              <path d="M2 16 1 4l6 5 5-8 5 8 6-5-1 12z" />
            </svg>
            <span>
              Seja um <em>Magnata!</em>
            </span>
          </Link>
        </aside>
        <main className="conteudo">{children}</main>
      </div>
    </div>
  );
}
