import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Bd } from '@/bd/conexao';
import { cacheExterno, noticiasSteam } from '@/bd/esquema';

/** Só o canal oficial da Valve para o CS2 (app 730), sem os sites de fora que a Steam mistura. */
export const URL_DAS_NOTICIAS_STEAM =
  'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=10&maxlength=0&feeds=steam_community_announcements&format=json';
const INTERVALO_DA_BUSCA_MS = 30 * 60_000;
const MAXIMO_DE_TENTATIVAS = 3;
const TAMANHO_DO_CONTEUDO = 4000;
const CHAVE_DA_ULTIMA_BUSCA = 'steam:ultima-busca';

export type Traduzir = (entrada: { titulo: string; conteudo: string }) => Promise<{ titulo: string; resumo: string } | null>;

const RespostaDaSteam = z.object({
  appnews: z.object({
    newsitems: z.array(z.object({ gid: z.string(), title: z.string(), url: z.string(), contents: z.string(), date: z.number() })),
  }),
});

/** A Steam escreve as notas com marcações próprias ([p], [list]...) e às vezes HTML: aqui sobra só o texto. */
export function limparConteudo(bruto: string): string {
  return bruto
    .replace(/\\\[/g, '\u0000')
    .replace(/\[\/?[a-z*][^\]]*\]/gi, ' ')
    .replace(/\u0000/g, '[')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
    .slice(0, TAMANHO_DO_CONTEUDO);
}

async function buscaRecente(bd: Bd, agora: Date): Promise<boolean> {
  const [linha] = await bd.select().from(cacheExterno).where(eq(cacheExterno.chave, CHAVE_DA_ULTIMA_BUSCA));
  return !!linha && agora.getTime() - linha.atualizadoEm.getTime() < INTERVALO_DA_BUSCA_MS;
}

async function marcarBusca(bd: Bd, agora: Date): Promise<void> {
  await bd
    .insert(cacheExterno)
    .values({ chave: CHAVE_DA_ULTIMA_BUSCA, dados: {}, atualizadoEm: agora })
    .onConflictDoUpdate({ target: cacheExterno.chave, set: { atualizadoEm: agora } });
}

/** Roda no servidor de tempos em tempos. Nunca lança: uma falha só fica para a próxima vez. */
export async function atualizarNoticiasSteam(bd: Bd, buscar: (url: string) => Promise<unknown>, traduzir: Traduzir | null, agora: Date = new Date()): Promise<void> {
  if (!(await buscaRecente(bd, agora))) {
    try {
      const lido = RespostaDaSteam.safeParse(await buscar(URL_DAS_NOTICIAS_STEAM));
      if (lido.success) {
        const itens = lido.data.appnews.newsitems.map((item) => ({
          gid: item.gid,
          tituloOriginal: item.title,
          url: item.url,
          publicadaEm: new Date(item.date * 1000),
          conteudo: limparConteudo(item.contents),
        }));
        if (itens.length > 0) await bd.insert(noticiasSteam).values(itens).onConflictDoNothing();
      } else {
        console.warn('A Steam respondeu num formato inesperado.');
      }
      await marcarBusca(bd, agora);
    } catch (erro) {
      console.warn('Falha ao buscar as notícias da Steam:', erro);
    }
  }
  if (traduzir) await traduzirPendentes(bd, traduzir, agora);
}

async function traduzirPendentes(bd: Bd, traduzir: Traduzir, agora: Date): Promise<void> {
  const pendentes = await bd
    .select()
    .from(noticiasSteam)
    .where(and(isNull(noticiasSteam.traduzidaEm), lt(noticiasSteam.tentativas, MAXIMO_DE_TENTATIVAS)))
    .orderBy(desc(noticiasSteam.publicadaEm))
    .limit(10);
  for (const noticia of pendentes) {
    let traducao: Awaited<ReturnType<Traduzir>> = null;
    try {
      traducao = await traduzir({ titulo: noticia.tituloOriginal, conteudo: noticia.conteudo });
    } catch (erro) {
      console.warn('Falha ao traduzir uma notícia da Steam:', erro);
    }
    if (traducao) {
      await bd
        .update(noticiasSteam)
        .set({ tituloPt: traducao.titulo, resumoPt: traducao.resumo, traduzidaEm: agora })
        .where(eq(noticiasSteam.gid, noticia.gid));
    } else {
      await bd
        .update(noticiasSteam)
        .set({ tentativas: noticia.tentativas + 1 })
        .where(eq(noticiasSteam.gid, noticia.gid));
    }
  }
}

export type NoticiaSteamDaTela = { gid: string; titulo: string; resumo: string | null; url: string; publicadaEm: Date };

/** Traduzida quando der; senão, o título original em inglês. */
export async function noticiasSteamDaTela(bd: Bd, limite: number = 4): Promise<NoticiaSteamDaTela[]> {
  const linhas = await bd.select().from(noticiasSteam).orderBy(desc(noticiasSteam.publicadaEm)).limit(limite);
  return linhas.map((linha) => ({
    gid: linha.gid,
    titulo: linha.tituloPt ?? linha.tituloOriginal,
    resumo: linha.resumoPt,
    url: linha.url,
    publicadaEm: linha.publicadaEm,
  }));
}
