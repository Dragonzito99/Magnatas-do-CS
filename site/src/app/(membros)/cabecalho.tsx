import Image from 'next/image';
import Link from 'next/link';
import type { UsuarioPublico } from '@/dominio/salas';
import type { Patente } from '@/dominio/xp';
import { InsigniaDaPatente } from './insignia-da-patente';
import { MenuPrincipal } from './menu-principal';
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

/** Faixa preta com a conta, como no site do CrossFire, e o menu de cima logo abaixo. */
export function Cabecalho({
  usuario,
  patente,
  discord,
  sino,
  casosDaEquipe,
}: {
  usuario: UsuarioPublico;
  patente: Patente;
  discord: string | null;
  sino?: React.ReactNode;
  /** Só a equipe recebe um número aqui, e só ela vê o botão do Painel ADM. */
  casosDaEquipe: number | null;
}) {
  return (
    <header className="cabecalho">
      <div className="faixa">
        <div className="largura faixa-linha">
          <Link href="/inicio" className="faixa-logo" aria-label="Início">
            <Image src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} priority />
          </Link>
          <div className="faixa-conta">
            {casosDaEquipe !== null && (
              <Link href="/painel" className="botao-painel">
                <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 20 6v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
                </svg>
                Painel ADM
                {casosDaEquipe > 0 && <small className="contador-do-painel">{casosDaEquipe}</small>}
              </Link>
            )}
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
                  <InsigniaDaPatente patente={patente} classe="insignia-mini" />
                  <span className="conta-texto">
                    Olá, <span className="conta-nome">{usuario.apelido}</span>
                    <small className="conta-patente">· {patente.nome}</small>
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
              <Link href="/convites" className="item-suspenso">
                Convites
              </Link>
              <form action="/api/auth/sair" method="post">
                <button type="submit" className="item-suspenso">
                  Sair
                </button>
              </form>
            </MenuSuspenso>
          </div>
        </div>
      </div>
      <MenuPrincipal />
    </header>
  );
}
