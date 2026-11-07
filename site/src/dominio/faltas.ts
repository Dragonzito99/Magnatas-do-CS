import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { banimentos, cpfsBanidos, faltas, sessoes, usuarios } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { registrarAuditoria } from './equipe';

/** Quem não aceita a partida fica sem jogar: 3 min, depois 15, 30 e 1 dia. A 5ª falta em 30 dias é banimento. */
export const PUNICOES_EM_MINUTOS = [3, 15, 30, 1440] as const;
export const JANELA_DAS_FALTAS_MS = 30 * 24 * 60 * 60_000;
export const MOTIVO_DO_BANIMENTO_POR_FALTAS = 'Não aceitou a partida 5 vezes em 30 dias.';
const FALTAS_ATE_O_BANIMENTO = PUNICOES_EM_MINUTOS.length + 1;

function faltasValidas(usuarioId: string, agora: Date) {
  return and(eq(faltas.usuarioId, usuarioId), isNull(faltas.anuladaEm), gt(faltas.criadoEm, new Date(agora.getTime() - JANELA_DAS_FALTAS_MS)));
}

export async function registrarFalta(tx: Transacao, usuarioId: string, partidaId: string, agora: Date): Promise<void> {
  // Trava a conta: duas faltas da mesma pessoa ao mesmo tempo contam uma depois da outra.
  const [conta] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).for('update');
  if (!conta) return;
  const [{ total: anteriores }] = await tx.select({ total: count() }).from(faltas).where(faltasValidas(usuarioId, agora));
  const vez = anteriores + 1;
  if (vez >= FALTAS_ATE_O_BANIMENTO) {
    await tx.insert(faltas).values({ usuarioId, partidaId, criadoEm: agora });
    await banirPorFaltas(tx, conta, agora);
    return;
  }
  const minutos = PUNICOES_EM_MINUTOS[vez - 1];
  await tx.insert(faltas).values({ usuarioId, partidaId, criadoEm: agora, bloqueadoAte: new Date(agora.getTime() + minutos * 60_000) });
}

/** O mesmo efeito do banimento confirmado pela equipe, sem ninguém da equipe: o autor fica vazio. */
async function banirPorFaltas(tx: Transacao, conta: typeof usuarios.$inferSelect, agora: Date): Promise<void> {
  if (conta.estado === 'banido') return;
  await tx.insert(banimentos).values({
    usuarioId: conta.id,
    cpfHmac: conta.cpfHmac,
    motivo: MOTIVO_DO_BANIMENTO_POR_FALTAS,
    estado: 'confirmado',
    propostoPor: null,
    criadoEm: agora,
    decididoEm: agora,
  });
  await tx.update(usuarios).set({ estado: 'banido' }).where(eq(usuarios.id, conta.id));
  if (conta.cpfHmac) await tx.insert(cpfsBanidos).values({ cpfHmac: conta.cpfHmac }).onConflictDoNothing();
  await tx.delete(sessoes).where(eq(sessoes.usuarioId, conta.id));
  await registrarAuditoria(tx, { acao: 'banir_por_faltas', alvoId: conta.id, detalhes: { motivo: MOTIVO_DO_BANIMENTO_POR_FALTAS } });
}

/** Reverter um banimento limpa as faltas: a escada recomeça do começo. */
export async function anularFaltas(tx: Transacao, usuarioId: string, agora: Date = new Date()): Promise<void> {
  await tx.update(faltas).set({ anuladaEm: agora }).where(and(eq(faltas.usuarioId, usuarioId), isNull(faltas.anuladaEm)));
}

/** Até quando a pessoa está sem jogar, ou null se está livre. */
export async function bloqueioDe(bd: Bd | Transacao, usuarioId: string, agora: Date): Promise<Date | null> {
  const [ultima] = await bd
    .select({ bloqueadoAte: faltas.bloqueadoAte })
    .from(faltas)
    .where(and(faltasValidas(usuarioId, agora), gt(faltas.bloqueadoAte, agora)))
    .orderBy(desc(faltas.bloqueadoAte))
    .limit(1);
  return ultima?.bloqueadoAte ?? null;
}

export async function situacaoDasFaltas(
  bd: Bd,
  usuarioId: string,
  agora: Date = new Date(),
): Promise<{ faltas: number; bloqueadoAte: Date | null; ultimaChance: boolean }> {
  const [{ total }] = await bd.select({ total: count() }).from(faltas).where(faltasValidas(usuarioId, agora));
  return { faltas: total, bloqueadoAte: await bloqueioDe(bd, usuarioId, agora), ultimaChance: total === PUNICOES_EM_MINUTOS.length };
}
