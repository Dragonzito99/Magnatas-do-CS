import Link from 'next/link';
import type { ReactNode } from 'react';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { mvpsDoPeriodo, periodoDeBrasilia } from '@/dominio/mvps';
import {
  lerMes,
  mesAnterior,
  mesDe,
  minhaPosicao,
  MINIMO_DE_PARTIDAS_NO_MES,
  primeiroMesComPartida,
  proximoMes,
  rankingDaComunidade,
  rankingDoMes,
  textoDoMes,
  type Mes,
} from '@/dominio/ranking';
import { Avatar } from '../avatar';
import { InsigniaDaPatente } from '../insignia-da-patente';

const nomeDoMes = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const tituloDoMes = ({ ano, mes }: Mes) => {
  const texto = nomeDoMes.format(new Date(Date.UTC(ano, mes - 1, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const antes = (a: Mes, b: Mes) => a.ano < b.ano || (a.ano === b.ano && a.mes < b.mes);
const numero = new Intl.NumberFormat('pt-BR');

const METAL = { 1: 'ouro', 2: 'prata', 3: 'bronze' } as const;

type LugarDoPodio = { posicao: number; jogador: { id: string; apelido: string; avatarUrl: string | null }; detalhe: ReactNode; numero: string };

/** O pódio do rascunho: segundo, primeiro no meio e terceiro, cada um com a cor da sua medalha. */
function Podio({ lugares }: { lugares: LugarDoPodio[] }) {
  const ordem = [lugares[1], lugares[0], lugares[2]].filter(Boolean);
  if (ordem.length === 0) return null;
  return (
    <div className={`podio-ranking com-${ordem.length}`}>
      {ordem.map((lugar) => (
        <div key={lugar.jogador.id} className={`podio-lugar ${METAL[lugar.posicao as 1 | 2 | 3]}`}>
          <span className="podio-pos">{lugar.posicao}º</span>
          <Avatar usuario={lugar.jogador} />
          <Link className="podio-nome" href={`/jogadores/${lugar.jogador.id}`}>
            {lugar.jogador.apelido}
          </Link>
          {lugar.detalhe}
          <span className="podio-numero">{lugar.numero}</span>
        </div>
      ))}
    </div>
  );
}

async function RankingDaComunidade({ usuario }: { usuario: Pick<Usuario, 'id'> }) {
  const linhas = await rankingDaComunidade(obterBd());
  const eu = minhaPosicao(linhas, usuario.id);
  return (
    <>
      <Podio
        lugares={linhas.slice(0, 3).map((linha) => ({
          posicao: linha.posicao,
          jogador: linha.jogador,
          detalhe: (
            <span className="patente-na-tabela">
              <InsigniaDaPatente patente={linha.patente} classe="insignia-mini" />
              {linha.patente.nome}
            </span>
          ),
          numero: `${numero.format(linha.xp)} XP`,
        }))}
      />
      <section className="painel">
        {linhas.length === 0 && <p className="vazio">Ainda ninguém ganhou XP. A primeira partida encerrada abre o ranking.</p>}
        {linhas.length > 0 && (
          <table className="tabela tabela-ranking">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Jogador</th>
                <th scope="col">Patente</th>
                <th scope="col">XP</th>
                <th scope="col" className="so-computador">
                  Partidas
                </th>
                <th scope="col" className="so-computador">
                  Vitórias
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.jogador.id} className={linha.jogador.id === usuario.id ? 'minha-linha' : undefined}>
                  <td>{linha.posicao}</td>
                  <th scope="row">
                    <span className="perfil">
                      <Avatar usuario={linha.jogador} />
                      <Link className="nome" href={`/jogadores/${linha.jogador.id}`}>
                        {linha.jogador.apelido}
                      </Link>
                    </span>
                  </th>
                  <td>
                    <span className="patente-na-tabela">
                      <InsigniaDaPatente patente={linha.patente} classe="insignia-mini" />
                      {linha.patente.nome}
                    </span>
                  </td>
                  <td>
                    <b>{numero.format(linha.xp)}</b>
                  </td>
                  <td className="so-computador">{linha.partidas}</td>
                  <td className="so-computador">{linha.vitoriasPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="rodape-do-ranking">
          <span>Todas as partidas dão XP, e ele não zera.</span>
        </div>
      </section>
      <p className="apoio frase-do-ranking">
        {!eu
          ? 'Você ainda não está no ranking. Jogue uma partida para entrar.'
          : eu.acima
            ? `Você está em ${eu.posicao}º · faltam ${numero.format(eu.faltam)} XP para passar o ${eu.acima}`
            : 'Você está em 1º. O mais magnata do clube!'}
      </p>
    </>
  );
}

async function RankingDeMvps({ usuario }: { usuario: Pick<Usuario, 'id'> }) {
  const agora = new Date();
  const linhas = await mvpsDoPeriodo(obterBd(), periodoDeBrasilia(agora, 'mes'), 50);
  return (
    <>
      <p className="apoio">Quem mais ganhou estrelas de MVP nas partidas de {tituloDoMes(mesDe(agora)).toLowerCase()}.</p>
      <Podio
        lugares={linhas.slice(0, 3).map((linha, indice) => ({
          posicao: indice + 1,
          jogador: linha,
          detalhe: <span className="apoio">{linha.kills} abates</span>,
          numero: `${linha.mvps} ${linha.mvps === 1 ? 'estrela' : 'estrelas'}`,
        }))}
      />
      <section className="painel">
        {linhas.length === 0 && <p className="vazio">Ninguém ganhou estrela de MVP neste mês ainda.</p>}
        {linhas.length > 0 && (
          <table className="tabela tabela-ranking">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Jogador</th>
                <th scope="col">Estrelas</th>
                <th scope="col" className="so-computador">
                  Abates
                </th>
                <th scope="col" className="so-computador">
                  Partidas
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, indice) => (
                <tr key={linha.id} className={linha.id === usuario.id ? 'minha-linha' : undefined}>
                  <td>{indice + 1}</td>
                  <th scope="row">
                    <span className="perfil">
                      <Avatar usuario={linha} />
                      <Link className="nome" href={`/jogadores/${linha.id}`}>
                        {linha.apelido}
                      </Link>
                    </span>
                  </th>
                  <td>
                    <b className="estrelas-do-ranking">★ {linha.mvps}</b>
                  </td>
                  <td className="so-computador">{linha.kills}</td>
                  <td className="so-computador">{linha.partidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="rodape-do-ranking">
          <span>Cada rodada dá uma estrela de MVP para o melhor dela. Zera todo mês.</span>
        </div>
      </section>
    </>
  );
}

async function RankingDoMix({ usuario, texto }: { usuario: Pick<Usuario, 'id'>; texto: string | undefined }) {
  const bd = obterBd();
  const atual = mesDe(new Date());
  const pedido = lerMes(texto);
  const mes = pedido && !antes(atual, pedido) ? pedido : atual;
  const [{ linhas, foraDoRanking }, primeiro] = await Promise.all([rankingDoMes(bd, mes), primeiroMesComPartida(bd)]);

  const podeVoltar = !!primeiro && antes(primeiro, mes);
  const podeAvancar = antes(mes, atual);

  return (
    <>
      <nav className="escolha-do-mes" aria-label="Mês do ranking">
        {podeVoltar ? (
          <Link className="seta-do-mes" href={`/ranking?aba=mix&mes=${textoDoMes(mesAnterior(mes))}`} aria-label="Mês anterior">
            ‹
          </Link>
        ) : (
          <span className="seta-do-mes apagada" aria-hidden="true">
            ‹
          </span>
        )}
        <span>{tituloDoMes(mes)}</span>
        {podeAvancar ? (
          <Link className="seta-do-mes" href={`/ranking?aba=mix&mes=${textoDoMes(proximoMes(mes))}`} aria-label="Próximo mês">
            ›
          </Link>
        ) : (
          <span className="seta-do-mes apagada" aria-hidden="true">
            ›
          </span>
        )}
      </nav>

      <Podio
        lugares={linhas.slice(0, 3).map((linha) => ({
          posicao: linha.posicao,
          jogador: linha.jogador,
          detalhe: (
            <span className="apoio">
              {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'}
            </span>
          ),
          numero: `K/D ${linha.kd.toFixed(2)}`,
        }))}
      />

      <section className="painel">
        {linhas.length === 0 && <p className="vazio">Ainda ninguém chegou a {MINIMO_DE_PARTIDAS_NO_MES} partidas de Mix neste mês.</p>}
        {linhas.length > 0 && (
          <table className="tabela tabela-ranking">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Jogador</th>
                <th scope="col">Partidas</th>
                <th scope="col" className="so-computador">
                  Vitórias
                </th>
                <th scope="col" className="so-computador">
                  Abates
                </th>
                <th scope="col" className="so-computador">
                  Mortes
                </th>
                <th scope="col" className="so-computador">
                  ADR
                </th>
                <th scope="col">K/D</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.jogador.id} className={linha.jogador.id === usuario.id ? 'minha-linha' : undefined}>
                  <td>{linha.posicao}</td>
                  <th scope="row">
                    <span className="perfil">
                      <Avatar usuario={linha.jogador} />
                      <Link className="nome" href={`/jogadores/${linha.jogador.id}`}>
                        {linha.jogador.apelido}
                      </Link>
                    </span>
                  </th>
                  <td>{linha.partidas}</td>
                  <td className="so-computador">{linha.vitoriasPct}%</td>
                  <td className="so-computador">{linha.abates}</td>
                  <td className="so-computador">{linha.mortes}</td>
                  <td className="so-computador">{linha.adr}</td>
                  <td>
                    <b>{linha.kd.toFixed(2)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="rodape-do-ranking">
          <span>
            Entra no ranking quem jogou pelo menos <b>{MINIMO_DE_PARTIDAS_NO_MES} partidas de Mix</b> no mês.
          </span>
          {foraDoRanking > 0 && (
            <span>
              Fora do ranking: <b>{foraDoRanking === 1 ? '1 magnata' : `${foraDoRanking} magnatas`}</b>
            </span>
          )}
        </div>
      </section>
    </>
  );
}

const ABAS = [
  { valor: undefined, nome: 'Comunidade', href: '/ranking' },
  { valor: 'mix', nome: 'Mix do mês', href: '/ranking?aba=mix' },
  { valor: 'mvps', nome: 'MVPs', href: '/ranking?aba=mvps' },
] as const;

export default async function Ranking({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const usuario = await exigirAcesso('/ranking');
  const { aba, mes } = await searchParams;
  const atual = aba === 'mix' || aba === 'mvps' ? aba : undefined;

  return (
    <div className="tela-jogar">
      <div className="topo-jogar">
        <h1>Ranking</h1>
        <p className="apoio">Quem manda no Magnatas.</p>
      </div>
      <nav className="filtros-jogar" aria-label="Tipo de ranking">
        {ABAS.map((item) => (
          <Link key={item.nome} className="filtro-jogar" href={item.href} aria-current={atual === item.valor ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
        <Link className="filtro-jogar" href="/clas?aba=ranking">
          Clãs
        </Link>
      </nav>
      {atual === 'mix' ? <RankingDoMix usuario={usuario} texto={mes} /> : atual === 'mvps' ? <RankingDeMvps usuario={usuario} /> : <RankingDaComunidade usuario={usuario} />}
    </div>
  );
}
