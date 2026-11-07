import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { bombandoAgora } from '@/dominio/bombando';
import { mvpsDoPeriodo, periodoDeBrasilia, type LinhaDeMvp } from '@/dominio/mvps';
import { ultimasNoticias } from '@/dominio/noticias';
import { noticiasSteamDaTela } from '@/dominio/noticias-steam';
import { nomeDaPartida, nomeDoMapa } from '@/dominio/textos-da-partida';
import { ENDERECO_DA_LIQUIPEDIA, tierSDaTela } from '@/dominio/tier-s';
import { controladorDoAmbiente } from '@/servidor-jogo/controlador';
import { Atualizar } from '../atualizar';
import { Avatar } from '../avatar';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const dataEHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const diaIso = (iso: string) => dataCurta.format(new Date(`${iso}T12:00:00Z`));

/** O primeiro parágrafo da notícia, cortado, para a lista. */
function chamada(texto: string): string {
  const primeiro = texto.split(/\n\s*\n/)[0];
  return primeiro.length > 180 ? `${primeiro.slice(0, 177)}...` : primeiro;
}

// Notícia sem foto ganha a de um mapa, para o cartão nunca ficar vazio.
const FOTOS_DE_RESERVA = ['/mapas/egypt.webp', '/mapas/mirage.webp', '/mapas/laboratory.webp', '/mapas/dust2.webp', '/mapas/biochemical-hotel.webp'];
const fotoDaNoticia = (imagem: string | null, indice: number) => imagem ?? FOTOS_DE_RESERVA[indice % FOTOS_DE_RESERVA.length];

function Mvp({ titulo, linha, vazio }: { titulo: string; linha?: LinhaDeMvp; vazio: string }) {
  return (
    <div className="mvp-do-periodo">
      <small>{titulo}</small>
      {linha ? (
        <Link href={`/jogadores/${linha.id}`} className="perfil">
          <Avatar usuario={linha} />
          <span>
            <b>{linha.apelido}</b>
            <span className="apoio">
              {linha.mvps} {linha.mvps === 1 ? 'estrela' : 'estrelas'} em {linha.partidas} {linha.partidas === 1 ? 'partida' : 'partidas'}
            </span>
          </span>
        </Link>
      ) : (
        <span className="apoio">{vazio}</span>
      )}
    </div>
  );
}

