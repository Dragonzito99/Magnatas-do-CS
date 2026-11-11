import { ENDERECO_DA_LIQUIPEDIA } from './tier-s';

export type FiltroDeNoticias = 'clube' | 'cs2' | 'times';

export const FILTROS_DE_NOTICIAS: { valor: FiltroDeNoticias | null; nome: string }[] = [
  { valor: null, nome: 'Todas' },
  { valor: 'clube', nome: 'Do clube' },
  { valor: 'cs2', nome: 'CS2 oficial' },
  { valor: 'times', nome: 'Times brasileiros' },
];

export function lerFiltroDeNoticias(texto: string | undefined): FiltroDeNoticias | null {
  return FILTROS_DE_NOTICIAS.find((filtro) => filtro.valor !== null && filtro.valor === texto)?.valor ?? null;
}

export type TimeNoConfronto = { nome: string; logo: string | null };
export type Confronto = { time1: TimeNoConfronto; time2: TimeNoConfronto; placar: string | null };

export type CartaoDeNoticia = {
  tipo: FiltroDeNoticias;
  etiqueta: string;
  titulo: string;
  resumo: string | null;
  imagem: string;
  href: string;
  externo: boolean;
  data: Date | null;
  /** Só nos jogos de times BR: os dois times, com a logo de quem é brasileiro, e o placar. */
  confronto?: Confronto;
};

/** As logos dos times brasileiros acompanhados, baixadas da Liquipedia (dono, 11/11/2026). */
const LOGO_DO_TIME: Record<string, string> = {
  FURIA: '/times/furia.png',
  MIBR: '/times/mibr.png',
  paiN: '/times/pain.png',
  Imperial: '/times/imperial.png',
  Legacy: '/times/legacy.png',
  Fluxo: '/times/fluxo.png',
  'RED Canids': '/times/red-canids.png',
  ODDIK: '/times/oddik.png',
};

const time = (nome: string): TimeNoConfronto => ({ nome, logo: LOGO_DO_TIME[nome] ?? null });
const confrontoDe = (jogo: JogoBr): Confronto => ({ time1: time(jogo.time1), time2: time(jogo.time2), placar: jogo.placar });

export type LinhaDaAgenda = Confronto & { torneio: string; quando: Date; terminou: boolean; href: string };

/** A agenda dos times BR ao lado do destaque: os próximos jogos (do mais perto ao mais longe) e depois os resultados. */
export function agendaDosTimes(jogos: JogoBr[], agora: Date = new Date(), limite = 5): LinhaDaAgenda[] {
  const comData = jogos.filter((jogo): jogo is JogoBr & { quando: Date } => jogo.quando !== null);
  const proximos = comData.filter((jogo) => !jogo.placar && jogo.quando.getTime() >= agora.getTime()).sort((a, b) => a.quando.getTime() - b.quando.getTime());
  // Jogo que já passou entra nos resultados mesmo sem placar (a Liquipedia às vezes demora para pôr).
  const resultados = comData.filter((jogo) => jogo.placar || jogo.quando.getTime() < agora.getTime()).sort((a, b) => b.quando.getTime() - a.quando.getTime());
  return [...proximos, ...resultados].slice(0, limite).map((jogo) => ({
    ...confrontoDe(jogo),
    torneio: jogo.torneio,
    quando: jogo.quando,
    terminou: jogo.placar !== null || jogo.quando.getTime() < agora.getTime(),
    href: `${ENDERECO_DA_LIQUIPEDIA}${jogo.pagina}`,
  }));
}

type DoClube = { id: string; titulo: string; texto: string; imagem: string | null; fixada: boolean; criadoEm: Date };
type DaSteam = { gid: string; titulo: string; resumo: string | null; url: string; publicadaEm: Date };
type JogoBr = { pagina: string; torneio: string; time1: string; time2: string; placar: string | null; quando: Date | null };

