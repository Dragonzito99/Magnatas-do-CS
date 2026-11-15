import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lemnosItens, lemnosSessoes, servidoresDiversao, type Usuario } from '@/bd/esquema';
import { nomeLemnos, saqueLemnos } from './catalogo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstatisticasDaSessao = {
  id: string;
  iniciadaEm: Date;
  encerradaEm: Date | null;
  fim: (typeof lemnosSessoes.$inferSelect)['fim'];
  minutos: number;
  abates: number;
  mortes: number;
  extracoes: number;
  granaGanha: number;
  guardados: { itemId: string; nome: string }[];
  perdidos: { itemId: string; nome: string }[];
  valorDoSaque: number;
};

/** O resumo de uma sessão, só para a própria conta: a tela que aparece quando o jogador sai da ilha. */
export async function estatisticasDaSessao(bd: Bd, usuarioId: string, sessaoId: string): Promise<EstatisticasDaSessao | null> {
  if (!UUID.test(sessaoId)) return null;
  const [sessao] = await bd.select().from(lemnosSessoes).where(and(eq(lemnosSessoes.id, sessaoId), eq(lemnosSessoes.usuarioId, usuarioId)));
  if (!sessao) return null;
  const itens = await bd.select().from(lemnosItens).where(eq(lemnosItens.sessaoId, sessao.id));
  const guardados = itens.filter((item) => item.origem === 'achado' && item.situacao !== 'perdido').map((item) => ({ itemId: item.itemId, nome: nomeLemnos(item.itemId) }));
  const perdidos = itens.filter((item) => item.situacao === 'perdido').map((item) => ({ itemId: item.itemId, nome: nomeLemnos(item.itemId) }));
  const fimDaConta = sessao.encerradaEm ?? new Date();
  return {
    id: sessao.id,
    iniciadaEm: sessao.iniciadaEm,
    encerradaEm: sessao.encerradaEm,
    fim: sessao.fim,
    minutos: Math.max(Math.round((fimDaConta.getTime() - sessao.iniciadaEm.getTime()) / 60_000), 0),
    abates: sessao.abates,
    mortes: sessao.mortes,
    extracoes: sessao.extracoes,
    granaGanha: sessao.granaGanha,
    guardados,
    perdidos,
    valorDoSaque: guardados.reduce((soma, item) => soma + (saqueLemnos(item.itemId)?.valor ?? 0), 0),
  };
}

export async function marcarSessaoVista(bd: Bd, usuarioId: string, sessaoId: string, agora: Date = new Date()): Promise<void> {
  if (!UUID.test(sessaoId)) return;
  await bd
    .update(lemnosSessoes)
    .set({ vistaEm: agora })
    .where(and(eq(lemnosSessoes.id, sessaoId), eq(lemnosSessoes.usuarioId, usuarioId), isNull(lemnosSessoes.vistaEm), isNotNull(lemnosSessoes.encerradaEm)));
}

/** A última sessão encerrada que o jogador ainda não viu: vira o aviso do sino. */
export async function sessaoNaoVista(bd: Bd, usuarioId: string): Promise<{ id: string } | null> {
  const [sessao] = await bd
    .select({ id: lemnosSessoes.id })
    .from(lemnosSessoes)
    .where(and(eq(lemnosSessoes.usuarioId, usuarioId), isNotNull(lemnosSessoes.encerradaEm), isNull(lemnosSessoes.vistaEm)))
    .orderBy(desc(lemnosSessoes.encerradaEm))
    .limit(1);
  return sessao ?? null;
}

/** As últimas sessões, para a página da ilha. */
export function sessoesRecentes(bd: Bd, usuarioId: string, limite = 5) {
  return bd
    .select()
    .from(lemnosSessoes)
    .where(and(eq(lemnosSessoes.usuarioId, usuarioId), isNotNull(lemnosSessoes.encerradaEm)))
    .orderBy(desc(lemnosSessoes.encerradaEm))
    .limit(limite);
}

/** Enquanto o servidor não abre para todos (dono decide), só o Adm vê as telas da ilha. */
export async function ilhaAberta(bd: Bd, usuario: Pick<Usuario, 'papel' | 'estado'>): Promise<boolean> {
  if (usuario.estado !== 'ativo') return false;
  if (usuario.papel === 'adm') return true;
  const [servidor] = await bd.select({ ativo: servidoresDiversao.ativo }).from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos'));
  return servidor?.ativo === true;
}
