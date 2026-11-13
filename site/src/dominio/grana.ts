import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, usuarios, xpPartidas, type Usuario } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { exigirPermissao, registrarAuditoria } from './equipe';

/** 1 Grana a cada 10 XP, regra do dono (09/11/2026). */
export const GRANA_POR_XP = 10;

export type TipoDeGrana = (typeof lancamentosDeGrana.$inferInsert)['tipo'];
export type Moeda = 'grana' | 'magcoin';

export class SaldoInsuficiente extends Error {
  constructor(public readonly moeda: Moeda = 'grana') {
    super(moeda === 'grana' ? 'Grana insuficiente.' : 'MagCoins insuficientes.');
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

/** O banco recusa saldo negativo pelas regras usuarios_*_nao_negativa; o erro vem embrulhado pelo Drizzle. */
function ehSaldoNegativo(erro: unknown, moeda: Moeda): boolean {
  const regra = `usuarios_${moeda}_nao_negativa`;
  for (let atual: unknown = erro; atual; atual = (atual as { cause?: unknown }).cause) {
    const { code, constraint, message } = atual as { code?: string; constraint?: string; message?: string };
    if (code === '23514' && (constraint === regra || message?.includes(regra))) return true;
  }
  return false;
}

const SALDO = { grana: usuarios.grana, magcoin: usuarios.magcoin } as const;

/**
 * Grava uma linha no livro-caixa e muda o saldo junto, na mesma transação. A referência repetida não paga nem cobra de
 * novo (devolve lancado: false). Gasto maior que o saldo derruba a transação com SaldoInsuficiente.
 */
type Linha = { usuarioId: string; tipo: TipoDeGrana; quantidade: number; referencia: string; detalhes?: unknown; atorId?: string };

export function lancarGrana(tx: Transacao, linha: Linha): Promise<{ lancado: boolean; saldo: number }> {
  return lancarMoeda(tx, { ...linha, moeda: 'grana' });
}

/** O mesmo livro-caixa para as duas moedas: cada uma no próprio saldo, com a mesma proteção. */
export async function lancarMoeda(tx: Transacao, linha: Linha & { moeda: Moeda }): Promise<{ lancado: boolean; saldo: number }> {
  const coluna = SALDO[linha.moeda];
  const saldoAtual = async () => {
    const [conta] = await tx.select({ saldo: coluna }).from(usuarios).where(eq(usuarios.id, linha.usuarioId));
    return conta?.saldo ?? 0;
  };
  if (!Number.isInteger(linha.quantidade)) throw new Error('A quantidade precisa ser um número inteiro.');
  if (linha.quantidade === 0) return { lancado: false, saldo: await saldoAtual() };
  const [nova] = await tx
    .insert(lancamentosDeGrana)
    .values({
      usuarioId: linha.usuarioId,
      moeda: linha.moeda,
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
      .set({ [linha.moeda]: sql`${coluna} + ${linha.quantidade}` })
      .where(eq(usuarios.id, linha.usuarioId))
      .returning({ saldo: coluna });
    return { lancado: true, saldo: conta.saldo };
  } catch (erro) {
    if (ehSaldoNegativo(erro, linha.moeda)) throw new SaldoInsuficiente(linha.moeda);
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
      sql`not exists (select 1 from ${lancamentosDeGrana} where ${lancamentosDeGrana.usuarioId} = ${xpPartidas.usuarioId} and ${lancamentosDeGrana.moeda} = 'grana' and ${lancamentosDeGrana.tipo} = 'partida' and ${lancamentosDeGrana.referencia} = ${xpPartidas.referencia})`,
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
export async function extrato(bd: Bd, usuarioId: string, { moeda = 'grana', limite = 100 }: { moeda?: Moeda; limite?: number } = {}): Promise<LinhaDoExtrato[]> {
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
    .where(and(eq(lancamentosDeGrana.usuarioId, usuarioId), eq(lancamentosDeGrana.moeda, moeda)))
    .orderBy(desc(lancamentosDeGrana.criadoEm), desc(lancamentosDeGrana.id))
    .limit(limite);
}

/** Contas cujo saldo guardado não bate com a soma do livro-caixa. Só aponta; nunca corrige. */
export async function divergencias(bd: Bd): Promise<{ usuarioId: string; apelido: string; moeda: Moeda; saldo: number; soma: number }[]> {
  const erradas: { usuarioId: string; apelido: string; moeda: Moeda; saldo: number; soma: number }[] = [];
  for (const moeda of ['grana', 'magcoin'] as const) {
    const coluna = SALDO[moeda];
    // Junção em vez de subconsulta: na lista do select o Drizzle escreve as colunas sem o nome da tabela.
    const linhas = await bd
      .select({ usuarioId: usuarios.id, apelido: usuarios.apelido, saldo: coluna, soma: sql<number>`coalesce(sum(${lancamentosDeGrana.quantidade}), 0)::int` })
      .from(usuarios)
      .leftJoin(lancamentosDeGrana, and(eq(lancamentosDeGrana.usuarioId, usuarios.id), eq(lancamentosDeGrana.moeda, moeda)))
      .groupBy(usuarios.id)
      .having(sql`${coluna} <> coalesce(sum(${lancamentosDeGrana.quantidade}), 0)`)
      .orderBy(usuarios.apelido);
    erradas.push(...linhas.map((linha) => ({ ...linha, moeda })));
  }
  return erradas;
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

/** O Adm dá ou tira MagCoins pelo Painel ADM (ex.: compra que não caiu), com motivo; livro-caixa e auditoria. */
export async function ajustarMagcoin(bd: Bd, ator: Pick<Usuario, 'id'>, alvoId: string, quantidade: number, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!Number.isInteger(quantidade) || quantidade === 0 || texto.length < 3) throw new AjusteInvalido();
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'ajustar_grana');
    const [alvo] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, alvoId));
    if (!alvo) throw new AjusteInvalido();
    await lancarMoeda(tx, { moeda: 'magcoin', usuarioId: alvoId, tipo: 'ajuste', quantidade, referencia: randomUUID(), detalhes: { motivo: texto }, atorId: ator.id });
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'ajustar_magcoin', alvoId, detalhes: { quantidade, motivo: texto } });
  });
}

/** Saldo de uma conta, para o cabeçalho. */
export async function saldoDe(bd: Bd, usuarioId: string): Promise<number> {
  const [conta] = await bd.select({ grana: usuarios.grana }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return conta?.grana ?? 0;
}

/** Para o Painel ADM: contas pelo apelido (sem diferenciar maiúscula), com o saldo; sem termo, as de mais Grana. */
export async function buscarContasDaGrana(bd: Bd, termo: string, limite = 30): Promise<{ id: string; apelido: string; grana: number }[]> {
  const texto = termo.trim();
  // Busca literal: % e _ digitados não viram curinga.
  const filtro = texto ? sql`position(lower(${texto}) in lower(${usuarios.apelido})) > 0` : undefined;
  return bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, grana: usuarios.grana })
    .from(usuarios)
    .where(filtro)
    .orderBy(desc(usuarios.grana), usuarios.apelido)
    .limit(limite);
}

/** Uma conta com o saldo, para o Painel ADM. */
export async function contaDaGrana(bd: Bd, usuarioId: string): Promise<{ id: string; apelido: string; grana: number } | null> {
  const [conta] = await bd.select({ id: usuarios.id, apelido: usuarios.apelido, grana: usuarios.grana }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return conta ?? null;
}
