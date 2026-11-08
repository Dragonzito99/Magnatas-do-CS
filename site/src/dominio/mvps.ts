import { and, asc, count, desc, eq, gte, lt, ne, sql, sum } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { partidaJogadores, partidas, usuarios } from '@/bd/esquema';

// Brasília não tem horário de verão desde 2019: o dia de lá começa sempre às 3h UTC.
const BRASILIA_MS = -3 * 60 * 60_000;

/** O dia ou o mês de Brasília em que `agora` cai, como intervalo [inicio, fim) em UTC. */
export function periodoDeBrasilia(agora: Date, tipo: 'dia' | 'mes'): { inicio: Date; fim: Date } {
  const local = new Date(agora.getTime() + BRASILIA_MS);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate();
  const inicioLocal = tipo === 'dia' ? Date.UTC(ano, mes, dia) : Date.UTC(ano, mes, 1);
  const fimLocal = tipo === 'dia' ? Date.UTC(ano, mes, dia + 1) : Date.UTC(ano, mes + 1, 1);
  return { inicio: new Date(inicioLocal - BRASILIA_MS), fim: new Date(fimLocal - BRASILIA_MS) };
}

export type LinhaDeMvp = { id: string; apelido: string; avatarUrl: string | null; mvps: number; kills: number; partidas: number };

/** Quem somou mais estrelas de MVP nas partidas encerradas do período. Empate: mais kills, depois o apelido. */
export async function mvpsDoPeriodo(bd: Bd, periodo: { inicio: Date; fim: Date }, limite: number): Promise<LinhaDeMvp[]> {
  const estrelas = sql<number>`cast(${sum(partidaJogadores.mvps)} as integer)`;
  const abates = sql<number>`cast(${sum(partidaJogadores.kills)} as integer)`;
  return bd
    .select({
      id: usuarios.id,
      apelido: usuarios.apelido,
      avatarUrl: usuarios.avatarUrl,
      mvps: estrelas,
      kills: abates,
      partidas: count(partidas.id),
    })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(and(eq(partidas.estado, 'encerrada'), ne(partidas.tipo, 'teste'), gte(partidas.encerradaEm, periodo.inicio), lt(partidas.encerradaEm, periodo.fim)))
    .groupBy(usuarios.id, usuarios.apelido, usuarios.avatarUrl)
    .having(sql`${sum(partidaJogadores.mvps)} > 0`)
    .orderBy(desc(estrelas), desc(abates), asc(usuarios.apelido))
    .limit(limite);
}
