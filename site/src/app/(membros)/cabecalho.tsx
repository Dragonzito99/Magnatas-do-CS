import Image from 'next/image';
import Link from 'next/link';
import type { UsuarioPublico } from '@/dominio/salas';
import type { Patente } from '@/dominio/xp';
import { InsigniaDaPatente } from './insignia-da-patente';
import { MenuPrincipal } from './menu-principal';
import { MenuSuspenso } from './menu-suspenso';

/** Faixa preta com a conta, como no site do CrossFire, e o menu de cima logo abaixo. */
export function Cabecalho({
  usuario,
  patente,
  discord,
  sino,
  casosDaEquipe,
  testes = false,
  grana = null,
}: {
  usuario: UsuarioPublico;
  patente: Patente;
  discord: string | null;
  sino?: React.ReactNode;
  /** Só a equipe recebe um número aqui, e só ela vê o botão do Painel ADM. */
  casosDaEquipe: number | null;
  /** Só o Adm vê a aba Testes no menu. */
  testes?: boolean;
  /** O saldo de Grana; vazio enquanto a loja está fechada para esta conta. */
  grana?: number | null;
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
            {grana !== null && (
              <Link href="/compras" className="saldo-de-grana" title="Sua Grana. Abre Minhas compras.">
                <span aria-hidden="true">$</span>
                <b>{grana.toLocaleString('pt-BR')}</b>
                <small>Grana</small>
              </Link>
            )}
            {sino}
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
              <Link href="/patentes" className="item-suspenso">
                Minha patente
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
      <MenuPrincipal discord={discord} testes={testes} loja={grana !== null} />
    </header>
  );
}
