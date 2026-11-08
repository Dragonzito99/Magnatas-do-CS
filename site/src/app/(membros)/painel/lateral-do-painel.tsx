import Link from 'next/link';
import type { ReactNode } from 'react';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { contagemDeCasos } from '@/dominio/denuncias';

export type ParteDoPainel = 'resumo' | 'olho' | 'membros' | 'noticias';

// O que ainda não tem tela fica listado, apagado, para a equipe saber o que vem por aí.
const EM_BREVE = ['Punições', 'Partidas', 'Servidores', 'Suas ideias aqui'];

/** O menu da lateral do Painel ADM, como no rascunho. Cada um vê só o que o cargo permite. */
async function LateralDoPainel({ usuario, atual }: { usuario: Usuario; atual: ParteDoPainel }) {
  const moderar = pode(usuario, 'moderar');
  const casos = moderar ? await contagemDeCasos(obterBd(), usuario) : null;
  const item = (parte: ParteDoPainel, href: string, nome: string, contagem?: number) => (
    <Link href={href} className={atual === parte ? 'ativo' : undefined} aria-current={atual === parte ? 'page' : undefined}>
      {nome}
      {!!contagem && <b>{contagem}</b>}
    </Link>
  );
  return (
    <nav className="painel-lado" aria-label="Partes do painel">
      {item('resumo', '/painel', 'Resumo')}
      {casos && (
        <>
          <small>Segurança</small>
          {item('olho', '/olho-de-aguia', 'Olho de Águia', casos.denuncias + casos.propostas)}
          <Link href="/olho-de-aguia#chamados">
            Chamados
            {casos.chamados > 0 && <b>{casos.chamados}</b>}
          </Link>
        </>
      )}
      <small>Clube</small>
      {item('membros', '/equipe', 'Membros e cargos')}
      {pode(usuario, 'publicar_noticia') && item('noticias', '/equipe/noticias', 'Notícias')}
      <small>Em breve</small>
      {EM_BREVE.map((nome) => (
        <span key={nome} className="breve">
          {nome}
        </span>
      ))}
    </nav>
  );
}

/**
 * A tela de todas as partes do Painel ADM. O topo, o menu e a faixa com o nome da parte ficam sempre no mesmo lugar,
 * para trocar de aba mudar só o conteúdo ao lado.
 */
export function TelaDoPainel({
  usuario,
  atual,
  titulo,
  extra,
  children,
}: {
  usuario: Usuario;
  atual: ParteDoPainel;
  titulo: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="topo-jogar">
        <h1>Painel ADM</h1>
        <p className="apoio">Só a equipe vê esta área. Cada um vê as partes que o cargo permite.</p>
      </div>
      <div className="painel-tela">
        <LateralDoPainel usuario={usuario} atual={atual} />
        <div className="painel-conteudo">
          <div className="topo-da-parte">
            <h2>{titulo}</h2>
            {extra && <div className="extra-da-parte">{extra}</div>}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
