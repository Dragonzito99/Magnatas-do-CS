import Link from 'next/link';
import type { ReactNode } from 'react';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { moldurasDe } from '@/dominio/loja';
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
import { patenteDe } from '@/dominio/xp';
import { Avatar } from '../avatar';
import { InsigniaDaPatente } from '../insignia-da-patente';

const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tituloDoMes = ({ ano, mes }: Mes) => {
  const texto = nomeDoMes.format(new Date(Date.UTC(ano, mes - 1, 15)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const antes = (a: Mes, b: Mes) => a.ano < b.ano || (a.ano === b.ano && a.mes < b.mes);
const numero = new Intl.NumberFormat('pt-BR');
const porcento = (parte: number, todo: number) => (todo > 0 ? Math.max(0, Math.min(100, Math.round((parte / todo) * 100))) : 0);

type Jogador = { id: string; apelido: string; avatarUrl: string | null };
type Molduras = Map<string, string>;

/** "Seu lugar": a posição de quem olha, em destaque, com quanto falta para passar quem está logo acima. */
function SeuLugar({
  posicao,
  usuario,
  moldura,
  detalhe,
  valor,
  unidade,
  meta,
  vazio,
}: {
  posicao: number | null;
  usuario: Pick<Usuario, 'apelido' | 'avatarUrl'>;
  moldura: string | undefined;
  detalhe: ReactNode;
  valor: string;
  unidade: string;
  meta: { texto: ReactNode; porcento: number } | null;
  vazio: string;
}) {
  return (
    <section className="seu-lugar" aria-label="Seu lugar no ranking">
      <span className="posicao-do-seu-lugar">
        {posicao ?? '—'}
        {posicao && <small>º</small>}
      </span>
      <Avatar usuario={usuario} moldura={moldura} />
      <div>
        <b className="nome-do-seu-lugar">Você · {usuario.apelido}</b>
        <small className="detalhe-do-seu-lugar">{posicao ? detalhe : vazio}</small>
        {meta && (
          <div className="meta-do-seu-lugar">
            <div>
              <span>{meta.texto}</span>
              <span>{meta.porcento}%</span>
            </div>
            <span className="barra-da-meta">
              <i style={{ width: `${meta.porcento}%` }} />
            </span>
          </div>
        )}
      </div>
      {posicao && (
        <span className="valor-do-seu-lugar">
          <b>{valor}</b>
          <small>{unidade}</small>
        </span>
      )}
    </section>
  );
}

type LugarDoPodio = { posicao: number; jogador: Jogador; detalhe: ReactNode; numero: string };

/** O pódio com degraus: segundo, primeiro (mais alto, com coroa) e terceiro, nas cores das medalhas. */
function Podio({ lugares, molduras }: { lugares: LugarDoPodio[]; molduras: Molduras }) {
  const ordem = [lugares[1], lugares[0], lugares[2]].filter(Boolean);
  if (ordem.length === 0) return null;
  return (
    <div className={`podio-com-degraus com-${ordem.length}`}>
      {ordem.map((lugar) => (
        <div key={lugar.jogador.id} className={`degrau-do-podio p${lugar.posicao}`}>
          <div className="pessoa-no-podio">
            {lugar.posicao === 1 && (
              <span className="coroa-do-podio" aria-hidden="true">
                ♛
              </span>
            )}
            <Avatar usuario={lugar.jogador} moldura={molduras.get(lugar.jogador.id)} />
            <Link className="nome-no-podio" href={`/jogadores/${lugar.jogador.id}`}>
              {lugar.jogador.apelido}
            </Link>
            {lugar.detalhe}
          </div>
          <div className="bloco-do-degrau">
            <span>{lugar.posicao}</span>
            <em>{lugar.numero}</em>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A célula do número principal, com a barra comparada ao 1º lugar. */
function Barra({ texto, parte, todo }: { texto: string; parte: number; todo: number }) {
  return (
    <span className="barra-do-ranking">
      <b>{texto}</b>
      <span>
        <i style={{ width: `${porcento(parte, todo)}%` }} />
      </span>
    </span>
  );
}

/** Uma linha da lista: posição grande, foto, nome e as colunas de cada ranking. */
function Linha({ posicao, jogador, eu, molduras, children }: { posicao: number; jogador: Jogador; eu: boolean; molduras: Molduras; children: ReactNode }) {
  return (
    <div role="row" className={eu ? 'linha-do-ranking minha' : 'linha-do-ranking'}>
      <span role="cell" className="posicao-na-linha">
        {posicao}
      </span>
      <span role="cell">
        <Avatar usuario={jogador} moldura={molduras.get(jogador.id)} />
      </span>
      <span role="cell" className="nome-na-linha">
        <Link href={`/jogadores/${jogador.id}`}>{jogador.apelido}</Link>
      </span>
      {children}
    </div>
  );
}

function Cabeca({ colunas }: { colunas: { nome: string; classe?: string }[] }) {
  return (
    <div role="row" className="linha-do-ranking cabeca">
      <span role="columnheader">#</span>
      <span role="columnheader" />
      <span role="columnheader">Jogador</span>
      {colunas.map((coluna) => (
        <span key={coluna.nome} role="columnheader" className={coluna.classe}>
          {coluna.nome}
        </span>
      ))}
    </div>
  );
}

async function RankingDaComunidade({ usuario }: { usuario: Usuario }) {
  const bd = obterBd();
  const linhas = await rankingDaComunidade(bd);
  const molduras = await moldurasDe(bd, [...linhas.map((linha) => linha.jogador.id), usuario.id]);
  const eu = minhaPosicao(linhas, usuario.id);
  const minha = linhas.find((linha) => linha.jogador.id === usuario.id);
  const acima = eu?.acima ? linhas[eu.posicao - 2] : undefined;
  const topo = linhas[0]?.xp ?? 0;
  const patente = patenteDe(usuario.xpTotal);
  return (
    <>
      <SeuLugar
        posicao={eu?.posicao ?? null}
        usuario={usuario}
        moldura={molduras.get(usuario.id)}
        detalhe={
          <>
            {patente.nome} · {minha?.partidas ?? 0} {minha?.partidas === 1 ? 'partida' : 'partidas'} · {minha?.vitoriasPct ?? 0}% de vitórias
          </>
        }
        valor={numero.format(usuario.xpTotal)}
        unidade="XP"
        meta={
          eu && acima
            ? {
                texto: (
                  <>
                    Faltam <em>{numero.format(eu.faltam)} XP</em> para passar <em>{acima.jogador.apelido}</em> e ficar em {eu.posicao - 1}º
                  </>
                ),
                porcento: porcento(usuario.xpTotal, acima.xp + 1),
              }
            : eu
              ? { texto: <>Você está em 1º. O mais magnata do clube!</>, porcento: 100 }
              : null
        }
        vazio="Você ainda não está no ranking. Jogue uma partida para entrar."
      />
      <Podio
        molduras={molduras}
        lugares={linhas.slice(0, 3).map((linha) => ({
          posicao: linha.posicao,
          jogador: linha.jogador,
          detalhe: (
            <span className="detalhe-no-podio">
              <InsigniaDaPatente patente={linha.patente} classe="insignia-mini" />
              {linha.patente.nome}
            </span>
          ),
          numero: `${numero.format(linha.xp)} XP`,
        }))}
      />
      {linhas.length === 0 ? (
        <div className="extrato-vazio">
          <b>Ninguém no ranking ainda</b>
          <p>A primeira partida encerrada abre o ranking.</p>
        </div>
      ) : (
        <div className="lista-do-ranking da-comunidade" role="table" aria-label="Ranking da comunidade">
          <Cabeca colunas={[{ nome: 'Patente', classe: 'so-computador' }, { nome: 'XP' }, { nome: 'Partidas', classe: 'numero-na-linha so-computador' }, { nome: 'Vitórias', classe: 'numero-na-linha so-computador' }]} />
          {linhas.map((linha) => (
            <Linha key={linha.jogador.id} posicao={linha.posicao} jogador={linha.jogador} eu={linha.jogador.id === usuario.id} molduras={molduras}>
              <span role="cell" className="patente-na-linha so-computador">
                <InsigniaDaPatente patente={linha.patente} classe="insignia-mini" />
                {linha.patente.nome}
              </span>
              <span role="cell">
                <Barra texto={numero.format(linha.xp)} parte={linha.xp} todo={topo} />
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.partidas}
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.vitoriasPct}%
              </span>
            </Linha>
          ))}
        </div>
      )}
      <p className="legenda-da-secao frase-de-clas">Todas as partidas dão XP, e ele não zera.</p>
    </>
  );
}

async function RankingDeMvps({ usuario }: { usuario: Usuario }) {
  const bd = obterBd();
  const agora = new Date();
  const linhas = await mvpsDoPeriodo(bd, periodoDeBrasilia(agora, 'mes'), 50);
  const molduras = await moldurasDe(bd, [...linhas.map((linha) => linha.id), usuario.id]);
  const indice = linhas.findIndex((linha) => linha.id === usuario.id);
  const minha = indice >= 0 ? linhas[indice] : undefined;
  const acima = indice > 0 ? linhas[indice - 1] : undefined;
  const topo = linhas[0]?.mvps ?? 0;
  const estrelas = (quantas: number) => `${quantas} ${quantas === 1 ? 'estrela' : 'estrelas'}`;
  return (
    <>
      <SeuLugar
        posicao={minha ? indice + 1 : null}
        usuario={usuario}
        moldura={molduras.get(usuario.id)}
        detalhe={
          <>
            {minha?.kills ?? 0} abates · {minha?.partidas ?? 0} {minha?.partidas === 1 ? 'partida' : 'partidas'} em {tituloDoMes(mesDe(agora)).toLowerCase()}
          </>
        }
        valor={`★ ${minha?.mvps ?? 0}`}
        unidade="estrelas"
        meta={
          minha && acima
            ? {
                texto: (
                  <>
                    Faltam <em>{estrelas(acima.mvps - minha.mvps + 1)}</em> para passar <em>{acima.apelido}</em>
                  </>
                ),
                porcento: porcento(minha.mvps, acima.mvps + 1),
              }
            : null
        }
        vazio="Você ainda não ganhou estrela de MVP neste mês."
      />
      <Podio
        molduras={molduras}
        lugares={linhas.slice(0, 3).map((linha, posicao) => ({
          posicao: posicao + 1,
          jogador: linha,
          detalhe: <span className="detalhe-no-podio">{linha.kills} abates</span>,
          numero: `★ ${linha.mvps}`,
        }))}
      />
      {linhas.length === 0 ? (
        <div className="extrato-vazio">
          <b>Nenhuma estrela ainda</b>
          <p>Ninguém ganhou estrela de MVP neste mês.</p>
        </div>
      ) : (
        <div className="lista-do-ranking de-mvps" role="table" aria-label="Ranking de MVPs">
          <Cabeca colunas={[{ nome: 'Estrelas' }, { nome: 'Abates', classe: 'numero-na-linha so-computador' }, { nome: 'Partidas', classe: 'numero-na-linha so-computador' }]} />
          {linhas.map((linha, posicao) => (
            <Linha key={linha.id} posicao={posicao + 1} jogador={linha} eu={linha.id === usuario.id} molduras={molduras}>
              <span role="cell" className="estrelas-na-linha">
                <Barra texto={`★ ${linha.mvps}`} parte={linha.mvps} todo={topo} />
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.kills}
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.partidas}
              </span>
            </Linha>
          ))}
        </div>
      )}
      <p className="legenda-da-secao frase-de-clas">Cada rodada dá uma estrela de MVP para o melhor dela. Zera todo mês.</p>
    </>
  );
}

async function RankingDoMix({ usuario, texto }: { usuario: Usuario; texto: string | undefined }) {
  const bd = obterBd();
  const atual = mesDe(new Date());
  const pedido = lerMes(texto);
  const mes = pedido && !antes(atual, pedido) ? pedido : atual;
  const [{ linhas, foraDoRanking }, primeiro] = await Promise.all([rankingDoMes(bd, mes), primeiroMesComPartida(bd)]);
  const molduras = await moldurasDe(bd, [...linhas.map((linha) => linha.jogador.id), usuario.id]);
  const podeVoltar = !!primeiro && antes(primeiro, mes);
  const podeAvancar = antes(mes, atual);
  const minha = linhas.find((linha) => linha.jogador.id === usuario.id);
  const topo = linhas[0]?.kd ?? 0;

  return (
    <>
      <nav className="mes-do-ranking" aria-label="Mês do ranking">
        {podeVoltar ? (
          <Link href={`/ranking?aba=mix&mes=${textoDoMes(mesAnterior(mes))}`} aria-label="Mês anterior">
            ‹
          </Link>
        ) : (
          <span className="apagada" aria-hidden="true">
            ‹
          </span>
        )}
        <b>{tituloDoMes(mes)}</b>
        {podeAvancar ? (
          <Link href={`/ranking?aba=mix&mes=${textoDoMes(proximoMes(mes))}`} aria-label="Próximo mês">
            ›
          </Link>
        ) : (
          <span className="apagada" aria-hidden="true">
            ›
          </span>
        )}
      </nav>

      <SeuLugar
        posicao={minha?.posicao ?? null}
        usuario={usuario}
        moldura={molduras.get(usuario.id)}
        detalhe={
          <>
            {minha?.partidas ?? 0} partidas · {minha?.vitoriasPct ?? 0}% de vitórias · ADR {minha?.adr ?? 0}
          </>
        }
        valor={minha ? minha.kd.toFixed(2) : '—'}
        unidade="K/D"
        meta={null}
        vazio={`Fora do ranking deste mês: entra quem joga pelo menos ${MINIMO_DE_PARTIDAS_NO_MES} partidas de Mix.`}
      />
      <Podio
        molduras={molduras}
        lugares={linhas.slice(0, 3).map((linha) => ({
          posicao: linha.posicao,
          jogador: linha.jogador,
          detalhe: (
            <span className="detalhe-no-podio">
              {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'}
            </span>
          ),
          numero: `K/D ${linha.kd.toFixed(2)}`,
        }))}
      />
      {linhas.length === 0 ? (
        <div className="extrato-vazio">
          <b>Ninguém no ranking deste mês</b>
          <p>Ainda ninguém chegou a {MINIMO_DE_PARTIDAS_NO_MES} partidas de Mix.</p>
        </div>
      ) : (
        <div className="lista-do-ranking do-mix" role="table" aria-label="Ranking do Mix do mês">
          <Cabeca
            colunas={[
              { nome: 'Partidas', classe: 'numero-na-linha so-computador' },
              { nome: 'Vitórias', classe: 'numero-na-linha so-computador' },
              { nome: 'Abates', classe: 'numero-na-linha so-computador' },
              { nome: 'Mortes', classe: 'numero-na-linha so-computador' },
              { nome: 'ADR', classe: 'numero-na-linha so-computador' },
              { nome: 'K/D' },
            ]}
          />
          {linhas.map((linha) => (
            <Linha key={linha.jogador.id} posicao={linha.posicao} jogador={linha.jogador} eu={linha.jogador.id === usuario.id} molduras={molduras}>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.partidas}
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.vitoriasPct}%
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.abates}
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.mortes}
              </span>
              <span role="cell" className="numero-na-linha so-computador">
                {linha.adr}
              </span>
              <span role="cell">
                <Barra texto={linha.kd.toFixed(2)} parte={linha.kd} todo={topo} />
              </span>
            </Linha>
          ))}
        </div>
      )}
      <p className="legenda-da-secao frase-de-clas">
        Entra no ranking quem jogou pelo menos {MINIMO_DE_PARTIDAS_NO_MES} partidas de Mix no mês.
        {foraDoRanking > 0 && ` Fora do ranking: ${foraDoRanking === 1 ? '1 magnata' : `${foraDoRanking} magnatas`}.`}
      </p>
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
      <div className="carteira-da-shop">
        <h1>Ranking</h1>
      </div>
      <nav className="filtros-da-shop" aria-label="Tipo de ranking">
        {ABAS.map((item) => (
          <Link key={item.nome} href={item.href} aria-current={atual === item.valor ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
        <Link href="/clas?aba=ranking">Clãs</Link>
      </nav>
      {atual === 'mix' ? <RankingDoMix usuario={usuario} texto={mes} /> : atual === 'mvps' ? <RankingDeMvps usuario={usuario} /> : <RankingDaComunidade usuario={usuario} />}
    </div>
  );
}
