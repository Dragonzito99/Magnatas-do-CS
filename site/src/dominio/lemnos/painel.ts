import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, lemnosEventos, lemnosPunicoes, usuarios } from '@/bd/esquema';

/* O que o Adm vigia na Ilha Lemnos: a grana que a ilha põe no clube, kicks e banimentos, e mortes repetidas. */

const DIA_MS = 24 * 60 * 60 * 1000;
const BRASILIA_MS = -3 * 60 * 60 * 1000;
const MORTES_SUSPEITAS = 5;

const chaveDoDia = (quando: Date) => new Date(quando.getTime() + BRASILIA_MS).toISOString().slice(0, 10);

/** A grana que a ilha gerou por dia: venda de saque e dinheiro trazido. Serve para vigiar a inflação. */
export async function granaDaIlhaPorDia(bd: Bd, dias = 14, agora: Date = new Date()): Promise<{ dia: string; venda: number; dinheiro: number }[]> {
  const desde = new Date(agora.getTime() - dias * DIA_MS);
  const linhas = await bd
    .select({ tipo: lancamentosDeGrana.tipo, quantidade: lancamentosDeGrana.quantidade, criadoEm: lancamentosDeGrana.criadoEm })
    .from(lancamentosDeGrana)
    .where(and(eq(lancamentosDeGrana.moeda, 'grana'), inArray(lancamentosDeGrana.tipo, ['venda', 'lemnos']), gte(lancamentosDeGrana.criadoEm, desde)));
  const totais = new Map<string, { venda: number; dinheiro: number }>();
  for (const linha of linhas) {
    const dia = totais.get(chaveDoDia(linha.criadoEm)) ?? { venda: 0, dinheiro: 0 };
    if (linha.tipo === 'venda') dia.venda += linha.quantidade;
    else dia.dinheiro += linha.quantidade;
    totais.set(chaveDoDia(linha.criadoEm), dia);
  }
  return Array.from({ length: dias }, (_, indice) => {
    const quando = new Date(agora.getTime() - (dias - 1 - indice) * DIA_MS);
    const [, mes, numero] = chaveDoDia(quando).split('-');
    return { dia: `${numero}/${mes}`, ...(totais.get(chaveDoDia(quando)) ?? { venda: 0, dinheiro: 0 }) };
  });
}

export type PunicaoDoPainel = { id: string; usuarioId: string; apelido: string; motivo: 'afk' | 'acampar'; criadoEm: Date; banidoAte: Date | null; paraSempre: boolean; desfeita: boolean };

/** Os banimentos da ilha que valem agora e os 20 últimos kicks, para o Adm desfazer o que for injusto. */
export async function banimentosDaIlha(bd: Bd, agora: Date = new Date()): Promise<{ valendo: PunicaoDoPainel[]; kicks: PunicaoDoPainel[] }> {
  const campos = {
    id: lemnosPunicoes.id,
    usuarioId: lemnosPunicoes.usuarioId,
    apelido: usuarios.apelido,
    motivo: lemnosPunicoes.motivo,
    criadoEm: lemnosPunicoes.criadoEm,
    banidoAte: lemnosPunicoes.banidoAte,
    paraSempre: lemnosPunicoes.banidoParaSempre,
    desfeitaEm: lemnosPunicoes.desfeitaEm,
  };
  const comoLinha = ({ desfeitaEm, ...linha }: { desfeitaEm: Date | null } & Omit<PunicaoDoPainel, 'desfeita'>): PunicaoDoPainel => ({ ...linha, desfeita: desfeitaEm !== null });
  const valendo = await bd
    .select(campos)
    .from(lemnosPunicoes)
    .innerJoin(usuarios, eq(usuarios.id, lemnosPunicoes.usuarioId))
    .where(and(isNull(lemnosPunicoes.desfeitaEm), or(eq(lemnosPunicoes.banidoParaSempre, true), gte(lemnosPunicoes.banidoAte, agora))))
    .orderBy(desc(lemnosPunicoes.criadoEm));
  const kicks = await bd.select(campos).from(lemnosPunicoes).innerJoin(usuarios, eq(usuarios.id, lemnosPunicoes.usuarioId)).orderBy(desc(lemnosPunicoes.criadoEm)).limit(20);
  return { valendo: valendo.map(comoLinha), kicks: kicks.map(comoLinha) };
}

/** Mesmo matador e mesmo morto 5 vezes ou mais em 24 horas: pode ser alguém passando saque para outra conta. */
export async function paresSuspeitos(bd: Bd, agora: Date = new Date()): Promise<{ matador: string; morto: string; vezes: number }[]> {
  const matador = sql<string>`${lemnosEventos.detalhes}->>'matador'`;
  const morto = sql<string>`${lemnosEventos.detalhes}->>'morto'`;
  const linhas = await bd
    .select({ matador, morto, vezes: sql<number>`count(*)::int` })
    .from(lemnosEventos)
    .where(and(eq(lemnosEventos.tipo, 'morte'), gte(lemnosEventos.criadoEm, new Date(agora.getTime() - DIA_MS)), sql`${matador} is not null`))
    .groupBy(matador, morto)
    .having(sql`count(*) >= ${MORTES_SUSPEITAS}`)
    .orderBy(desc(sql`count(*)`));
  return linhas;
}
