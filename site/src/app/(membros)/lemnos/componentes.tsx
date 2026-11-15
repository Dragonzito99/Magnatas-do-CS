import Link from 'next/link';
import type { ReactNode } from 'react';
import { categoriaLemnos, imagemLemnos, raridadeLemnos } from '@/dominio/lemnos/catalogo';
import { NOME_DA_RARIDADE } from '@/dominio/loja';

/** As abas da Ilha Lemnos, no jeito das abas da Magnata Shop. */
export function AbasDaIlha({ atual }: { atual: 'kit' | 'mercado' | 'vender' }) {
  const aba = (destino: typeof atual, href: string, nome: string) => (
    <Link href={href} className="aba-da-loja" aria-current={atual === destino ? 'page' : undefined}>
      {nome}
    </Link>
  );
  return (
    <nav className="abas-da-loja" aria-label="Ilha Lemnos">
      {aba('kit', '/lemnos', 'Meu kit e baú')}
      {aba('mercado', '/lemnos/mercado', 'Mercado')}
      {aba('vender', '/lemnos/mercado?aba=vender', 'Vender saque')}
    </nav>
  );
}

/** A foto do item: a arma padrão do CS2 (sem skin) ou o ícone do saque e da mochila. */
export function ImagemDoItem({ id, grande = false }: { id: string; grande?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imagemLemnos(id)} alt="" className={grande ? 'arma-da-ilha grande' : 'arma-da-ilha'} loading="lazy" />;
}

export function TipoDoItem({ id }: { id: string }) {
  return (
    <span className="tipo-do-cartao">
      {categoriaLemnos(id)} · {NOME_DA_RARIDADE[raridadeLemnos(id)]}
    </span>
  );
}

/**
 * O topo da ilha: a foto do mapa, a frase que chama para jogar e os dois botões que importam (entrar e comprar).
 * entrar: o caminho para conectar (Jogar, ou Testes enquanto a ilha está escondida para o Adm testar).
 */
export function TopoDaIlha({ entrar, numeros, children }: { entrar: string; numeros?: ReactNode; children?: ReactNode }) {
  return (
    <section className="heroi-da-ilha">
      <span className="selo-da-raridade">Modo extração · Sirocco</span>
      <h2>Ilha Lemnos</h2>
      <p>
        A ilha da Mutação foi cercada e abandonada. Ficou tudo para trás: cofres, joias, armas. Entre por um posto dos Magnatas, saqueie e chegue vivo ao
        barco. <b>O que você trouxer é seu. Se morrer, fica lá.</b>
      </p>
      {children}
      <div className="acoes-do-destaque">
        <Link className="botao-da-shop" href={entrar}>
          Entrar na Ilha Lemnos
        </Link>
        <Link className="botao-da-shop vazado" href="/lemnos/mercado">
          Ir ao mercado
        </Link>
      </div>
      {numeros && <div className="numeros-do-heroi">{numeros}</div>}
    </section>
  );
}

/** A chamada da ilha dentro da Magnata Shop e do Baú, para quem está lá achar o mercado e o baú da ilha. */
export function ChamadaDaIlha({ onde }: { onde: 'loja' | 'bau' }) {
  return (
    <Link href={onde === 'loja' ? '/lemnos/mercado' : '/lemnos'} className="chamada-da-ilha">
      <span className="selo-da-raridade">Novo · Modo extração</span>
      <b>Ilha Lemnos</b>
      <span>{onde === 'loja' ? 'Armas, granadas e mochilas para a ilha estão no Mercado da ilha.' : 'Suas armas, mochilas e o saque da ilha ficam no Baú da ilha.'}</span>
      <em>{onde === 'loja' ? 'Ir ao Mercado da ilha →' : 'Abrir o Baú da ilha →'}</em>
    </Link>
  );
}
