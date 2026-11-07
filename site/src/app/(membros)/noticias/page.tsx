import Image from 'next/image';
import Link from 'next/link';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { ultimasNoticias } from '@/dominio/noticias';
import { noticiasSteamDaTela } from '@/dominio/noticias-steam';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
// Notícia sem foto ganha a de um mapa, para o cartão nunca ficar vazio.
const FOTOS_DE_RESERVA = ['/mapas/egypt.webp', '/mapas/mirage.webp', '/mapas/laboratory.webp', '/mapas/dust2.webp', '/mapas/biochemical-hotel.webp'];

function chamada(texto: string): string {
  const primeiro = texto.split(/\n\s*\n/)[0];
  return primeiro.length > 160 ? `${primeiro.slice(0, 157)}...` : primeiro;
}

export default async function Noticias() {
  await exigirAcesso('/noticias');
  const bd = obterBd();
  const [noticias, steam] = await Promise.all([ultimasNoticias(bd, 30), noticiasSteamDaTela(bd, 6)]);
  const [destaque, ...resto] = noticias;

  return (
    <>
      <div className="topo-jogar">
        <h1>Notícias</h1>
        <p className="apoio">O que está rolando no clube e no CS2.</p>
      </div>
      {!destaque && <p className="vazio">Nenhuma notícia do clube ainda.</p>}
      {destaque && (
        <Link href={`/noticias/${destaque.id}`} className="cartao-destaque grande noticia-topo">
          <Image src={destaque.imagem ?? FOTOS_DE_RESERVA[0]} alt="" width={1200} height={500} />
          <span className="selo-modo ouro">{destaque.fixada ? 'Fixada · Do clube' : 'Do clube'}</span>
          <h2>{destaque.titulo}</h2>
          <p>{chamada(destaque.texto)}</p>
          <small className="apoio">
            {destaque.autorApelido} · {dataCurta.format(destaque.criadoEm)}
          </small>
        </Link>
      )}
      {resto.length > 0 && (
        <div className="noticias-grade">
          {resto.map((noticia, indice) => (
            <Link key={noticia.id} href={`/noticias/${noticia.id}`} className="noticia-cartao">
              <div className="noticia-foto">
                <Image src={noticia.imagem ?? FOTOS_DE_RESERVA[(indice + 1) % FOTOS_DE_RESERVA.length]} alt="" width={480} height={270} />
                <span className="selo-modo ouro">Do clube</span>
              </div>
              <div className="noticia-corpo">
                <small>{dataCurta.format(noticia.criadoEm)}</small>
                <h3>{noticia.titulo}</h3>
                <p>{chamada(noticia.texto)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      {steam.length > 0 && (
        <section className="painel">
          <div className="cabeca-painel">
            <h2>CS2 oficial</h2>
            <span>Steam</span>
          </div>
          {steam.map((noticia) => (
            <a className="noticia-da-lista" href={noticia.url} target="_blank" rel="noreferrer" key={noticia.gid}>
              <small>{dataCurta.format(noticia.publicadaEm)}</small>
              <b>{noticia.titulo}</b>
              {noticia.resumo && <span className="apoio">{noticia.resumo}</span>}
            </a>
          ))}
        </section>
      )}
    </>
  );
}