// Sem foto própria, cada notícia ganha a de um mapa, para o cartão nunca ficar vazio.
const FOTOS_DO_CLUBE = ['/mapas/egypt.webp', '/mapas/laboratory.webp', '/mapas/biochemical-hotel.webp', '/mapas/silent-village.webp'];
const FOTOS_DO_CS2 = ['/mapas/mirage.webp', '/mapas/dust2.webp'];
const FOTOS_DOS_TIMES = ['/mapas/transport-ship.webp', '/mapas/luxville.webp'];

function chamada(texto: string): string {
  const primeiro = texto.split(/\n\s*\n/)[0];
  return primeiro.length > 160 ? `${primeiro.slice(0, 157)}...` : primeiro;
}

function doClube(noticia: DoClube, indice: number): CartaoDeNoticia {
  return {
    tipo: 'clube',
    etiqueta: 'Do clube',
    titulo: noticia.titulo,
    resumo: chamada(noticia.texto),
    imagem: noticia.imagem ?? FOTOS_DO_CLUBE[indice % FOTOS_DO_CLUBE.length],
    href: `/noticias/${noticia.id}`,
    externo: false,
    data: noticia.criadoEm,
  };
}

/** Clube, CS2 e times brasileiros numa lista só, como no rascunho: a primeira do clube vira o destaque. */
export function cartoesDeNoticias(
  fontes: { clube: DoClube[]; steam: DaSteam[]; jogos: JogoBr[] },
  filtro: FiltroDeNoticias | null,
): { destaque: CartaoDeNoticia | null; cartoes: CartaoDeNoticia[] } {
  const comDestaque = filtro === null || filtro === 'clube';
  const [primeira, ...outras] = fontes.clube;
  const destaque = comDestaque && primeira ? doClube(primeira, 0) : null;
  const cartoes: CartaoDeNoticia[] = [];
  if (filtro === null || filtro === 'clube') cartoes.push(...outras.map((noticia, indice) => doClube(noticia, indice + 1)));
  if (filtro === null || filtro === 'cs2') {
    cartoes.push(
      ...fontes.steam.map((noticia, indice) => ({
        tipo: 'cs2' as const,
        etiqueta: 'CS2 oficial',
        titulo: noticia.titulo,
        resumo: noticia.resumo,
        imagem: FOTOS_DO_CS2[indice % FOTOS_DO_CS2.length],
        href: noticia.url,
        externo: true,
        data: noticia.publicadaEm,
      })),
    );
  }
  if (filtro === null || filtro === 'times') {
    cartoes.push(
      ...fontes.jogos.map((jogo, indice) => ({
        tipo: 'times' as const,
        etiqueta: 'Times BR',
        titulo: `${jogo.time1} x ${jogo.time2}`,
        resumo: jogo.placar ? `${jogo.torneio} · ${jogo.placar}` : jogo.torneio,
        imagem: FOTOS_DOS_TIMES[indice % FOTOS_DOS_TIMES.length],
        href: `${ENDERECO_DA_LIQUIPEDIA}${jogo.pagina}`,
        externo: true,
        data: jogo.quando,
        confronto: confrontoDe(jogo),
      })),
    );
  }
  cartoes.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
  return { destaque, cartoes };
}

export type BlocoDaNoticia = { tipo: 'linha-fina' | 'paragrafo' | 'subtitulo'; texto: string };

/**
 * O texto puro da notícia em blocos para a página: o primeiro parágrafo vira a linha fina, em destaque,
 * e o parágrafo que começa com "## " vira subtítulo. Nada de HTML: o React escapa o texto.
 */
export function blocosDaNoticia(texto: string): BlocoDaNoticia[] {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean);
  return paragrafos.map((paragrafo, indice) => {
    if (paragrafo.startsWith('## ')) return { tipo: 'subtitulo', texto: paragrafo.slice(3).trim() };
    return { tipo: indice === 0 ? 'linha-fina' : 'paragrafo', texto: paragrafo };
  });
}

/** Os cartões de "Mais notícias" embaixo de uma notícia aberta: as outras do clube, até três. */
export function maisNoticiasDoClube(noticias: DoClube[], idAtual: string, limite: number = 3): CartaoDeNoticia[] {
  return noticias
    .filter((noticia) => noticia.id !== idAtual)
    .slice(0, limite)
    .map(doClube);
}
