import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, usuarios, xpPartidas, type Usuario } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { exigirPermissao, registrarAuditoria } from './equipe';

/** 1 Grana a cada 10 XP, regra do dono (09/11/2026). */
export const GRANA_POR_XP = 10;

export type TipoDeGrana = (typeof lancamentosDeGrana.$inferInsert)['tipo'];

export class SaldoInsuficiente extends Error {
  constructor() {
    super('Grana insuficiente.');
  }
}

export class AjusteInvalido extends Error {
  constructor() {
    super('O ajuste precisa de uma quantidade e de um motivo.');
  }
}

export function granaDoXp(xp: number): number {
  return Math.max(Math.floor(xp / GRANA_POR_XP), 0);
}

/** O banco recusa saldo negativo pela regra usuarios_grana_nao_negativa; o erro vem embrulhado pelo Drizzle. */
function ehSaldoNegativo(erro: unknown): boolean {
  for (let atual: unknown = erro; atual; atual = (atual as { cause?: unknown }).cause) {
    const { code, constraint, message } = atual as { code?: string; constraint?: string; message?: string };
    if (code === '23514' && (constraint === 'usuarios_grana_nao_negativa' || message?.includes('usuarios_grana_nao_negativa'))) return true;
  }
  return false;
}

/**
 * Grava uma linha no livro-caixa e muda o saldo junto, na mesma transação. A referência repetida não paga nem cobra de
 * novo (devolve lancado: false). Gasto maior que o saldo derruba a transação com SaldoInsuficiente.
 */
export async function lancarGrana(
  tx: Transacao,
  linha: { usuarioId: string; tipo: TipoDeGrana; quantidade: number; referencia: string; detalhes?: unknown; atorId?: string },
): Promise<{ lancado: boolean; saldo: number }> {
  const saldoAtual = async () => {
    const [conta] = await tx.select({ grana: usuarios.grana }).from(usuarios).where(eq(usuarios.id, linha.usuarioId));
    return conta?.grana ?? 0;
  };
  if (!Number.isInteger(linha.quantidade)) throw new Error('A quantidade de Grana precisa ser um número inteiro.');
  if (linha.quantidade === 0) return { lancado: false, saldo: await saldoAtual() };
  const [nova] = await tx
    .insert(lancamentosDeGrana)
    .values({
      usuarioId: linha.usuarioId,
      tipo: linha.tipo,
      quantidade: linha.quantidade,
      referencia: linha.referencia,
      detalhes: linha.detalhes ?? null,
      atorId: linha.atorId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: lancamentosDeGrana.id });
  if (!nova) return { lancado: false, saldo: await saldoAtual() };
  try {
    const [conta] = await tx
      .update(usuarios)
      .set({ grana: sql`${usuarios.grana} + ${linha.quantidade}` })
      .where(eq(usuarios.id, linha.usuarioId))
      .returning({ grana: usuarios.grana });
    return { lancado: true, saldo: conta.grana };
  } catch (erro) {
    if (ehSaldoNegativo(erro)) throw new SaldoInsuficiente();
    throw erro;
  }
}

/**
 * Na abertura da loja, quem já jogou recebe a Grana do XP antigo, uma vez só. Conta só o XP das partidas que ainda não
 * pagaram Grana, para a partida jogada entre a publicação e a abertura não contar duas vezes.
 */
export async function abrirGrana(bd: Bd): Promise<number> {
  const somas = await bd
    .select({ usuarioId: xpPartidas.usuarioId, xp: sql<number>`coalesce(sum(${xpPartidas.xp}), 0)::int` })
    .from(xpPartidas)
    .where(
      sql`not exists (select 1 from ${lancamentosDeGrana} where ${lancamentosDeGrana.usuarioId} = ${xpPartidas.usuarioId} and ${lancamentosDeGrana.tipo} = 'partida' and ${lancamentosDeGrana.referencia} = ${xpPartidas.referencia})`,
    )
    .groupBy(xpPartidas.usuarioId);
  let pagas = 0;
  for (const { usuarioId, xp } of somas) {
    const quantidade = granaDoXp(xp);
    if (quantidade === 0) continue;
    const { lancado } = await bd.transaction((tx) =>
      lancarGrana(tx, { usuarioId, tipo: 'abertura', quantidade, referencia: 'abertura', detalhes: { xp } }),
    );
    if (lancado) pagas += 1;
  }
  return pagas;
}

export type LinhaDoExtrato = {
  id: string;
  tipo: TipoDeGrana;
  quantidade: number;
  referencia: string;
  detalhes: unknown;
  criadoEm: Date;
  /** O saldo logo depois desta linha. */
  saldo: number;
};

/** As linhas da conta, mais novas primeiro, com o saldo depois de cada uma. */
export async function extrato(bd: Bd, usuarioId: string, limite = 100): Promise<LinhaDoExtrato[]> {
  return bd
    .select({
      id: lancamentosDeGrana.id,
      tipo: lancamentosDeGrana.tipo,
      quantidade: lancamentosDeGrana.quantidade,
      referencia: lancamentosDeGrana.referencia,
      detalhes: lancamentosDeGrana.detalhes,
      criadoEm: lancamentosDeGrana.criadoEm,
      saldo: sql<number>`(sum(${lancamentosDeGrana.quantidade}) over (order by ${lancamentosDeGrana.criadoEm}, ${lancamentosDeGrana.id}))::int`,
    })
    .from(lancamentosDeGrana)
    .where(eq(lancamentosDeGrana.usuarioId, usuarioId))
    .orderBy(desc(lancamentosDeGrana.criadoEm), desc(lancamentosDeGrana.id))
    .limit(limite);
}

/** Contas cujo saldo guardado não bate com a soma do livro-caixa. Só aponta; nunca corrige. */
export async function divergencias(bd: Bd): Promise<{ usuarioId: string; apelido: string; saldo: number; soma: number }[]> {
  // Junção em vez de subconsulta: na lista do select o Drizzle escreve as colunas sem o nome da tabela.
  const soma = sql<number>`coalesce(sum(${lancamentosDeGrana.quantidade}), 0)::int`;
  return bd
    .select({ usuarioId: usuarios.id, apelido: usuarios.apelido, saldo: usuarios.grana, soma })
    .from(usuarios)
    .leftJoin(lancamentosDeGrana, eq(lancamentosDeGrana.usuarioId, usuarios.id))
    .groupBy(usuarios.id)
    .having(sql`${usuarios.grana} <> coalesce(sum(${lancamentosDeGrana.quantidade}), 0)`)
    .orderBy(usuarios.apelido);
}

/** O Adm dá ou tira Grana, com motivo; fica no livro-caixa e na auditoria. */
export async function ajustarGrana(bd: Bd, ator: Pick<Usuario, 'id'>, alvoId: string, quantidade: number, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!Number.isInteger(quantidade) || quantidade === 0 || texto.length < 3) throw new AjusteInvalido();
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'ajustar_grana');
    const [alvo] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, alvoId));
    if (!alvo) throw new AjusteInvalido();
    await lancarGrana(tx, { usuarioId: alvoId, tipo: 'ajuste', quantidade, referencia: randomUUID(), detalhes: { motivo: texto }, atorId: ator.id });
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'ajustar_grana', alvoId, detalhes: { quantidade, motivo: texto } });
  });
}

/** Saldo de uma conta, para o cabeçalho. */
export async function saldoDe(bd: Bd, usuarioId: string): Promise<number> {
  const [conta] = await bd.select({ grana: usuarios.grana }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return conta?.grana ?? 0;
}
