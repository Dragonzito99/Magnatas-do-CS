import { and, count, desc, eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { elogios, partidaJogadores, partidas, type Usuario } from '@/bd/esquema';
import { exigirAtivo } from './disponibilidade';

/** Cada elogio aponta uma coisa boa do Magnata. Elogio não dá XP, para ninguém trocar elogio por pontos. */
export const TIPOS_DE_ELOGIO = [
  { valor: 'bom_de_mira', nome: 'Bom de mira' },
  { valor: 'gente_boa', nome: 'Gente boa' },
  { valor: 'lider', nome: 'Líder' },
  { valor: 'bom_de_equipe', nome: 'Bom de equipe' },
] as const;

export type TipoDeElogio = (typeof TIPOS_DE_ELOGIO)[number]['valor'];

export class ElogioIndisponivel extends Error {
  constructor() {
    super('Só quem jogou a partida elogia outro jogador dela, depois que ela termina.');
  }
}

export class ElogioRepetido extends Error {
  constructor() {
    super('Você já elogiou este jogador nesta partida.');
  }
}

function tipoValido(tipo: string): TipoDeElogio | null {
  return TIPOS_DE_ELOGIO.find((item) => item.valor === tipo)?.valor ?? null;
}

export async function elogiar(bd: Bd, autor: Pick<Usuario, 'id'>, dados: { partidaId: string; elogiadoId: string; tipo: string }): Promise<void> {
  const tipo = tipoValido(dados.tipo);
  if (!tipo || dados.elogiadoId === autor.id) throw new ElogioIndisponivel();
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, autor);
    const [partida] = await tx.select({ estado: partidas.estado }).from(partidas).where(eq(partidas.id, dados.partidaId));
    if (partida?.estado !== 'encerrada') throw new ElogioIndisponivel();
    const jogadores = await tx.select({ id: partidaJogadores.usuarioId }).from(partidaJogadores).where(eq(partidaJogadores.partidaId, dados.partidaId));
    const ids = jogadores.map((jogador) => jogador.id);
    if (!ids.includes(autor.id) || !ids.includes(dados.elogiadoId)) throw new ElogioIndisponivel();
    const [gravado] = await tx
      .insert(elogios)
      .values({ partidaId: dados.partidaId, autorId: autor.id, elogiadoId: dados.elogiadoId, tipo })
      .onConflictDoNothing()
      .returning();
    if (!gravado) throw new ElogioRepetido();
  });
}

/** Quem o autor já elogiou nesta partida, para a página não oferecer de novo. */
export async function elogiosFeitos(bd: Bd, partidaId: string, autorId: string): Promise<Set<string>> {
  const linhas = await bd
    .select({ elogiadoId: elogios.elogiadoId })
    .from(elogios)
    .where(and(eq(elogios.partidaId, partidaId), eq(elogios.autorId, autorId)));
  return new Set(linhas.map((linha) => linha.elogiadoId));
}

export async function elogiosDoJogador(bd: Bd, usuarioId: string): Promise<{ tipo: TipoDeElogio; nome: string; total: number }[]> {
  const linhas = await bd
    .select({ tipo: elogios.tipo, total: count() })
    .from(elogios)
    .where(eq(elogios.elogiadoId, usuarioId))
    .groupBy(elogios.tipo)
    .orderBy(desc(count()), elogios.tipo);
  return linhas.map((linha) => ({ tipo: linha.tipo, nome: TIPOS_DE_ELOGIO.find((item) => item.valor === linha.tipo)!.nome, total: linha.total }));
}
