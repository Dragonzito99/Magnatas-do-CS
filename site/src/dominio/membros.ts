import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { assinaturas, envios, itensDoJogador, mensalidades } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { lancarMoeda } from './grana';
import { CATALOGO, itemDoCatalogo } from './loja';

/** Os níveis de apoio, aprovados pelo dono em 10/11/2026. Todos mensais. */
export type NivelDeMembro = 'bronze' | 'prata' | 'ouro' | 'premium';

export type Nivel = {
  nome: string;
  precoCentavos: number;
  /** Grana a mais por partida: 0,1 é +10%. */
  bonusGrana: number;
  magcoinsPorMes: number;
  /** Itens do baú enquanto a assinatura vale. */
  itens: string[];
  /** Itens de lançamento para sempre e produtos em casa. */
  premium?: boolean;
};

export const NIVEIS: Record<NivelDeMembro, Nivel> = {
  bronze: { nome: 'Bronze', precoCentavos: 500, bonusGrana: 0.1, magcoinsPorMes: 0, itens: ['etiqueta-apoiador'] },
  prata: { nome: 'Prata', precoCentavos: 1000, bonusGrana: 0.2, magcoinsPorMes: 50, itens: ['etiqueta-apoiador', 'cor-dourada'] },
  ouro: { nome: 'Ouro', precoCentavos: 1500, bonusGrana: 0.3, magcoinsPorMes: 100, itens: ['etiqueta-apoiador', 'moldura-ouro'] },
  premium: { nome: 'Magnata Premium', precoCentavos: 3000, bonusGrana: 0.3, magcoinsPorMes: 250, itens: ['etiqueta-apoiador', 'moldura-ouro'], premium: true },
};

export const ORDEM_DOS_NIVEIS: NivelDeMembro[] = ['bronze', 'prata', 'ouro', 'premium'];
const DIAS_DE_FOLGA = 3;

/** Um mês depois do pagamento, mais a folga para o cartão passar no mês seguinte. */
export function validadeDaMensalidade(pagoEm: Date): Date {
  const fim = new Date(pagoEm);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  fim.setUTCDate(fim.getUTCDate() + DIAS_DE_FOLGA);
  return fim;
}

/** O nível mais alto que a conta tem pago até agora, ou nenhum. */
export async function nivelAtivo(bd: Bd | Transacao, usuarioId: string, agora: Date = new Date()): Promise<NivelDeMembro | null> {
  const linhas = await bd
    .select({ nivel: assinaturas.nivel })
    .from(assinaturas)
    .where(and(eq(assinaturas.usuarioId, usuarioId), gt(assinaturas.pagoAte, agora)))
    .orderBy(desc(assinaturas.pagoAte));
  const niveis = linhas.map((linha) => linha.nivel);
  return ORDEM_DOS_NIVEIS.findLast((nivel) => niveis.includes(nivel)) ?? null;
}

/** Põe o item no baú até `ate` (sem prazo fica sem prazo; prazo maior fica o maior). */
async function darAte(tx: Transacao, usuarioId: string, itemId: string, ate: Date | null, agora: Date): Promise<void> {
  await tx
    .insert(itensDoJogador)
    .values({ usuarioId, itemId, expiraEm: ate, atualizadoEm: agora })
    .onConflictDoUpdate({
      target: [itensDoJogador.usuarioId, itensDoJogador.itemId],
      set: {
        expiraEm: ate === null ? null : sql`case when ${itensDoJogador.expiraEm} is null then null else greatest(${itensDoJogador.expiraEm}, ${ate}) end`,
        atualizadoEm: agora,
      },
    });
}

/**
 * Uma mensalidade aprovada (já conferida na API do Mercado Pago). O mesmo pagamento duas vezes não conta de novo.
 * Estende o prazo, credita as MagCoins do mês, põe os itens do nível no baú e, no Premium, dá os itens de lançamento
 * para sempre e cria o envio na 1ª, 3ª, 5ª... mensalidade.
 */
export async function aplicarMensalidade(
  tx: Transacao,
  pagamento: { assinaturaId: string; mpPagamentoId: string; valorCentavos: number; pagoEm: Date },
): Promise<boolean> {
  const [nova] = await tx
    .insert(mensalidades)
    .values({ assinaturaId: pagamento.assinaturaId, mpPagamentoId: pagamento.mpPagamentoId, valorCentavos: pagamento.valorCentavos, pagoEm: pagamento.pagoEm })
    .onConflictDoNothing()
    .returning({ id: mensalidades.id });
  if (!nova) return false;

  const [assinatura] = await tx.select().from(assinaturas).where(eq(assinaturas.id, pagamento.assinaturaId)).for('update');
  const nivel = NIVEIS[assinatura.nivel];
  const validade = validadeDaMensalidade(pagamento.pagoEm);
  const pagoAte = assinatura.pagoAte && assinatura.pagoAte > validade ? assinatura.pagoAte : validade;
  const pagas = assinatura.mensalidadesPagas + 1;
  await tx
    .update(assinaturas)
    .set({ pagoAte, mensalidadesPagas: pagas, estado: assinatura.estado === 'cancelada' ? 'cancelada' : 'ativa' })
    .where(eq(assinaturas.id, assinatura.id));

  if (nivel.magcoinsPorMes > 0) {
    await lancarMoeda(tx, {
      moeda: 'magcoin',
      usuarioId: assinatura.usuarioId,
      tipo: 'mensalidade',
      quantidade: nivel.magcoinsPorMes,
      referencia: pagamento.mpPagamentoId,
      detalhes: { nivel: assinatura.nivel },
    });
  }
  for (const itemId of nivel.itens) await darAte(tx, assinatura.usuarioId, itemId, pagoAte, pagamento.pagoEm);

  // A etiqueta de apoiador entra em uso sozinha, a não ser que a pessoa já use uma etiqueta.
  const etiquetas = CATALOGO.filter((item) => item.tipo === 'etiqueta').map((item) => item.id);
  const emUso = await tx
    .select({ itemId: itensDoJogador.itemId })
    .from(itensDoJogador)
    .where(and(eq(itensDoJogador.usuarioId, assinatura.usuarioId), eq(itensDoJogador.usando, true)));
  if (!emUso.some((linha) => etiquetas.includes(linha.itemId) && linha.itemId !== 'etiqueta-apoiador' && itemDoCatalogo(linha.itemId))) {
    await tx
      .update(itensDoJogador)
      .set({ usando: true })
      .where(and(eq(itensDoJogador.usuarioId, assinatura.usuarioId), eq(itensDoJogador.itemId, 'etiqueta-apoiador')));
  }

  if (nivel.premium) {
    for (const item of CATALOGO.filter((candidato) => candidato.lancamento)) await darAte(tx, assinatura.usuarioId, item.id, null, pagamento.pagoEm);
    if (pagas % 2 === 1) await tx.insert(envios).values({ usuarioId: assinatura.usuarioId, mensalidadeId: nova.id }).onConflictDoNothing();
  }
  return true;
}
