import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { cartoesDeNoticias, FILTROS_DE_NOTICIAS, lerFiltroDeNoticias, type CartaoDeNoticia } from '@/dominio/cartoes-de-noticias';
import { ultimasNoticias } from '@/dominio/noticias';
import { noticiasSteamDaTela } from '@/dominio/noticias-steam';
import { ENDERECO_DA_LIQUIPEDIA, tierSDaTela } from '@/dominio/tier-s';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const SELO: Record<CartaoDeNoticia['tipo'], string> = { clube: 'selo-modo ouro', cs2: 'selo-modo', times: 'selo-modo verde' };

/** Notícia do clube abre aqui no site; CS2 e times brasileiros abrem a fonte em outra aba. */
function Destino({ cartao, className, children }: { cartao: CartaoDeNoticia; className: string; children: React.ReactNode }) {
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

export default async function Noticias({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await exigirAcesso('/noticias');
  const filtro = lerFiltroDeNoticias((await searchParams).tipo);
  const bd = obterBd();
  const [clube, steam, tierS] = await Promise.all([ultimasNoticias(bd, 30), noticiasSteamDaTela(bd, 12), tierSDaTela(bd)]);
  const { destaque, cartoes } = cartoesDeNoticias({ clube, steam, jogos: tierS?.jogos ?? [] }, filtro);

  return (
    <>
      <div className="topo-jogar">
        <h1>Notícias</h1>
        <p className="apoio">O que está rolando no clube, no CS2 e nos times brasileiros.</p>
      </div>
      <nav className="filtros-jogar" aria-label="Tipo de notícia">
        {FILTROS_DE_NOTICIAS.map((item) => (
          <Link
            key={item.nome}
            className="filtro-jogar"
            href={item.valor ? `/noticias?tipo=${item.valor}` : '/noticias'}
            aria-current={filtro === item.valor ? 'page' : undefined}
          >
            {item.nome}
          </Link>
        ))}
      </nav>

      {destaque && (
        <Destino cartao={destaque} className="cartao-destaque grande noticia-topo">
          <Image src={destaque.imagem} alt="" width={1200} height={500} />
          <span className="selo-modo ouro">{clube[0]?.fixada ? 'Fixada · Do clube' : 'Do clube'}</span>
          <h2>{destaque.titulo}</h2>
          {destaque.resumo && <p>{destaque.resumo}</p>}
          {destaque.data && <small className="apoio">{dataCurta.format(destaque.data)}</small>}
        </Destino>
      )}

      {!destaque && cartoes.length === 0 && <p className="vazio">Nada por aqui ainda.</p>}
      {cartoes.length > 0 && (
        <div className="noticias-grade">
          {cartoes.map((cartao, indice) => (
            <Destino key={`${cartao.tipo}-${indice}-${cartao.titulo}`} cartao={cartao} className="noticia-cartao">
              <div className="noticia-foto">
                <Image src={cartao.imagem} alt="" width={480} height={270} />
                <span className={SELO[cartao.tipo]}>{cartao.etiqueta}</span>
              </div>
              <div className="noticia-corpo">
                {cartao.data && <small>{dataCurta.format(cartao.data)}</small>}
                <h3>{cartao.titulo}</h3>
                {cartao.resumo && <p>{cartao.resumo}</p>}
              </div>
            </Destino>
          ))}
        </div>
      )}
      {cartoes.some((cartao) => cartao.tipo === 'times') && (
        <p className="fonte">
          Jogos dos times brasileiros:{' '}
          <a href={ENDERECO_DA_LIQUIPEDIA} target="_blank" rel="noreferrer">
            Liquipedia
          </a>{' '}
          (CC-BY-SA)
        </p>
      )}
    </>
  );
}
