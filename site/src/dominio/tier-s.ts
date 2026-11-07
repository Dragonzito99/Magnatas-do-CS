import { eq } from 'drizzle-orm';
import { parse, type HTMLElement } from 'node-html-parser';
import { z } from 'zod';
import type { Bd } from '@/bd/conexao';
import { cacheExterno } from '@/bd/esquema';

/** Times brasileiros acompanhados no quadro Tier S. Para mudar, é só trocar esta lista numa atualização. */
export const TIMES_BRASILEIROS = ['FURIA', 'MIBR', 'paiN', 'Imperial', 'Legacy', 'Fluxo', 'RED Canids', 'ODDIK'] as const;
export const ENDERECO_DA_LIQUIPEDIA = 'https://liquipedia.net';
const CHAVE_DO_CACHE = 'tier-s';
const INTERVALO_MS = 10 * 60_000;
const DIAS_PARA_O_PROXIMO = 7;

export type TorneioSTier = { nome: string; pagina: string; inicio: string; fim: string; premiacao: string | null; situacao: 'andamento' | 'em_breve' };
export type Jogo = { pagina: string; torneio: string; time1: string; time2: string; placar: string | null; quando: Date | null };
export type TierS = { torneios: TorneioSTier[]; jogos: Jogo[]; atualizadoEm: Date };

