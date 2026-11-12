import { and, eq, isNull } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { presentes, type ConteudoDoPresente, type Usuario } from '@/bd/esquema';
import { lancarMoeda } from './grana';
import { CATALOGO, itemDoCatalogo, type ItemDaLoja, type TipoDeItem } from './loja';
import { darAte } from './membros';

/**
 * O presente de boas-vindas do Premium (dono, 12/11/2026). Substitui os "itens de lançamento para sempre": a pessoa
 * escolhe um mutante para sempre, e os outros vêm por 10 dias, com alguns itens da loja por 25 dias.
 */
const DIA_MS = 24 * 60 * 60 * 1000;
export const DIAS_DOS_OUTROS_MUTANTES = 10;
export const DIAS_DOS_ITENS = 25;
export const ITENS_DO_PRESENTE = ['aviso-entrada', 'moldura-fogo', 'etiqueta-magnata'] as const;

/** Todo mutante da loja entra na escolha, inclusive os que forem lançados depois. */
export const MUTANTES_DO_PRESENTE: readonly ItemDaLoja[] = CATALOGO.filter((item) => item.tipo === 'mutante');

export class PresenteIndisponivel extends Error {}
export class EscolhaInvalida extends Error {}

export async function presenteFechado(bd: Bd, usuarioId: string): Promise<{ id: string; criadoEm: Date } | null> {
  const [presente] = await bd
    .select({ id: presentes.id, criadoEm: presentes.criadoEm })
    .from(presentes)
    .where(and(eq(presentes.usuarioId, usuarioId), eq(presentes.origem, 'premium'), isNull(presentes.abertoEm)));
  return presente ?? null;
}

export type PresenteFechado = { id: string; origem: 'premium' | 'convite'; conteudo: ConteudoDoPresente | null; recado: string | null; criadoEm: Date };

/** Todos os presentes ainda fechados da conta: o do Premium e o do convite. */
export async function presentesFechados(bd: Bd, usuarioId: string): Promise<PresenteFechado[]> {
  return bd
    .select({ id: presentes.id, origem: presentes.origem, conteudo: presentes.conteudo, recado: presentes.recado, criadoEm: presentes.criadoEm })
    .from(presentes)
    .where(and(eq(presentes.usuarioId, usuarioId), isNull(presentes.abertoEm)))
    .orderBy(presentes.criadoEm);
}

export type PresenteAberto = { mutante: ItemDaLoja; outros: ItemDaLoja[]; itens: ItemDaLoja[] };

/** Abre o presente uma vez só. O que a pessoa já tinha para sempre continua para sempre. */
export async function abrirPresente(bd: Bd, usuario: Pick<Usuario, 'id'>, mutanteId: string, agora: Date = new Date()): Promise<PresenteAberto> {
  const mutante = MUTANTES_DO_PRESENTE.find((item) => item.id === mutanteId);
  if (!mutante) throw new EscolhaInvalida();
  return bd.transaction(async (tx) => {
    const [presente] = await tx
      .select()
      .from(presentes)
      .where(and(eq(presentes.usuarioId, usuario.id), eq(presentes.origem, 'premium'), isNull(presentes.abertoEm)))
      .for('update');
    if (!presente) throw new PresenteIndisponivel();
    const outros = MUTANTES_DO_PRESENTE.filter((item) => item.id !== mutante.id);
    const itens = CATALOGO.filter((item) => (ITENS_DO_PRESENTE as readonly string[]).includes(item.id));
    await darAte(tx, usuario.id, mutante.id, null, agora);
    for (const item of outros) await darAte(tx, usuario.id, item.id, new Date(agora.getTime() + DIAS_DOS_OUTROS_MUTANTES * DIA_MS), agora);
    for (const item of itens) await darAte(tx, usuario.id, item.id, new Date(agora.getTime() + DIAS_DOS_ITENS * DIA_MS), agora);
    await tx.update(presentes).set({ abertoEm: agora, mutanteId: mutante.id }).where(eq(presentes.id, presente.id));
    return { mutante, outros, itens };
  });
}

/** Abre o presente que veio no convite: os itens contam os dias a partir de agora, e a Grana e as MagCoins caem na conta. */
export async function abrirPresenteDoConvite(bd: Bd, usuario: Pick<Usuario, 'id'>, presenteId: string, agora: Date = new Date()): Promise<ConteudoDoPresente> {
  return bd.transaction(async (tx) => {
    const [presente] = await tx
      .select()
      .from(presentes)
      .where(and(eq(presentes.id, presenteId), eq(presentes.usuarioId, usuario.id), eq(presentes.origem, 'convite'), isNull(presentes.abertoEm)))
      .for('update');
    if (!presente) throw new PresenteIndisponivel();
    const conteudo = presente.conteudo ?? {};
    for (const linha of conteudo.itens ?? []) {
      if (itemDoCatalogo(linha.itemId)) await darAte(tx, usuario.id, linha.itemId, new Date(agora.getTime() + linha.dias * DIA_MS), agora);
    }
    for (const moeda of ['grana', 'magcoin'] as const) {
      const quantidade = conteudo[moeda] ?? 0;
      if (quantidade > 0) await lancarMoeda(tx, { moeda, usuarioId: usuario.id, tipo: 'presente', quantidade, referencia: `presente:${presente.id}`, detalhes: { origem: 'convite' } });
    }
    await tx.update(presentes).set({ abertoEm: agora }).where(eq(presentes.id, presente.id));
    return conteudo;
  });
}

const numero = new Intl.NumberFormat('pt-BR');
// Curto, para caber numa linha: "Moldura Neon", "Cor do nome Vermelho". O aviso já se chama "Aviso de entrada".
const PREFIXO: Record<TipoDeItem, string> = { mutante: 'Mutante ', moldura: 'Moldura ', etiqueta: 'Etiqueta ', cor: 'Cor do nome ', aviso: '' };

/** O que tem no presente, uma linha por coisa, para o baú e a lista de convites. */
export function descreverPresente(conteudo: ConteudoDoPresente): string[] {
  const linhas = (conteudo.itens ?? []).flatMap((linha) => {
    const item = itemDoCatalogo(linha.itemId);
    return item ? [`${PREFIXO[item.tipo]}${item.nome} por ${linha.dias === 1 ? '1 dia' : `${linha.dias} dias`}`] : [];
  });
  if (conteudo.grana) linhas.push(`${numero.format(conteudo.grana)} de Grana`);
  if (conteudo.magcoin) linhas.push(conteudo.magcoin === 1 ? '1 MagCoin' : `${numero.format(conteudo.magcoin)} MagCoins`);
  return linhas;
}
