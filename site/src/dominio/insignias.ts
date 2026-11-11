import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, servidoresDiversao, xpPartidas } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';

/**
 * Insígnias (dono, 11/11/2026), no jeito das Badges do CrossFire e com desenho nosso: 6 famílias com 5 níveis cada,
 * contadas com o que o site já guarda das partidas. Cada uma conquistada dá prêmio. Desenho e regras em
 * docs/superpowers/specs/2026-11-11-insignias-e-perfil-novo-design.md.
 */

export type Familia = 'mira' | 'ace' | 'estrela' | 'vencedor' | 'mutacao' | 'veterano';
type Metas = readonly [number, number, number, number, number];

export const FAMILIAS: readonly { chave: Familia; nome: string; conta: string; metas: Metas }[] = [
  { chave: 'mira', nome: 'Mira', conta: 'headshots', metas: [50, 250, 1000, 3000, 10000] },
  { chave: 'ace', nome: 'Ace', conta: 'rodadas de 5 abates', metas: [1, 5, 20, 50, 100] },
  { chave: 'estrela', nome: 'Estrela', conta: 'MVPs', metas: [10, 50, 200, 500, 1000] },
  { chave: 'vencedor', nome: 'Vencedor', conta: 'vitórias no competitivo e no mix', metas: [5, 25, 100, 300, 1000] },
  { chave: 'mutacao', nome: 'Mutação', conta: 'partidas ganhas na Mutação', metas: [5, 25, 100, 300, 1000] },
  { chave: 'veterano', nome: 'Veterano', conta: 'partidas jogadas', metas: [10, 50, 200, 500, 1500] },
];

export const NOMES_DOS_NIVEIS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Lendária'] as const;

/** Prêmio de cada nível. mutanteDias: undefined = sem mutante, null = mutante para sempre. */
export const PREMIOS: readonly { grana: number; xp: number; mutanteDias: number | null | undefined }[] = [
  { grana: 50, xp: 200, mutanteDias: undefined },
  { grana: 100, xp: 500, mutanteDias: 1 },
  { grana: 200, xp: 1000, mutanteDias: 3 },
  { grana: 400, xp: 2000, mutanteDias: 5 },
  { grana: 800, xp: 5000, mutanteDias: null },
];

/** Na Lendária, quem já tem todos os mutantes para sempre ganha esta Grana a mais no lugar do mutante. */
export const GRANA_NO_LUGAR_DO_MUTANTE = 1000;

export type Contagem = Record<Familia, number>;
export type ChaveDaInsignia = { familia: Familia; nivel: number };

/** Todos os níveis cuja meta a conta já atingiu, de todas as famílias. */
export function niveisAlcancados(contagem: Contagem): ChaveDaInsignia[] {
  return FAMILIAS.flatMap((familia) =>
    familia.metas.flatMap((meta, nivel) => (contagem[familia.chave] >= meta ? [{ familia: familia.chave, nivel }] : [])),
  );
}

export function nomeDaInsignia(familia: Familia, nivel: number): string {
  const nome = FAMILIAS.find((item) => item.chave === familia)?.nome ?? familia;
  return `${nome} ${NOMES_DOS_NIVEIS[nivel] ?? ''}`.trim();
}

/** "estrela:2" → { familia: 'estrela', nivel: 2 }. Qualquer outra coisa é null. */
export function lerChaveDaInsignia(chave: string | null): ChaveDaInsignia | null {
  if (!chave) return null;
  const [familia, nivelEmTexto] = chave.split(':');
  const nivel = Number(nivelEmTexto);
  if (!FAMILIAS.some((item) => item.chave === familia)) return null;
  if (!Number.isInteger(nivel) || nivel < 0 || nivel >= NOMES_DOS_NIVEIS.length) return null;
  return { familia: familia as Familia, nivel };
}

const zerada = (): Contagem => ({ mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 });

/**
 * O que cada conta já fez, para as metas. Conta só partida que valeu XP (tem linha em xp_partidas): teste e treino
 * ficam de fora. Competitivo e mix vêm de partida_jogadores; a Mutação é a Diversão cuja porta é de um servidor da
 * Mutação (a referência é "diversao:<porta>:<partida>").
 */
export async function contarFamilias(bd: Bd | Transacao, usuarioIds: string[]): Promise<Map<string, Contagem>> {
  const contagens = new Map(usuarioIds.map((id) => [id, zerada()]));
  if (usuarioIds.length === 0) return contagens;

  const competitivo = await bd
    .select({
      usuarioId: xpPartidas.usuarioId,
      mira: sql<number>`coalesce(sum(${partidaJogadores.headshotKills}), 0)::int`,
      ace: sql<number>`coalesce(sum(${partidaJogadores.k5}), 0)::int`,
      estrela: sql<number>`coalesce(sum(${partidaJogadores.mvps}), 0)::int`,
      vencedor: sql<number>`count(*) filter (where ${xpPartidas.resultado} = 'vitoria')::int`,
    })
    .from(xpPartidas)
    .innerJoin(partidaJogadores, and(eq(partidaJogadores.usuarioId, xpPartidas.usuarioId), sql`${partidaJogadores.partidaId}::text = ${xpPartidas.referencia}`))
    .where(and(inArray(xpPartidas.usuarioId, usuarioIds), eq(xpPartidas.origem, 'partida')))
    .groupBy(xpPartidas.usuarioId);
  for (const linha of competitivo) Object.assign(contagens.get(linha.usuarioId)!, { mira: linha.mira, ace: linha.ace, estrela: linha.estrela, vencedor: linha.vencedor });

  const portasDaMutacao = (await bd.select({ porta: servidoresDiversao.porta }).from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'mutacao'))).map(
    (servidor) => String(servidor.porta),
  );
  const todas = await bd
    .select({
      usuarioId: xpPartidas.usuarioId,
      veterano: sql<number>`count(*)::int`,
      mutacao:
        portasDaMutacao.length === 0
          ? sql<number>`0`
          : sql<number>`count(*) filter (where ${xpPartidas.origem} = 'diversao' and ${xpPartidas.resultado} = 'vitoria' and split_part(${xpPartidas.referencia}, ':', 2) in (${sql.join(
              portasDaMutacao.map((porta) => sql`${porta}`),
              sql`, `,
            )}))::int`,
    })
    .from(xpPartidas)
    .where(inArray(xpPartidas.usuarioId, usuarioIds))
    .groupBy(xpPartidas.usuarioId);
  for (const linha of todas) Object.assign(contagens.get(linha.usuarioId)!, { veterano: linha.veterano, mutacao: Number(linha.mutacao) });

  return contagens;
}
