import { eq, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { usuarios, xpPartidas } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { granaDoXp, lancarGrana } from './grana';
import { NIVEIS, nivelAtivo } from './membros';

export const XP_MAXIMO_POR_PARTIDA = 1100;
const XP_POR_JOGAR = 300;
const XP_POR_VITORIA = 300;
const XP_POR_EMPATE = 150;
const XP_POR_ABATE = 20;
const XP_MAXIMO_POR_ABATES = 500;

/** Para a página das patentes explicar a conta com os mesmos números. */
export const COMO_GANHAR_XP = {
  jogar: XP_POR_JOGAR,
  vitoria: XP_POR_VITORIA,
  empate: XP_POR_EMPATE,
  abate: XP_POR_ABATE,
  maximoPorAbates: XP_MAXIMO_POR_ABATES,
  maximoPorPartida: XP_MAXIMO_POR_PARTIDA,
} as const;

export type GrupoDePatente = 'Rua' | 'Família' | 'Negócios' | 'Poder' | 'Elite' | 'Topo';

/** Um degrau da escada: "Empresário 3" é o terceiro nível do Empresário. `nivel` conta os degraus de 1 a 83. */
export type Patente = {
  nivel: number;
  nome: string;
  base: string;
  grau: number;
  grupo: GrupoDePatente;
  /** A posição da patente dentro do grupo, de 1 a 4: o símbolo mostra uma divisa para cada. */
  ordemNoGrupo: number;
  xp: number;
};

// Como as patentes do CrossFire, no universo do Magnatas: grupos, cada patente com os seus níveis.
const ESCADA: { grupo: GrupoDePatente; patentes: [string, number][] }[] = [
  { grupo: 'Rua', patentes: [['Recruta', 1], ['Novato', 3], ['Olheiro', 3]] },
  { grupo: 'Família', patentes: [['Associado', 4], ['Soldado', 4], ['Mafioso', 4]] },
  { grupo: 'Negócios', patentes: [['Magnata Jr.', 6], ['Empresário', 6], ['Investidor', 6]] },
  { grupo: 'Poder', patentes: [['Consigliere', 6], ['Caporegime', 6], ['Ministro', 6]] },
  { grupo: 'Elite', patentes: [['Milionário', 8], ['Bilionário', 8], ['Don', 8]] },
];

// O primeiro degrau sai com uma partida, e cada um custa 4,5% a mais que o anterior, em múltiplos de 50.
const PRIMEIRO_DEGRAU = 600;
const CRESCIMENTO_DO_DEGRAU = 1.045;
// O topo não tem níveis: são saltos grandes, e o Magnata Lendário fica para poucos.
const TOPO: [string, number][] = [
  ['Magnata', 60_000],
  ['Ministro Mafioso', 90_000],
  ['Magnata Supremo', 150_000],
  ['Magnata Lendário', 400_000],
];

function montarEscada(): Patente[] {
  const escada: Patente[] = [];
  let xp = 0;
  const subir = (custo: number, degrau: Omit<Patente, 'nivel' | 'xp'>) => {
    if (escada.length > 0) xp += custo;
    escada.push({ ...degrau, nivel: escada.length + 1, xp });
  };
  for (const { grupo, patentes } of ESCADA) {
    patentes.forEach(([base, graus], indice) => {
      for (let grau = 1; grau <= graus; grau += 1) {
        const custo = Math.round((PRIMEIRO_DEGRAU * CRESCIMENTO_DO_DEGRAU ** (escada.length - 1)) / 50) * 50;
        subir(custo, { nome: graus > 1 ? `${base} ${grau}` : base, base, grau, grupo, ordemNoGrupo: indice + 1 });
      }
    });
  }
  TOPO.forEach(([base, custo], indice) => subir(custo, { nome: base, base, grau: 1, grupo: 'Topo', ordemNoGrupo: indice + 1 }));
  return escada;
}

/** A patente é sempre calculada a partir do XP, para mudar esta tabela não mexer na história de ninguém. */
export const PATENTES: readonly Patente[] = montarEscada();

export type GanhoDePartida = {
  usuarioId: string;
  origem: 'partida' | 'diversao';
  referencia: string;
  abates: number;
  resultado: 'vitoria' | 'empate' | 'derrota';
  jogouAteOFim: boolean;
  /** Só para a tabela do perfil; a Diversão manda quando o servidor souber. */
  mortes?: number | null;
  mapa?: string | null;
  placar?: string | null;
  /** Ilha Lemnos: o XP já vem contado (só pelos abates), no lugar da conta de xpDaPartida. */
  xpFixo?: number;
  /** Ilha Lemnos: a grana do modo vem só do saque, então o XP não paga grana (dono, 15/11/2026). */
  semGrana?: boolean;
};

export type XpLancado = { usuarioId: string; xp: number; xpTotal: number; subiuPara: Patente | null };

export function xpDaPartida({ jogouAteOFim, resultado, abates }: Pick<GanhoDePartida, 'jogouAteOFim' | 'resultado' | 'abates'>): number {
  if (!jogouAteOFim) return 0;
  const porResultado = resultado === 'vitoria' ? XP_POR_VITORIA : resultado === 'empate' ? XP_POR_EMPATE : 0;
  const porAbates = Math.min(Math.max(abates, 0) * XP_POR_ABATE, XP_MAXIMO_POR_ABATES);
  return Math.min(XP_POR_JOGAR + porResultado + porAbates, XP_MAXIMO_POR_PARTIDA);
}

/** Ilha Lemnos: só os abates contam, sem o XP de participar, para entrar e sair repetido não render XP. */
export function xpDeLemnos(abates: number): number {
  return Math.min(Math.max(abates, 0) * XP_POR_ABATE, XP_MAXIMO_POR_ABATES);
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

export async function marcarPatenteVista(bd: Bd, usuarioId: string): Promise<void> {
  const [conta] = await bd.select({ xpTotal: usuarios.xpTotal }).from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!conta) return;
  await bd.update(usuarios).set({ patenteVista: patenteDe(conta.xpTotal).nivel }).where(eq(usuarios.id, usuarioId));
}

/** Quem já tem linha para a referência fica de fora da resposta: o mesmo resultado nunca conta duas vezes. */
export async function lancarXp(tx: Transacao, ganhos: GanhoDePartida[]): Promise<XpLancado[]> {
  const lancados: XpLancado[] = [];
  for (const ganho of ganhos) {
    const xp = ganho.xpFixo ?? xpDaPartida(ganho);
    const [novo] = await tx
      .insert(xpPartidas)
      .values({
        usuarioId: ganho.usuarioId,
        origem: ganho.origem,
        referencia: ganho.referencia,
        abates: Math.max(ganho.abates, 0),
        resultado: ganho.resultado,
        xp,
        mortes: ganho.mortes ?? null,
        mapa: ganho.mapa ?? null,
        placar: ganho.placar ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: xpPartidas.id });
    if (!novo) continue;
    // A Grana da partida vem junto do XP, com a mesma referência: a partida que já pagou não paga de novo.
    // Membro ganha a mais, pelo nível que tem no dia da partida.
    if (!ganho.semGrana) {
      const nivel = await nivelAtivo(tx, ganho.usuarioId);
      const grana = Math.floor(granaDoXp(xp) * (1 + (nivel ? NIVEIS[nivel].bonusGrana : 0)) + 1e-9);
      await lancarGrana(tx, { usuarioId: ganho.usuarioId, tipo: 'partida', quantidade: grana, referencia: ganho.referencia, detalhes: nivel ? { nivel } : undefined });
    }
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

export type PatenteDoGrupo = { base: string; ordemNoGrupo: number; niveis: number; xpInicial: number; xpFinal: number };

/** A escada em grupos, para a página das patentes: cada patente uma vez, com quantos níveis tem e a faixa de XP. */
export function patentesPorGrupo(): { grupo: GrupoDePatente; patentes: PatenteDoGrupo[] }[] {
  const grupos: { grupo: GrupoDePatente; patentes: PatenteDoGrupo[] }[] = [];
  for (const degrau of PATENTES) {
    let grupo = grupos.at(-1);
    if (grupo?.grupo !== degrau.grupo) {
      grupo = { grupo: degrau.grupo, patentes: [] };
      grupos.push(grupo);
    }
    const ultima = grupo.patentes.at(-1);
    if (ultima?.base === degrau.base) {
      ultima.niveis += 1;
      ultima.xpFinal = degrau.xp;
    } else {
      grupo.patentes.push({ base: degrau.base, ordemNoGrupo: degrau.ordemNoGrupo, niveis: 1, xpInicial: degrau.xp, xpFinal: degrau.xp });
    }
  }
  return grupos;
}
