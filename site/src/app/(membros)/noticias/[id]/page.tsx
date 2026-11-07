import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { exigirAcesso } from '@/auth/guarda';
import { obterBd } from '@/bd/conexao';
import { noticiaPorId } from '@/dominio/noticias';

const dataLonga = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Só aceita imagem do próprio site, para a página nunca carregar nada de fora. */
function imagemDoSite(imagem: string | null): string | null {
  return imagem && imagem.startsWith('/') && !imagem.startsWith('//') ? imagem : null;
}

export default async function PaginaDaNoticia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirAcesso(`/noticias/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const noticia = await noticiaPorId(obterBd(), id);
  if (!noticia) notFound();
  const imagem = imagemDoSite(noticia.imagem);

  return (
    <article className="noticia-completa">
      <Link href="/inicio" className="botao-texto">
        ← Voltar
      </Link>
      <h1>{noticia.titulo}</h1>
      <span className="apoio">
        {noticia.autorApelido}, {dataLonga.format(noticia.criadoEm)}
        {noticia.atualizadaEm && ` (editada em ${dataLonga.format(noticia.atualizadaEm)})`}
      </span>
      {imagem && <Image className="noticia-imagem" src={imagem} alt="" width={960} height={540} />}
      {/* Texto puro: cada parágrafo vira um <p>, e o React escapa qualquer HTML que vier no texto. */}
      {noticia.texto.split(/\n\s*\n/).map((paragrafo, indice) => (
        <p key={indice}>{paragrafo}</p>
      ))}
    </article>
  );
}
