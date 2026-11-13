import { desc, eq, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { noticias, usuarios, type Noticia, type Usuario } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { exigirPermissao } from './equipe';

export const LIMITES_DA_NOTICIA = { titulo: 120, texto: 5000 } as const;
/** Quem assina as notícias publicadas pelo script de patch de aviso. */
export const AUTOR_DA_EQUIPE = 'Equipe Magnatas';

export class NoticiaInvalida extends Error {
  constructor() {
    super(`A notícia precisa de título (até ${LIMITES_DA_NOTICIA.titulo} caracteres) e texto (até ${LIMITES_DA_NOTICIA.texto}), e a imagem tem de ser do próprio site.`);
  }
}

export type DadosDaNoticia = { titulo: string; texto: string; imagem?: string | null; fixada?: boolean };
export type NoticiaComAutor = Noticia & { autorApelido: string };

function validar(dados: DadosDaNoticia) {
  const titulo = dados.titulo.trim();
  const texto = dados.texto.trim();
  if (!titulo || titulo.length > LIMITES_DA_NOTICIA.titulo || !texto || texto.length > LIMITES_DA_NOTICIA.texto) throw new NoticiaInvalida();
  const imagem = dados.imagem?.trim() || null;
  // Só imagem do próprio site: a página nunca carrega nada de fora.
  if (imagem && !/^\/(?!\/)[\w\-./]+$/.test(imagem)) throw new NoticiaInvalida();
  return { titulo, texto, imagem, fixada: dados.fixada ?? false };
}

async function exigirAdm(tx: Bd | Transacao, ator: Pick<Usuario, 'id'>): Promise<void> {
  await exigirPermissao(tx, ator, 'publicar_noticia');
}

/** Arquivo da fila de notícias: a primeira linha é o título (o # do markdown sai) e o resto é o texto. */
export function noticiaDoArquivo(conteudo: string): DadosDaNoticia {
  const [primeira = '', ...resto] = conteudo.split(/\r?\n/);
  return { titulo: primeira.replace(/^#+\s*/, '').trim(), texto: resto.join('\n').trim() };
}

/** Sem ator, é o script de patch de aviso rodando no servidor: não há conta para conferir. */
export async function criarNoticia(bd: Bd, ator: Pick<Usuario, 'id'> | null, dados: DadosDaNoticia, agora: Date = new Date()): Promise<Noticia> {
  const valores = validar(dados);
  return bd.transaction(async (tx) => {
    if (ator) await exigirAdm(tx, ator);
    const [noticia] = await tx
      .insert(noticias)
      .values({ ...valores, autorId: ator?.id ?? null, criadoEm: agora })
      .returning();
    return noticia;
  });
}

export async function editarNoticia(bd: Bd, adm: Pick<Usuario, 'id'>, id: string, dados: DadosDaNoticia, agora: Date = new Date()): Promise<void> {
  const valores = validar(dados);
  await bd.transaction(async (tx) => {
    await exigirAdm(tx, adm);
    await tx.update(noticias).set({ ...valores, atualizadaEm: agora }).where(eq(noticias.id, id));
  });
}

export async function apagarNoticia(bd: Bd, adm: Pick<Usuario, 'id'>, id: string): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAdm(tx, adm);
    await tx.delete(noticias).where(eq(noticias.id, id));
  });
}

const comAutor = {
  noticia: noticias,
  autorApelido: sql<string>`coalesce(${usuarios.apelido}, ${AUTOR_DA_EQUIPE})`,
};

export async function ultimasNoticias(bd: Bd, limite: number = 5): Promise<NoticiaComAutor[]> {
  const linhas = await bd
    .select(comAutor)
    .from(noticias)
    .leftJoin(usuarios, eq(noticias.autorId, usuarios.id))
    .orderBy(desc(noticias.fixada), desc(noticias.criadoEm))
    .limit(limite);
  return linhas.map((linha) => ({ ...linha.noticia, autorApelido: linha.autorApelido }));
}

export async function noticiaPorId(bd: Bd, id: string): Promise<NoticiaComAutor | null> {
  const [linha] = await bd.select(comAutor).from(noticias).leftJoin(usuarios, eq(noticias.autorId, usuarios.id)).where(eq(noticias.id, id));
  return linha ? { ...linha.noticia, autorApelido: linha.autorApelido } : null;
}