const MESES: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const doisDigitos = (n: number) => String(n).padStart(2, '0');
const dia = (ano: number, mes: number, d: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(d)}`;

/**
 * As datas da Liquipedia vêm assim: "Nov 02–08, 2026", "Nov 24 – Dec 13, 2026",
 * "Dec 30, 2026 – Jan 05, 2027" ou "Nov 08, 2026". Qualquer outra coisa ("Postponed", "TBA") é null.
 */
export function lerDatas(texto: string): { inicio: string; fim: string } | null {
  const limpo = texto.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
  let m = limpo.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) - ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (m && MESES[m[1]] && MESES[m[4]]) return { inicio: dia(+m[3], MESES[m[1]], +m[2]), fim: dia(+m[6], MESES[m[4]], +m[5]) };
  m = limpo.match(/^([A-Z][a-z]{2}) (\d{1,2}) ?- ?([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (m && MESES[m[1]] && MESES[m[3]]) return { inicio: dia(+m[5], MESES[m[1]], +m[2]), fim: dia(+m[5], MESES[m[3]], +m[4]) };
  m = limpo.match(/^([A-Z][a-z]{2}) (\d{1,2}) ?- ?(\d{1,2}), (\d{4})$/);
  if (m && MESES[m[1]]) return { inicio: dia(+m[4], MESES[m[1]], +m[2]), fim: dia(+m[4], MESES[m[1]], +m[3]) };
  m = limpo.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (m && MESES[m[1]]) return { inicio: dia(+m[3], MESES[m[1]], +m[2]), fim: dia(+m[3], MESES[m[1]], +m[2]) };
  return null;
}

// O dia de hoje no horário de Brasília, para comparar com as datas da tabela.
const hojeEmBrasilia = (agora: Date) => new Date(agora.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
const somarDias = (diaIso: string, dias: number) => new Date(Date.parse(`${diaIso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
const paginaSemAncora = (href: string | undefined) => (href ?? '').split('#')[0];

/** Torneios Tier S em andamento e os que começam nos próximos 7 dias, em andamento primeiro. */
export function lerTorneiosSTier(html: string, agora: Date): TorneioSTier[] {
  const hoje = hojeEmBrasilia(agora);
  const limite = somarDias(hoje, DIAS_PARA_O_PROXIMO);
  const vistos = new Set<string>();
  const torneios: TorneioSTier[] = [];
  for (const linha of parse(html).querySelectorAll('.tournaments-listing tr')) {
    const celulas = linha.querySelectorAll('td');
    if (celulas.length < 5) continue;
    const link = celulas[2].querySelector('a');
    const datas = lerDatas(celulas[3].text);
    const pagina = paginaSemAncora(link?.getAttribute('href'));
    if (!link || !datas || !pagina || vistos.has(pagina)) continue;
    if (datas.fim < hoje || datas.inicio > limite) continue;
    vistos.add(pagina);
    const premiacao = celulas[4].text.trim();
    torneios.push({
      nome: link.text.trim(),
      pagina,
      ...datas,
      premiacao: premiacao || null,
      situacao: datas.inicio <= hoje ? 'andamento' : 'em_breve',
    });
  }
  return torneios.sort((a, b) => (a.situacao === b.situacao ? a.inicio.localeCompare(b.inicio) : a.situacao === 'andamento' ? -1 : 1));
}

function lerPlacar(bloco: HTMLElement): string | null {
  const texto = bloco.querySelector('.match-info-header-scoreholder-upper')?.text.replace(/\s+/g, '') ?? '';
  return /^(\d+|FF|W|L|-):(\d+|FF|W|L|-)$/.test(texto) ? texto : null;
}

export function lerJogos(html: string): Jogo[] {
  const jogos: Jogo[] = [];
  for (const bloco of parse(html).querySelectorAll('.match-info')) {
    const nomes = bloco.querySelectorAll('.match-info-header-opponent .name').map((nome) => nome.text.trim());
    const link = bloco.querySelector('.match-info-tournament a');
    const pagina = paginaSemAncora(link?.getAttribute('href'));
    if (nomes.length !== 2 || !pagina) continue;
    const instante = Number(bloco.querySelector('.timer-object')?.getAttribute('data-timestamp'));
    jogos.push({
      pagina,
      torneio: bloco.querySelector('.match-info-tournament-name')?.text.trim() || link?.getAttribute('title')?.split('#')[0] || pagina,
      time1: nomes[0],
      time2: nomes[1],
      placar: lerPlacar(bloco),
      quando: Number.isFinite(instante) && instante > 0 ? new Date(instante * 1000) : null,
    });
  }
  return jogos;
}

const ehBrasileiro = (time: string) => (TIMES_BRASILEIROS as readonly string[]).includes(time);
const doTorneio = (pagina: string, torneio: TorneioSTier) => pagina === torneio.pagina || pagina.startsWith(`${torneio.pagina}/`);

export function jogosBrasileiros(jogos: Jogo[], torneios: TorneioSTier[]): Jogo[] {
  return jogos.filter((jogo) => (ehBrasileiro(jogo.time1) || ehBrasileiro(jogo.time2)) && torneios.some((torneio) => doTorneio(jogo.pagina, torneio)));
}

const RespostaDoParse = z.object({ parse: z.object({ text: z.string() }) });

/** Roda no servidor de tempos em tempos. Nunca lança; em falha, o último dado bom continua na tela. */
export async function atualizarTierS(bd: Bd, pedir: (parametros: Record<string, string>) => Promise<unknown>, agora: Date = new Date()): Promise<void> {
  const [guardado] = await bd.select().from(cacheExterno).where(eq(cacheExterno.chave, CHAVE_DO_CACHE));
  if (guardado && agora.getTime() - guardado.atualizadoEm.getTime() < INTERVALO_MS) return;
  try {
    const pagina = (page: string) => pedir({ action: 'parse', page, prop: 'text', format: 'json', formatversion: '2' });
    const torneiosLidos = RespostaDoParse.safeParse(await pagina('S-Tier_Tournaments'));
    if (!torneiosLidos.success) throw new Error('A Liquipedia respondeu sem a página de torneios.');
    const jogosLidos = RespostaDoParse.safeParse(await pagina('Liquipedia:Matches'));
    if (!jogosLidos.success) throw new Error('A Liquipedia respondeu sem a página de jogos.');
    const torneios = lerTorneiosSTier(torneiosLidos.data.parse.text, agora);
    const jogos = jogosBrasileiros(lerJogos(jogosLidos.data.parse.text), torneios);
    const dados = { torneios, jogos: jogos.map((jogo) => ({ ...jogo, quando: jogo.quando?.toISOString() ?? null })) };
    await bd
      .insert(cacheExterno)
      .values({ chave: CHAVE_DO_CACHE, dados, atualizadoEm: agora })
      .onConflictDoUpdate({ target: cacheExterno.chave, set: { dados, atualizadoEm: agora } });
  } catch (erro) {
    console.warn('Falha ao atualizar o Tier S pela Liquipedia:', erro);
  }
}

const Guardado = z.object({
  torneios: z.array(
    z.object({ nome: z.string(), pagina: z.string(), inicio: z.string(), fim: z.string(), premiacao: z.string().nullable(), situacao: z.enum(['andamento', 'em_breve']) }),
  ),
  jogos: z.array(
    z.object({ pagina: z.string(), torneio: z.string(), time1: z.string(), time2: z.string(), placar: z.string().nullable(), quando: z.string().nullable() }),
  ),
});

export async function tierSDaTela(bd: Bd): Promise<TierS | null> {
  const [guardado] = await bd.select().from(cacheExterno).where(eq(cacheExterno.chave, CHAVE_DO_CACHE));
  const lido = Guardado.safeParse(guardado?.dados);
  if (!guardado || !lido.success) return null;
  return {
    torneios: lido.data.torneios,
    jogos: lido.data.jogos.map((jogo) => ({ ...jogo, quando: jogo.quando ? new Date(jogo.quando) : null })),
    atualizadoEm: guardado.atualizadoEm,
  };
}
