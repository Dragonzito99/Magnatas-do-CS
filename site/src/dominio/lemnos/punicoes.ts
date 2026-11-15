import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lemnosPunicoes, type Usuario } from '@/bd/esquema';
import type { Transacao } from '@/dominio/disponibilidade';
import { exigirPermissao, registrarAuditoria } from '@/dominio/equipe';

/*
 * Punição em escada por AFK ou por acampar (dono, 15/11/2026). Vale só para a Ilha Lemnos, nunca para o clube.
 * 1º e 2º kick: perde tudo, como na morte. 3º: banido 3 dias. Mais um depois disso: banido para sempre.
 * Os kicks zeram depois de 30 dias sem levar outro (proposta aceita no plano).
 */
export const DIAS_SEM_KICK_PARA_ZERAR = 30;
export const DIAS_DO_PRIMEIRO_BANIMENTO = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

export type ResultadoDoKick = 'aviso' | 'banido_dias' | 'banido_sempre';

/** Os kicks que ainda contam, do mais novo para trás, enquanto o intervalo entre um e o anterior for menor que 30 dias. */
async function corrente(tx: Bd | Transacao, usuarioId: string) {
  const linhas = await tx
    .select()
    .from(lemnosPunicoes)
    .where(and(eq(lemnosPunicoes.usuarioId, usuarioId), isNull(lemnosPunicoes.desfeitaEm)))
    .orderBy(desc(lemnosPunicoes.criadoEm));
  const seguidas = linhas.slice(0, 1);
  for (const linha of linhas.slice(1)) {
    const maisNova = seguidas[seguidas.length - 1];
    if (maisNova.criadoEm.getTime() - linha.criadoEm.getTime() >= DIAS_SEM_KICK_PARA_ZERAR * DIA_MS) break;
    seguidas.push(linha);
  }
  return seguidas;
}

export async function registrarKick(tx: Transacao, usuarioId: string, motivo: 'afk' | 'acampar', agora: Date): Promise<ResultadoDoKick> {
  const [nova] = await tx.insert(lemnosPunicoes).values({ usuarioId, motivo, criadoEm: agora }).returning();
  const seguidas = await corrente(tx, usuarioId);
  const jaBanidoPorDias = seguidas.some((linha) => linha.id !== nova.id && linha.banidoAte !== null);
  if (jaBanidoPorDias) {
    await tx.update(lemnosPunicoes).set({ banidoParaSempre: true }).where(eq(lemnosPunicoes.id, nova.id));
    return 'banido_sempre';
  }
  if (seguidas.length >= 3) {
    await tx
      .update(lemnosPunicoes)
      .set({ banidoAte: new Date(agora.getTime() + DIAS_DO_PRIMEIRO_BANIMENTO * DIA_MS) })
      .where(eq(lemnosPunicoes.id, nova.id));
    return 'banido_dias';
  }
  return 'aviso';
}

/** O banimento da ilha que vale agora: ate null é para sempre. */
export async function banimentoAtivo(bd: Bd | Transacao, usuarioId: string, agora: Date = new Date()): Promise<{ ate: Date | null } | null> {
  const linhas = await bd.select().from(lemnosPunicoes).where(and(eq(lemnosPunicoes.usuarioId, usuarioId), isNull(lemnosPunicoes.desfeitaEm)));
  if (linhas.some((linha) => linha.banidoParaSempre)) return { ate: null };
  const ate = linhas
    .map((linha) => linha.banidoAte)
    .filter((data): data is Date => data !== null && data.getTime() > agora.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return ate ? { ate } : null;
}

/** O Adm desfaz um kick ou banimento injusto pelo Painel. O kick desfeito sai da corrente. */
export async function desfazerBanimento(bd: Bd, ator: Pick<Usuario, 'id'>, punicaoId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'cuidar_de_lemnos');
    const [linha] = await tx
      .update(lemnosPunicoes)
      .set({ desfeitaEm: agora, desfeitaPor: ator.id })
      .where(and(eq(lemnosPunicoes.id, punicaoId), isNull(lemnosPunicoes.desfeitaEm)))
      .returning();
    if (!linha) return;
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'lemnos_desfazer_banimento', alvoId: linha.usuarioId, detalhes: { punicaoId, motivo: linha.motivo } });
  });
}
