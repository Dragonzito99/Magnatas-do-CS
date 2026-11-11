import { and, desc, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { custosDoMes, mensalidades, pedidos, type Usuario } from '@/bd/esquema';
import { exigirPermissao, registrarAuditoria } from './equipe';

/** Brasília não tem horário de verão desde 2019: o mês vira às 03:00 UTC do dia 1. */
const FUSO_MS = 3 * 60 * 60 * 1000;

export type MetaDoMes = { custoCentavos: number; arrecadadoCentavos: number; porcento: number };

function mesDeBrasilia(agora: Date): { chave: string; inicio: Date; fim: Date } {
  const local = new Date(agora.getTime() - FUSO_MS);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  return {
    chave: `${ano}-${String(mes + 1).padStart(2, '0')}`,
    inicio: new Date(Date.UTC(ano, mes, 1) + FUSO_MS),
    fim: new Date(Date.UTC(ano, mes + 1, 1) + FUSO_MS),
  };
}

/** O Adm diz quanto o clube gasta por mês. Vale a partir deste mês e nos seguintes, até mudar de novo. */
export async function definirCustoDoMes(bd: Bd, ator: Pick<Usuario, 'id'>, custoCentavos: number, agora: Date = new Date()): Promise<void> {
  if (!Number.isInteger(custoCentavos) || custoCentavos <= 0 || custoCentavos > 100_000_00) throw new Error('Custo inválido.');
  const { chave } = mesDeBrasilia(agora);
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'ver_envios');
    await tx
      .insert(custosDoMes)
      .values({ mes: chave, custoCentavos, atorId: ator.id, atualizadoEm: agora })
      .onConflictDoUpdate({ target: custosDoMes.mes, set: { custoCentavos, atorId: ator.id, atualizadoEm: agora } });
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'custo_do_mes', detalhes: { mes: chave, custoCentavos } });
  });
}

/**
 * A meta do mês para a capa do Apoie o clube: quanto do custo já entrou em pacotes de MagCoin e mensalidades. Sem custo
 * definido não há meta. O pacote de teste do Adm e os estornos não contam.
 */
export async function metaDoMes(bd: Bd, agora: Date = new Date()): Promise<MetaDoMes | null> {
  const { chave, inicio, fim } = mesDeBrasilia(agora);
  const [custo] = await bd.select().from(custosDoMes).where(lte(custosDoMes.mes, chave)).orderBy(desc(custosDoMes.mes)).limit(1);
  if (!custo) return null;
  const [pacotes] = await bd
    .select({ soma: sql<number>`coalesce(sum(${pedidos.valorCentavos}), 0)::int` })
    .from(pedidos)
    .where(and(eq(pedidos.estado, 'pago'), ne(pedidos.pacote, 'teste'), gte(pedidos.pagoEm, inicio), lt(pedidos.pagoEm, fim)));
  const [mensais] = await bd
    .select({ soma: sql<number>`coalesce(sum(${mensalidades.valorCentavos}), 0)::int` })
    .from(mensalidades)
    .where(and(gte(mensalidades.pagoEm, inicio), lt(mensalidades.pagoEm, fim)));
  const arrecadadoCentavos = pacotes.soma + mensais.soma;
  return { custoCentavos: custo.custoCentavos, arrecadadoCentavos, porcento: Math.min(100, Math.floor((arrecadadoCentavos * 100) / custo.custoCentavos)) };
}
