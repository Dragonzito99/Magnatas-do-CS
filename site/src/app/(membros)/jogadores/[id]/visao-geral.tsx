import Image from 'next/image';
import Link from 'next/link';
import { fotoDoMapa } from '@/dominio/diversao';
import type { Ficha, PartidaDoPerfil } from '@/dominio/ficha';
import { nomeDaInsignia, type InsigniaDaFamilia } from '@/dominio/insignias';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { Insignia } from '../../insignia';

const diaEMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const numero = new Intl.NumberFormat('pt-BR');
const NOME_DO_RESULTADO = { vitoria: 'Vitória', empate: 'Empate', derrota: 'Derrota' } as const;

/** Uma partida em faixa: cor do resultado, foto do mapa, modo e mapa, placar, abates e XP. Usada também na aba Partidas. */
export function FaixaDaPartida({ partida }: { partida: PartidaDoPerfil }) {
  return (
    <Link href={partida.endereco} className={`perfil-faixa ${partida.resultado}`}>
      <i className="perfil-faixa-cor" aria-hidden="true" />
      <span className="perfil-faixa-foto" style={partida.foto ? { backgroundImage: `url('${partida.foto}')` } : undefined} aria-hidden="true" />
      <span className="perfil-faixa-texto">
        <b>
          {partida.modo}
          {partida.mapa && ` · ${partida.mapa}`}
        </b>
        <small>
          {NOME_DO_RESULTADO[partida.resultado]}
          {partida.placar && ` ${partida.placar}`} · {diaEMes.format(partida.data)}
        </small>
      </span>
      <span className="perfil-faixa-kd" title={partida.mortes === null ? 'Abates' : 'Abates e mortes'}>
        {partida.mortes === null ? `${partida.abates} ${partida.abates === 1 ? 'abate' : 'abates'}` : `${partida.abates}/${partida.mortes}`}
      </span>
      <span className="perfil-faixa-xp">+{numero.format(partida.xp)}</span>
    </Link>
  );
}

/** As 3 insígnias mais altas, para a Visão geral: maior nível primeiro, desempate pela ordem das famílias. */
export function melhoresInsignias(familias: InsigniaDaFamilia[], quantas = 3): { familia: InsigniaDaFamilia['familia']; nivel: number }[] {
  return familias
    .map((familia, ordem) => ({ familia: familia.familia, nivel: familia.nivel, ordem }))
    .filter((item) => item.nivel >= 0)
    .sort((a, b) => b.nivel - a.nivel || a.ordem - b.ordem)
    .slice(0, quantas)
    .map(({ familia, nivel }) => ({ familia, nivel }));
}

/**
 * A Visão geral do perfil novo (rascunho aprovado pelo dono, 11/11/2026): números, últimas partidas em faixas e mapas
 * à esquerda; mutante em uso, melhores insígnias, melhor partida e elogios à direita.
 */
