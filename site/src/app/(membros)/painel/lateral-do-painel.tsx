import Link from 'next/link';
import type { ReactNode } from 'react';
import { pode } from '@/auth/permissoes';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { contagemDeCasos } from '@/dominio/denuncias';

export type ParteDoPainel =
  | 'resumo'
  | 'usuarios'
  | 'partidas'
  | 'servidores'
  | 'olho'
  | 'chamados'
  | 'convites'
  | 'noticias'
  | 'grana'
  | 'envios'
  | 'registro'
  | 'membros';

/** O menu da lateral do Painel ADM, no padrão da Shop. Cada um vê só o que o cargo permite. */
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
      {item('resumo', '/painel', 'Dashboard')}
      <small>Gestão</small>
      {item('usuarios', '/painel/usuarios', 'Usuários')}
      {item('partidas', '/painel/partidas', 'Partidas rolando')}
      {item('servidores', '/painel/servidores', 'Servidores')}
      {casos && (
        <>
          <small>Segurança</small>
          {item('olho', '/olho-de-aguia', 'Olho de Águia', casos.denuncias + casos.propostas)}
          {item('chamados', '/painel/chamados', 'Chamados', casos.chamados)}
        </>
      )}
      <small>Clube</small>
      {item('convites', '/convites', 'Convites')}
      {pode(usuario, 'publicar_noticia') && item('noticias', '/equipe/noticias', 'Notícias')}
      {pode(usuario, 'ajustar_grana') && item('grana', '/painel/grana', 'Grana')}
      {pode(usuario, 'ver_envios') && item('envios', '/painel/envios', 'Envios e vendas')}
      {item('registro', '/painel/registro', 'Registro da equipe')}
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

/** Um número do dashboard: rótulo, valor grande e uma linha de apoio, com a faixa de cor embaixo como na Shop. */
export function NumeroDoPainel({
  rotulo,
  valor,
  apoio,
  cor = 'roxo',
  href,
}: {
  rotulo: string;
  valor: ReactNode;
  apoio?: ReactNode;
  cor?: 'roxo' | 'ouro' | 'verde' | 'vermelho' | 'azul' | 'cinza';
  href?: string;
}) {
  const conteudo = (
    <>
      <span>{rotulo}</span>
      <b>{valor}</b>
      {apoio && <small>{apoio}</small>}
    </>
  );
  return href ? (
    <Link href={href} className="numero-adm" data-cor={cor}>
      {conteudo}
    </Link>
  ) : (
    <div className="numero-adm" data-cor={cor}>
      {conteudo}
    </div>
  );
}

/** Barras de um dado por dia (14 dias). O valor de cada dia aparece ao passar o mouse e no texto escondido para leitor de tela. */
export function GraficoDeDias({ titulo, pontos }: { titulo: string; pontos: { dia: string; total: number }[] }) {
  const maior = Math.max(1, ...pontos.map((ponto) => ponto.total));
  const soma = pontos.reduce((total, ponto) => total + ponto.total, 0);
  return (
    <figure className="grafico-adm">
      <figcaption>
        <span>{titulo}</span>
        <b>{soma}</b>
        <small>nos últimos {pontos.length} dias</small>
      </figcaption>
      <div className="barras-adm" role="img" aria-label={`${titulo}: ${pontos.map((ponto) => `${ponto.dia} ${ponto.total}`).join(', ')}`}>
        {pontos.map((ponto, indice) => (
          <div key={ponto.dia} className="barra-adm" title={`${ponto.dia}: ${ponto.total}`}>
            <i style={{ height: `${Math.round((ponto.total / maior) * 100)}%` }} data-hoje={indice === pontos.length - 1 ? '' : undefined} />
            <em>{ponto.total > 0 && (ponto.total === maior || indice === pontos.length - 1) ? ponto.total : ''}</em>
          </div>
        ))}
      </div>
      <div className="dias-adm" aria-hidden>
        <span>{pontos[0]?.dia}</span>
        <span>hoje</span>
      </div>
    </figure>
  );
}
