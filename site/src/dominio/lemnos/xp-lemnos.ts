import { eq } from 'drizzle-orm';
import { lemnosSessoes } from '@/bd/esquema';
import type { Transacao } from '@/dominio/disponibilidade';
import { lancarXp, xpDeLemnos } from '@/dominio/xp';

/** XP pelos abates da sessão, sem a grana do XP (dono, 15/11/2026). A referência da sessão não deixa pagar duas vezes. */
export async function lancarXpDaSessao(tx: Transacao, sessaoId: string): Promise<void> {
  const [sessao] = await tx.select().from(lemnosSessoes).where(eq(lemnosSessoes.id, sessaoId));
  if (!sessao || sessao.abates <= 0) return;
  await lancarXp(tx, [
    {
      usuarioId: sessao.usuarioId,
      origem: 'diversao',
      referencia: `lemnos:${sessao.id}`,
      abates: sessao.abates,
      mortes: sessao.mortes,
      resultado: 'derrota',
      jogouAteOFim: true,
      mapa: 'lemnos',
      xpFixo: xpDeLemnos(sessao.abates),
      semGrana: true,
    },
  ]);
}