export function VisaoGeral({
  jogadorId,
  ficha,
  ultimas,
  insignias,
  totalDeInsignias,
  mvps,
  aces,
  mutante,
  elogios,
}: {
  jogadorId: string;
  ficha: Pick<Ficha, 'estatisticas' | 'porMapa' | 'melhorPartida'>;
  ultimas: PartidaDoPerfil[];
  insignias: InsigniaDaFamilia[];
  totalDeInsignias: number;
  mvps: number;
  aces: number;
  mutante: { nome: string; imagem: string } | null;
  elogios: { tipo: string; nome: string; total: number }[];
}) {
  const { estatisticas, porMapa, melhorPartida } = ficha;
  const melhores = melhoresInsignias(insignias);
  const fotoMelhor = melhorPartida ? fotoDoMapa(melhorPartida.mapa) : null;
  return (
    <div className="perfil-grade">
      <div className="perfil-coluna">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Números</h2>
            <span>Competitivo e mix</span>
          </div>
          <div className="perfil-numeros">
            <div className="perfil-numero forte">
              <small>K/D</small>
              <b>{estatisticas.kd.toFixed(2)}</b>
            </div>
            <div className="perfil-numero">
              <small>Vitórias</small>
              <b>{estatisticas.vitoriasPct}%</b>
              <span>
                {estatisticas.vitorias} de {estatisticas.partidas}
              </span>
            </div>
            <div className="perfil-numero">
              <small>Dano por rodada</small>
              <b>{estatisticas.adr}</b>
            </div>
            <div className="perfil-numero">
              <small>Headshot</small>
              <b>{estatisticas.hsPct}%</b>
            </div>
          </div>
          <div className="perfil-miudos">
            <span>
              Abates <b>{numero.format(estatisticas.abates)}</b>
            </span>
            <span>
              Mortes <b>{numero.format(estatisticas.mortes)}</b>
            </span>
            <span>
              Assistências <b>{numero.format(estatisticas.assistencias)}</b>
            </span>
            <span>
              Abates por partida <b>{estatisticas.abatesPorPartida}</b>
            </span>
            <span>
              MVPs <b>{numero.format(mvps)}</b>
            </span>
            <span>
              Aces <b>{numero.format(aces)}</b>
            </span>
          </div>
        </section>

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Últimas partidas</h2>
            <Link href={`/jogadores/${jogadorId}?aba=partidas`} className="link-ouro">
              Ver todas
            </Link>
          </div>
          {ultimas.length === 0 ? (
            <p className="vazio">Ainda não jogou nenhuma partida.</p>
          ) : (
            <div className="perfil-faixas">
              {ultimas.map((partida, indice) => (
                <FaixaDaPartida key={indice} partida={partida} />
              ))}
            </div>
          )}
        </section>

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Por mapa</h2>
          </div>
          {porMapa.length === 0 ? (
            <p className="vazio">Ainda não há partidas.</p>
          ) : (
            <div className="perfil-mapas">
              {porMapa.map((linha) => {
                const foto = fotoDoMapa(linha.mapa);
                return (
                  <div className="perfil-mapa" key={linha.mapa} style={foto ? { backgroundImage: `url('${foto}')` } : undefined}>
                    <b>{nomeDoMapa(linha.mapa)}</b>
                    <small>
                      {linha.vitoriasPct}% de vitórias · {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'} · K/D {linha.kd.toFixed(2)}
                    </small>
                    <span className="perfil-mapa-barra">
                      <i style={{ width: `${linha.vitoriasPct}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="perfil-coluna">
        {mutante && (
          <section className="painel perfil-mutante">
            <small>Mutante em uso</small>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mutante.imagem} alt="" />
            <b>{mutante.nome}</b>
          </section>
        )}

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Insígnias</h2>
            <Link href={`/jogadores/${jogadorId}?aba=insignias`} className="link-ouro">
              {totalDeInsignias} de 30
            </Link>
          </div>
          {melhores.length === 0 ? (
            <p className="vazio">Nenhuma insígnia ainda.</p>
          ) : (
            <div className="perfil-melhores-insignias">
              {melhores.map((item) => (
                <span key={item.familia}>
                  <Insignia familia={item.familia} nivel={item.nivel} tamanho={72} />
                  <b>{nomeDaInsignia(item.familia, item.nivel)}</b>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Melhor partida</h2>
          </div>
          {melhorPartida ? (
            <Link href={`/partidas/${melhorPartida.id}`} className="mapa-do-perfil melhor">
              {fotoMelhor && <Image src={fotoMelhor} alt="" width={480} height={270} />}
              <b>
                {melhorPartida.kills} {melhorPartida.kills === 1 ? 'abate' : 'abates'}
              </b>
              <span>
                K/D {melhorPartida.kd.toFixed(2)} · {nomeDaPartida(melhorPartida)} · {nomeDoMapa(melhorPartida.mapa)}
              </span>
            </Link>
          ) : (
            <p className="vazio">Ainda não há partidas.</p>
          )}
        </section>

        <section className="painel">
          <div className="cabeca-painel">
            <h2>Elogios</h2>
            <span>{elogios.reduce((total, elogio) => total + elogio.total, 0)}</span>
          </div>
          {elogios.length === 0 ? (
            <p className="vazio">Ainda sem elogios.</p>
          ) : (
            <div className="elogios-do-jogador">
              {elogios.map((elogio) => (
                <span className="elogio" key={elogio.tipo}>
                  {elogio.nome} <b>×{elogio.total}</b>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
