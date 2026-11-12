import { and, eq, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { presentes, type Usuario } from '@/bd/esquema';
import { CATALOGO, type ItemDaLoja } from './loja';
import { darAte } from './membros';

/**
 * O presente de boas-vindas do Premium (dono, 12/11/2026). Substitui os "itens de lançamento para sempre": a pessoa
 * escolhe um mutante para sempre, e os outros vêm por 10 dias, com alguns itens da loja por 25 dias.
 */
const DIA_MS = 24 * 60 * 60 * 1000;
export const DIAS_DOS_OUTROS_MUTANTES = 10;
export const DIAS_DOS_ITENS = 25;
export const ITENS_DO_PRESENTE = ['aviso-entrada', 'moldura-fogo', 'etiqueta-magnata'] as const;

/** Todo mutante da loja entra na escolha, inclusive os que forem lançados depois. */
export const MUTANTES_DO_PRESENTE: readonly ItemDaLoja[] = CATALOGO.filter((item) => item.tipo === 'mutante');

export class PresenteIndisponivel extends Error {}
export class EscolhaInvalida extends Error {}

export async function presenteFechado(bd: Bd, usuarioId: string): Promise<{ id: string; criadoEm: Date } | null> {
  const [presente] = await bd
    .select({ id: presentes.id, criadoEm: presentes.criadoEm })
    .from(presentes)
    .where(and(eq(presentes.usuarioId, usuarioId), isNull(presentes.abertoEm)));
  return presente ?? null;
}

export type PresenteAberto = { mutante: ItemDaLoja; outros: ItemDaLoja[]; itens: ItemDaLoja[] };

/** Abre o presente uma vez só. O que a pessoa já tinha para sempre continua para sempre. */
export async function abrirPresente(bd: Bd, usuario: Pick<Usuario, 'id'>, mutanteId: string, agora: Date = new Date()): Promise<PresenteAberto> {
  const mutante = MUTANTES_DO_PRESENTE.find((item) => item.id === mutanteId);
  if (!mutante) throw new EscolhaInvalida();
  return bd.transaction(async (tx) => {
    const [presente] = await tx
      .select()
      .from(presentes)
      .where(and(eq(presentes.usuarioId, usuario.id), isNull(presentes.abertoEm)))
      .for('update');
    if (!presente) throw new PresenteIndisponivel();
    const outros = MUTANTES_DO_PRESENTE.filter((item) => item.id !== mutante.id);
    const itens = CATALOGO.filter((item) => (ITENS_DO_PRESENTE as readonly string[]).includes(item.id));
    await darAte(tx, usuario.id, mutante.id, null, agora);
    for (const item of outros) await darAte(tx, usuario.id, item.id, new Date(agora.getTime() + DIAS_DOS_OUTROS_MUTANTES * DIA_MS), agora);
    for (const item of itens) await darAte(tx, usuario.id, item.id, new Date(agora.getTime() + DIAS_DOS_ITENS * DIA_MS), agora);
    await tx.update(presentes).set({ abertoEm: agora, mutanteId: mutante.id }).where(eq(presentes.id, presente.id));
    return { mutante, outros, itens };
  });
}
