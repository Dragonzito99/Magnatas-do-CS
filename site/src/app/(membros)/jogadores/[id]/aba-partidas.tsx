import Link from 'next/link';
import type { Ficha, PartidaDoPerfil } from '@/dominio/ficha';
import { NOME_DA_GRAVACAO, nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { FaixaDaPartida } from './visao-geral';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/**
 * A aba Partidas: a lista em faixas, com filtro pelos modos que aparecem nela, e o histórico de mix e salas com as
 * gravações, que antes ficava na página única.
 */
export function AbaPartidas({ jogadorId, partidas, modo, historico }: { jogadorId: string; partidas: PartidaDoPerfil[]; modo: string | null; historico: Ficha['historico'] }) {
  const modos = [...new Set(partidas.map((partida) => partida.modo))];
  const escolhido = modo && modos.includes(modo) ? modo : null;
  const lista = escolhido ? partidas.filter((partida) => partida.modo === escolhido) : partidas;
  const endereco = (valor: string | null) => (valor ? `/jogadores/${jogadorId}?aba=partidas&modo=${encodeURIComponent(valor)}` : `/jogadores/${jogadorId}?aba=partidas`);

  return (
    <div className="perfil-partidas">
      {modos.length > 1 && (
        <nav className="filtros-da-shop" aria-label="Modo">
          <Link href={endereco(null)} aria-current={escolhido === null ? 'page' : undefined}>
            Todas
          </Link>
          {modos.map((valor) => (
            <Link key={valor} href={endereco(valor)} aria-current={escolhido === valor ? 'page' : undefined}>
              {valor}
            </Link>
          ))}
        </nav>
      )}
      <section className="painel">
        {lista.length === 0 ? (
          <p className="vazio">Ainda não jogou nenhuma partida.</p>
        ) : (
          <div className="perfil-faixas">
            {lista.map((partida, indice) => (
              <FaixaDaPartida key={indice} partida={partida} />
            ))}
          </div>
        )}
      </section>

      <section className="painel" id="historico">
        <div className="cabeca-painel">
          <h2>Mix e salas</h2>
          <span>Com as gravações</span>
        </div>
        {historico.length === 0 && <p className="vazio">Ainda não jogou nenhuma partida de mix ou sala.</p>}
        {historico.map((partida) => (
          <div className="linha linha-historico" key={partida.id}>
            <div>
              <Link href={`/partidas/${partida.id}`}>{nomeDaPartida(partida)}</Link>
              <small>
                {nomeDoMapa(partida.mapa)}
                {partida.encerradaEm && `, ${dataCurta.format(partida.encerradaEm)}`}
              </small>
            </div>
            <span className={partida.venceu ? 'res vitoria' : 'res derrota'}>{partida.venceu ? 'Vitória' : 'Derrota'}</span>
            <span className="mono">
              {partida.placar1} x {partida.placar2}
            </span>
            <span className="mono" title="Abates, mortes e assistências">
              {partida.kills}/{partida.deaths}/{partida.assists}
            </span>
            <span className="mono" title="Dano por rodada">
              {partida.adr}
            </span>
            {partida.gravacao &&
              (partida.gravacao === 'disponivel' ? (
                <a className="botao cinza pequeno" href={`/api/gravacoes/${partida.gravacaoId}`}>
                  Baixar gravação
                </a>
              ) : (
                <span className="etiqueta">{NOME_DA_GRAVACAO[partida.gravacao]}</span>
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}
