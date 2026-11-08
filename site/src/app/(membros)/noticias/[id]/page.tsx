import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { enderecoDoSite } from '@/auth/sessao-atual';
import { obterBd } from '@/bd/conexao';
import { blocosDaNoticia, maisNoticiasDoClube } from '@/dominio/cartoes-de-noticias';
import { noticiaPorId, ultimasNoticias } from '@/dominio/noticias';
import { BotaoCopiar } from '../../botao-copiar';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const diaEMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const FOTO_DE_RESERVA = '/mapas/egypt.webp';

/** Só aceita imagem do próprio site, para a página nunca carregar nada de fora. */
function imagemDoSite(imagem: string | null): string | null {
  return imagem && imagem.startsWith('/') && !imagem.startsWith('//') ? imagem : null;
}

/** A notícia aberta como no rascunho: capa com a foto, título grande, texto em coluna estreita e mais notícias embaixo. */
export default async function PaginaDaNoticia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirAcesso(`/noticias/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const bd = obterBd();
  const [noticia, recentes] = await Promise.all([noticiaPorId(bd, id), ultimasNoticias(bd, 4)]);
  if (!noticia) notFound();
  const foto = imagemDoSite(noticia.imagem) ?? FOTO_DE_RESERVA;
  const autor = noticia.autorApelido ?? 'Equipe Magnatas';
  const mais = maisNoticiasDoClube(
    recentes.map((recente) => ({ ...recente, imagem: imagemDoSite(recente.imagem) })),
    noticia.id,
  );

  return (
    <>
      <section className="noticia-capa" style={{ backgroundImage: `linear-gradient(180deg, rgba(7, 4, 13, 0.2), var(--pagina)), url(${foto})` }}>
        <div className="coluna-da-noticia">
          <Link className="voltar-noticias" href="/noticias">
            ← Notícias
          </Link>
          <span className="selo-modo ouro">{noticia.fixada ? 'Fixada · Do clube' : 'Do clube'}</span>
          <h1>{noticia.titulo}</h1>
          <p className="noticia-autor">
            <span className="mini-foto" aria-hidden="true">
              {autor.slice(0, 2).toUpperCase()}
            </span>
            {autor} · {dataCurta.format(noticia.criadoEm)}
            {noticia.atualizadaEm && <small> (editada em {dataCurta.format(noticia.atualizadaEm)})</small>}
          </p>
        </div>
      </section>

      <article className="coluna-da-noticia noticia-texto">
        {/* Texto puro: cada bloco vira um elemento, e o React escapa qualquer HTML que vier no texto. */}
        {blocosDaNoticia(noticia.texto).map((bloco, indice) =>
          bloco.tipo === 'subtitulo' ? (
            <h2 key={indice}>{bloco.texto}</h2>
          ) : (
            <p key={indice} className={bloco.tipo === 'linha-fina' ? 'linha-fina' : undefined}>
              {bloco.texto}
            </p>
          ),
        )}
        <div className="noticia-acoes">
          <Link className="botao ouro" href="/jogar">
            JOGAR AGORA
          </Link>
          <BotaoCopiar texto={`${enderecoDoSite()}/noticias/${noticia.id}`} rotulo="Copiar link" />
        </div>
      </article>

      {mais.length > 0 && (
        <section className="mais-noticias">
          <h2 className="secao-titulo">
            Mais <b>notícias</b>
          </h2>
          <div className="noticias-grade">
            {mais.map((cartao) => (
              <Link key={cartao.href} href={cartao.href} className="noticia-cartao">
                <div className="noticia-foto">
                  <Image src={cartao.imagem} alt="" width={480} height={270} />
                  <span className="selo-modo ouro">{cartao.etiqueta}</span>
                </div>
                <div className="noticia-corpo">
                  {cartao.data && <small>{diaEMes.format(cartao.data)}</small>}
                  <h3>{cartao.titulo}</h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
