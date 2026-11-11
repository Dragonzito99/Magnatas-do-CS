import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import {
  agendaDosTimes,
  cartoesDeNoticias,
  FILTROS_DE_NOTICIAS,
  lerFiltroDeNoticias,
  quandoCurto,
  quandoDoJogo,
  type CartaoDeNoticia,
  type TimeNoConfronto,
} from '@/dominio/cartoes-de-noticias';
import { ultimasNoticias } from '@/dominio/noticias';
import { noticiasSteamDaTela } from '@/dominio/noticias-steam';
import { ENDERECO_DA_LIQUIPEDIA, tierSDaTela } from '@/dominio/tier-s';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Notícia do clube abre aqui no site; CS2 e times brasileiros abrem a fonte em outra aba. */
function Destino({ cartao, className, children }: { cartao: Pick<CartaoDeNoticia, 'externo' | 'href'>; className: string; children: React.ReactNode }) {
  if (cartao.externo) {
    return (
      <a href={cartao.href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={cartao.href} className={className}>
      {children}
    </Link>
  );
}

function LogoDoTime({ time, tamanho }: { time: TimeNoConfronto; tamanho: number }) {
  if (!time.logo) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo-do-time" src={time.logo} alt={time.nome} width={tamanho} height={tamanho} />;
}

/** No lugar da foto, os times: as duas logos com o x no meio; time sem logo guardada aparece como "contra Fulano". */
function ConfrontoNoCartao({ cartao }: { cartao: CartaoDeNoticia }) {
  const confronto = cartao.confronto!;
  const [br, outro] = confronto.time1.logo ? [confronto.time1, confronto.time2] : [confronto.time2, confronto.time1];
  const classico = !!outro.logo;
  return (
    <div className="confronto-da-noticia">
      <span className="selo-da-noticia">{cartao.etiqueta}</span>
      {classico ? (
        <>
          <LogoDoTime time={confronto.time1} tamanho={84} />
          <span className="x-do-confronto">x</span>
          <LogoDoTime time={confronto.time2} tamanho={84} />
        </>
      ) : (
        <>
          <LogoDoTime time={br} tamanho={96} />
          <span className="contra-do-confronto">contra {outro.nome}</span>
        </>
      )}
      {confronto.placar && <span className="placar-do-confronto">{confronto.placar.replace(':', ' : ')}</span>}
    </div>
  );
}

export default async function Noticias({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await exigirAcesso('/noticias');
  const filtro = lerFiltroDeNoticias((await searchParams).tipo);
  const bd = obterBd();
  const agora = new Date();
  const [clube, steam, tierS] = await Promise.all([ultimasNoticias(bd, 30), noticiasSteamDaTela(bd, 12), tierSDaTela(bd)]);
  const jogos = tierS?.jogos ?? [];
  const { destaque, cartoes } = cartoesDeNoticias({ clube, steam, jogos }, filtro);
  const agenda = filtro === null || filtro === 'times' ? agendaDosTimes(jogos, agora) : [];

  return (
    <div className="tela-jogar">
      <div className="carteira-da-shop">
        <h1>Notícias</h1>
      </div>
      <nav className="filtros-da-shop" aria-label="Tipo de notícia">
        {FILTROS_DE_NOTICIAS.map((item) => (
          <Link key={item.nome} href={item.valor ? `/noticias?tipo=${item.valor}` : '/noticias'} aria-current={filtro === item.valor ? 'page' : undefined}>
            {item.nome}
          </Link>
        ))}
      </nav>

      {(destaque || agenda.length > 0) && (
        <div className={destaque && agenda.length > 0 ? 'topo-das-noticias com-agenda' : 'topo-das-noticias'}>
          {destaque && (
            <Destino cartao={destaque} className="destaque-da-noticia">
              <Image src={destaque.imagem} alt="" width={1200} height={500} priority />
              <span className="selo-da-noticia">{clube[0]?.fixada ? 'Fixada · Do clube' : 'Do clube'}</span>
              <h2>{destaque.titulo}</h2>
              {destaque.resumo && <p>{destaque.resumo}</p>}
              {destaque.data && <small>{dataCurta.format(destaque.data)}</small>}
            </Destino>
          )}
          {agenda.length > 0 && (
            <aside className="agenda-dos-times" aria-label="Jogos dos times brasileiros">
              <h2>
                Times BR <small>próximos jogos e resultados</small>
              </h2>
              {agenda.map((linha) => (
                <a key={`${linha.href}-${linha.quando.getTime()}-${linha.time1.nome}`} href={linha.href} target="_blank" rel="noreferrer" className="jogo-da-agenda">
                  <span className="time-da-agenda">
                    <LogoDoTime time={linha.time1} tamanho={30} />
                    {linha.time1.nome}
                  </span>
                  <span className="meio-da-agenda">
                    {linha.terminou ? (
                      <>
                        <b>{linha.placar ? linha.placar.replace(':', ' : ') : 'vs'}</b>
                        <small>{quandoCurto(linha.quando, agora)}</small>
                      </>
                    ) : (
                      <>
                        <b>{hora.format(linha.quando)}</b>
                        <small>{quandoCurto(linha.quando, agora)}</small>
                      </>
                    )}
                  </span>
                  <span className="time-da-agenda direita">
                    {linha.time2.nome}
                    <LogoDoTime time={linha.time2} tamanho={30} />
                  </span>
                  <span className="torneio-da-agenda">{linha.torneio}</span>
                </a>
              ))}
            </aside>
          )}
        </div>
      )}

      {cartoes.length > 0 && (
        <div className="secao-da-shop">
          <h2>Últimas</h2>
        </div>
      )}
      {!destaque && cartoes.length === 0 && (
        <div className="extrato-vazio">
          <b>Nada por aqui ainda</b>
          <p>Quando sair notícia desse tipo, ela aparece aqui.</p>
        </div>
      )}
      {cartoes.length > 0 && (
        <div className="grade-de-noticias">
          {cartoes.map((cartao, indice) => (
            <Destino key={`${cartao.tipo}-${indice}-${cartao.titulo}`} cartao={cartao} className={`cartao-de-noticia tipo-${cartao.tipo}`}>
              {cartao.confronto ? (
                <ConfrontoNoCartao cartao={cartao} />
              ) : (
                <div className="foto-da-noticia">
                  <Image src={cartao.imagem} alt="" width={480} height={270} />
                  <span className="selo-da-noticia">{cartao.etiqueta}</span>
                </div>
              )}
              <div className="corpo-da-noticia">
                {cartao.data && <small>{cartao.confronto ? quandoDoJogo(cartao.data, agora) : dataCurta.format(cartao.data)}</small>}
                <h3>{cartao.titulo}</h3>
                {cartao.resumo && <p>{cartao.resumo}</p>}
              </div>
            </Destino>
          ))}
        </div>
      )}
      {(agenda.length > 0 || cartoes.some((cartao) => cartao.tipo === 'times')) && (
        <p className="legenda-da-secao frase-de-clas">
          Jogos e logos dos times brasileiros:{' '}
          <a href={ENDERECO_DA_LIQUIPEDIA} target="_blank" rel="noreferrer">
            Liquipedia
          </a>{' '}
          (CC-BY-SA)
        </p>
      )}
    </div>
  );
}
