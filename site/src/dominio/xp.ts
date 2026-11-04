import { eq, sql } from 'drizzle-orm';
import { usuarios, xpPartidas } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';

export const XP_MAXIMO_POR_PARTIDA = 1100;
const XP_POR_JOGAR = 300;
const XP_POR_VITORIA = 300;
const XP_POR_EMPATE = 150;
const XP_POR_ABATE = 20;
const XP_MAXIMO_POR_ABATES = 500;

/** A patente é sempre calculada a partir do XP, para mudar esta tabela não mexer na história de ninguém. */
export const PATENTES = [
  { nivel: 1, nome: 'Recruta', xp: 0 },
  { nivel: 2, nome: 'Magnata Jr.', xp: 4_500 },
  { nivel: 3, nome: 'Associado', xp: 13_500 },
  { nivel: 4, nome: 'Mafioso', xp: 31_500 },
  { nivel: 5, nome: 'Empresário', xp: 63_000 },
  { nivel: 6, nome: 'Consigliere', xp: 112_500 },
  { nivel: 7, nome: 'Ministro', xp: 180_000 },
  { nivel: 8, nome: 'Milionário', xp: 270_000 },
  { nivel: 9, nome: 'Don', xp: 405_000 },
  { nivel: 10, nome: 'Magnata Supremo', xp: 630_000 },
] as const;

export type Patente = (typeof PATENTES)[number];

export type GanhoDePartida = {
  usuarioId: string;
  origem: 'partida' | 'diversao';
  referencia: string;
  abates: number;
  resultado: 'vitoria' | 'empate' | 'derrota';
  jogouAteOFim: boolean;
};

export type XpLancado = { usuarioId: string; xp: number; xpTotal: number; subiuPara: Patente | null };

export function xpDaPartida({ jogouAteOFim, resultado, abates }: Pick<GanhoDePartida, 'jogouAteOFim' | 'resultado' | 'abates'>): number {
  if (!jogouAteOFim) return 0;
  const porResultado = resultado === 'vitoria' ? XP_POR_VITORIA : resultado === 'empate' ? XP_POR_EMPATE : 0;
  const porAbates = Math.min(Math.max(abates, 0) * XP_POR_ABATE, XP_MAXIMO_POR_ABATES);
  return Math.min(XP_POR_JOGAR + porResultado + porAbates, XP_MAXIMO_POR_PARTIDA);
}

export function patenteDe(xpTotal: number): Patente {
  return PATENTES.findLast((patente) => xpTotal >= patente.xp) ?? PATENTES[0];
}

export function progressoDe(xpTotal: number): { patente: Patente; proxima: Patente | null; faltam: number; porcentagem: number } {
  const patente = patenteDe(xpTotal);
  const proxima = PATENTES.find((candidata) => candidata.nivel === patente.nivel + 1) ?? null;
  if (!proxima) return { patente, proxima: null, faltam: 0, porcentagem: 100 };
  const porcentagem = Math.floor(((xpTotal - patente.xp) / (proxima.xp - patente.xp)) * 100);
  return { patente, proxima, faltam: proxima.xp - xpTotal, porcentagem };
}

/** Quem já tem linha para a referência fica de fora da resposta: o mesmo resultado nunca conta duas vezes. */
export async function lancarXp(tx: Transacao, ganhos: GanhoDePartida[]): Promise<XpLancado[]> {
  const lancados: XpLancado[] = [];
  for (const ganho of ganhos) {
    const xp = xpDaPartida(ganho);
    const [novo] = await tx
      .insert(xpPartidas)
      .values({ usuarioId: ganho.usuarioId, origem: ganho.origem, referencia: ganho.referencia, abates: Math.max(ganho.abates, 0), resultado: ganho.resultado, xp })
      .onConflictDoNothing()
      .returning({ id: xpPartidas.id });
    if (!novo) continue;
    const [conta] = await tx
      .update(usuarios)
      .set({ xpTotal: sql`${usuarios.xpTotal} + ${xp}` })
      .where(eq(usuarios.id, ganho.usuarioId))
      .returning({ xpTotal: usuarios.xpTotal });
    const antes = patenteDe(conta.xpTotal - xp);
    const depois = patenteDe(conta.xpTotal);
    lancados.push({ usuarioId: ganho.usuarioId, xp, xpTotal: conta.xpTotal, subiuPara: depois.nivel > antes.nivel ? depois : null });
  }
  return lancados;
}