export default async function Inicio() {
  await exigirAcesso('/inicio');
  const bd = obterBd();
  const agora = new Date();
  const [bombando, noticias, mvpsDoDia, mvpsDoMes, steam, tierS] = await Promise.all([
    bombandoAgora(bd, controladorDoAmbiente(), process.env.DIVERSAO_HOST, process.env.SERVIDOR_SENHA ?? ''),
    ultimasNoticias(bd, 5),
    mvpsDoPeriodo(bd, periodoDeBrasilia(agora, 'dia'), 1),
    mvpsDoPeriodo(bd, periodoDeBrasilia(agora, 'mes'), 5),
    noticiasSteamDaTela(bd, 4),
    tierSDaTela(bd),
  ]);
  const jogando = bombando.cartoes.reduce((total, cartao) => total + cartao.jogando, 0);
  const destaque = noticias[0];

  return (
    <>
      <Atualizar segundos={30} />
      <section className="capa-inicio">
        <Image className="capa-personagem esquerda" src="/marca/personagem.webp" alt="" width={756} height={800} priority />
        <Image className="capa-personagem direita" src="/marca/personagem.webp" alt="" width={756} height={800} priority />
        <div className="capa-centro">
          <Image className="capa-logo" src="/marca/logo.webp" alt="Magnatas do CS" width={1000} height={334} priority />
          <p className="capa-frase">
            Jogue <b>·</b> Vença <b>·</b> Faça parte
          </p>
          <Link href="/jogar" className="botao-capa">
            JOGAR AGORA
            <small>
              {jogando === 0 ? 'Ninguém jogando agora: abra uma sala' : `${jogando} ${jogando === 1 ? 'pessoa jogando' : 'pessoas jogando'} agora`}
            </small>
          </Link>
        </div>
      </section>

      <section className="destaques-inicio">
        {destaque ? (
          <Link href={`/noticias/${destaque.id}`} className="cartao-destaque grande">
            <Image src={fotoDaNoticia(destaque.imagem, 0)} alt="" width={960} height={540} />
            <span className="selo-modo ouro">{destaque.fixada ? 'Fixada' : 'Notícia do clube'}</span>
            <h2>{destaque.titulo}</h2>
            <p>{chamada(destaque.texto)}</p>
          </Link>
        ) : (
          <div className="cartao-destaque grande sem-foto">
            <span className="selo-modo ouro">Notícias do clube</span>
            <h2>Nenhuma notícia ainda</h2>
          </div>
        )}
        {bombando.cartoes[0] ? (
          <a href={bombando.cartoes[0].href} className="cartao-destaque">
            <Image src={bombando.cartoes[0].tipo === 'diversao' ? '/mapas/laboratory.webp' : '/mapas/dust2.webp'} alt="" width={480} height={540} />
            <span className="selo-modo verde">Bombando agora</span>
            <h2>{bombando.cartoes[0].titulo}</h2>
            <p>{bombando.cartoes[0].ocupacao} · clique para entrar</p>
          </a>
        ) : (
          <Link href="/jogar" className="cartao-destaque sem-foto">
            <span className="selo-modo verde">Bombando agora</span>
            <h2>Ninguém jogando</h2>
            <p>Que tal abrir uma sala?</p>
          </Link>
        )}
        {mvpsDoDia[0] ? (
          <Link href={`/jogadores/${mvpsDoDia[0].id}`} className="cartao-destaque">
            <Image src="/mapas/mirage.webp" alt="" width={480} height={540} />
            <span className="selo-modo ouro">MVP do dia</span>
            <h2>{mvpsDoDia[0].apelido}</h2>
            <p>
              {mvpsDoDia[0].mvps} {mvpsDoDia[0].mvps === 1 ? 'estrela' : 'estrelas'} hoje
            </p>
          </Link>
        ) : (
          <div className="cartao-destaque sem-foto">
            <span className="selo-modo ouro">MVP do dia</span>
            <h2>Ninguém ainda</h2>
            <p>A primeira estrela do dia está esperando você.</p>
          </div>
        )}
      </section>

      {bombando.aoVivo.length > 0 && (
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Ao vivo agora</h2>
            <span>{bombando.aoVivo.length === 1 ? '1 partida' : `${bombando.aoVivo.length} partidas`}</span>
          </div>
          {bombando.aoVivo.map((partida) => (
            <Link href={`/partidas/${partida.id}`} className="linha" key={partida.id}>
              <span>
                <b>{nomeDaPartida(partida)}</b> <small>{nomeDoMapa(partida.mapa)}</small>
              </span>
              <span className="mono">
                {partida.placar1} x {partida.placar2}
              </span>
            </Link>
          ))}
        </section>
      )}

      <div className="grade grade-inicio">
        <section className="painel">
          <div className="cabeca-painel">
            <h2>Notícias do clube</h2>
          </div>
          {noticias.length <= 1 && <p className="vazio">As outras notícias aparecem aqui.</p>}
          {noticias.slice(1).map((noticia) => (
            <Link href={`/noticias/${noticia.id}`} className="noticia-da-lista" key={noticia.id}>
              <small>
                {noticia.fixada && '📌 '}
                {noticia.autorApelido}, {dataCurta.format(noticia.criadoEm)}
              </small>
              <b>{noticia.titulo}</b>
              <span className="apoio">{chamada(noticia.texto)}</span>
            </Link>
          ))}
        </section>

        <div className="pilha">
          <section className="painel">
            <div className="cabeca-painel">
              <h2>MVPs</h2>
              <span>Estrelas nas partidas do clube</span>
            </div>
            <div className="mvps">
              <Mvp titulo="MVP do dia" linha={mvpsDoDia[0]} vazio="Ninguém ainda hoje." />
              <Mvp titulo="MVP do mês" linha={mvpsDoMes[0]} vazio="Ninguém ainda neste mês." />
            </div>
            {mvpsDoMes.length > 1 && (
              <ol className="top-mvps">
                {mvpsDoMes.map((linha) => (
                  <li key={linha.id}>
                    <Link href={`/jogadores/${linha.id}`}>{linha.apelido}</Link>
                    <span className="mono">{linha.mvps}★</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="painel">
            <div className="cabeca-painel">
              <h2>CS2 oficial</h2>
              <span>Steam</span>
            </div>
            {steam.length === 0 && <p className="vazio">Sem atualizações por enquanto.</p>}
            {steam.map((noticia) => (
              <a className="noticia-da-lista" href={noticia.url} target="_blank" rel="noreferrer" key={noticia.gid}>
                <small>{dataCurta.format(noticia.publicadaEm)}</small>
                <b>{noticia.titulo}</b>
                {noticia.resumo && <span className="apoio">{noticia.resumo}</span>}
              </a>
            ))}
          </section>

          <section className="painel">
            <div className="cabeca-painel">
              <h2>Tier S</h2>
              <span>Times brasileiros</span>
            </div>
            {!tierS || tierS.torneios.length === 0 ? (
              <p className="vazio">Sem campeonatos Tier S agora.</p>
            ) : (
              <>
                {tierS.torneios.map((torneio) => (
                  <a className="noticia-da-lista" href={`${ENDERECO_DA_LIQUIPEDIA}${torneio.pagina}`} target="_blank" rel="noreferrer" key={torneio.pagina}>
                    <small>
                      {torneio.situacao === 'andamento' ? 'Rolando agora' : `Começa ${diaIso(torneio.inicio)}`}, até {diaIso(torneio.fim)}
                      {torneio.premiacao && `, ${torneio.premiacao}`}
                    </small>
                    <b>{torneio.nome}</b>
                  </a>
                ))}
                {tierS.jogos.length > 0 && (
                  <div className="jogos-tier-s">
                    {tierS.jogos.slice(0, 8).map((jogo) => (
                      <div className="linha" key={`${jogo.pagina}-${jogo.time1}-${jogo.time2}-${jogo.quando?.toISOString() ?? ''}`}>
                        <span>
                          <b>
                            {jogo.time1} x {jogo.time2}
                          </b>
                          <small>{jogo.quando ? dataEHora.format(jogo.quando) : jogo.torneio}</small>
                        </span>
                        <span className="mono">{jogo.placar ?? 'vs'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="fonte">
              Fonte:{' '}
              <a href={ENDERECO_DA_LIQUIPEDIA} target="_blank" rel="noreferrer">
                Liquipedia
              </a>{' '}
              (CC-BY-SA)
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
