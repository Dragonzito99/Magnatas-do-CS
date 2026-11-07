import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import {
  lerMes,
  mesAnterior,
  mesDe,
  MINIMO_DE_PARTIDAS_NO_MES,
  primeiroMesComPartida,
  proximoMes,
  rankingDaComunidade,
  rankingDoMes,
  textoDoMes,
  type LinhaDoRanking,
  type Mes,
} from '@/dominio/ranking';
import { Avatar } from '../avatar';
import { InsigniaDaPatente } from '../insignia-da-patente';

const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tituloDoMes = ({ ano, mes }: Mes) => {
  const texto = nomeDoMes.format(new Date(Date.UTC(ano, mes - 1, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const antes = (a: Mes, b: Mes) => a.ano < b.ano || (a.ano === b.ano && a.mes < b.mes);
const numero = new Intl.NumberFormat('pt-BR');

function Coroa({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 18" aria-hidden="true">
      <path d="M2 16 1 4l6 5 5-8 5 8 6-5-1 12z" />
    </svg>
  );
}

function LugarDoPodio({ linha }: { linha: LinhaDoRanking }) {
  const primeiro = linha.posicao === 1;
  return (
    <div className={primeiro ? 'lugar primeiro' : 'lugar'}>
      {primeiro ? (
        <>
          <Coroa className="coroa" />
          <strong>MAGNATA DO MÊS</strong>
        </>
      ) : (
        <small>{linha.posicao}º lugar</small>
      )}
      <Avatar usuario={linha.jogador} />
      <Link className="nome" href={`/jogadores/${linha.jogador.id}`}>
        {linha.jogador.apelido}
      </Link>
      <b className="mono">{linha.kd.toFixed(2)}</b>
      <small>
        {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'}
      </small>
    </div>
  );
}

async function RankingDaComunidade({ usuario }: { usuario: Pick<Usuario, 'id'> }) {
  const linhas = await rankingDaComunidade(obterBd());
  return (
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="rodape-do-ranking">
        <span>Todas as partidas dão XP, e ele não zera.</span>
      </div>
    </section>
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
  // Segundo, primeiro e terceiro, para o primeiro ficar no meio.
  const podio = [linhas[1], linhas[0], linhas[2]].filter(Boolean);

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

      {podio.length > 0 && (
        <div className={`podio com-${podio.length}`}>
          {podio.map((linha) => (
            <LugarDoPodio key={linha.jogador.id} linha={linha} />
          ))}
        </div>
      )}

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

export default async function Ranking({ searchParams }: { searchParams: Promise<{ aba?: string; mes?: string }> }) {
  const usuario = await exigirAcesso('/ranking');
  const { aba, mes } = await searchParams;
  const noMix = aba === 'mix';

  return (
    <>
      <div className="topo-pagina titulo-com-icone">
        <svg className="icone" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 4h10v6a5 5 0 0 1-10 0z" />
          <path d="M7 6H4a3 3 0 0 0 3 4" />
          <path d="M17 6h3a3 3 0 0 1-3 4" />
        </svg>
        <h1>Ranking</h1>
      </div>
      <nav className="abas-pagina" aria-label="Tipo de ranking">
        <Link className="aba-pagina" href="/ranking" aria-current={noMix ? undefined : 'page'}>
          Comunidade
        </Link>
        <Link className="aba-pagina" href="/ranking?aba=mix" aria-current={noMix ? 'page' : undefined}>
          Mix do mês
        </Link>
      </nav>
      {noMix ? <RankingDoMix usuario={usuario} texto={mes} /> : <RankingDaComunidade usuario={usuario} />}
    </>
  );
}
