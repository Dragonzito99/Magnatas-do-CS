import Image from 'next/image';
import Link from 'next/link';
import type { UsuarioPublico } from '@/dominio/salas';
import { Avatar } from './avatar';
import { MenuSuspenso } from './menu-suspenso';

function IconeDoDiscord() {
  return (
    <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 7.5c2.3-.7 4.7-.7 7 0" />
      <path d="M8.5 16.5c2.3.7 4.7.7 7 0" />
      <path d="M15.5 17.5 17 20c2.5-.8 4-2 4-2 .4-4.7-.7-8.5-2.5-12-1.5-.7-3-1.2-4.5-1.5L13.5 6" />
      <path d="M8.5 17.5 7 20c-2.5-.8-4-2-4-2-.4-4.7.7-8.5 2.5-12C7 5.3 8.5 4.8 10 4.5L10.5 6" />
      <circle cx="9.5" cy="12" r="1" />
      <circle cx="14.5" cy="12" r="1" />
    </svg>
  );
}

export function Banner({ usuario, patente, discord, sino }: { usuario: UsuarioPublico; patente: string; discord: string | null; sino?: React.ReactNode }) {
  return (
    <header className="banner">
      <div className="banner-arte">
        <Image className="banner-personagem" src="/marca/personagem.webp" alt="" width={756} height={800} priority />
        <Link href="/salas" className="banner-logo">
          <Image className="logo-grande" src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} priority />
        </Link>
        <p className="banner-frase">
          JOGUE<b>·</b>VENÇA<b>·</b>FAÇA PARTE
        </p>
      </div>
      <div className="barra-topo">
        {sino}
        {discord ? (
          <a className="botao-barra" href={discord} target="_blank" rel="noreferrer" aria-label="Discord" title="Discord">
            <IconeDoDiscord />
          </a>
        ) : (
          <span className="botao-barra desativado" aria-disabled="true" title="Discord em breve">
            <IconeDoDiscord />
            <span className="so-leitor">Discord em breve</span>
          </span>
        )}
        <MenuSuspenso
          titulo="Minha conta"
          classe="botao-conta"
          rotulo={
            <>
              <Avatar usuario={usuario} />
              <span className="conta-texto">
                <span className="conta-nome">{usuario.apelido}</span>
                <small className="conta-patente">{patente}</small>
              </span>
              <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </>
          }
        >
          <Link href={`/jogadores/${usuario.id}`} className="item-suspenso">
            Meu perfil
          </Link>
          <form action="/api/auth/sair" method="post">
            <button type="submit" className="item-suspenso">
              Sair
            </button>
          </form>
        </MenuSuspenso>
      </div>
    </header>
  );
}
