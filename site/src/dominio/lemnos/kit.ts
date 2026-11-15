import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lemnosItens, lemnosKits, lemnosSessoes, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from '@/dominio/disponibilidade';
import { ItemInvalido } from '@/dominio/loja';
import { armaLemnos, granadaLemnos, MOCHILA_BASICA, mochilaLemnos, PISTOLA_DE_GRACA } from './catalogo';

/** Com a sessão aberta, o kit não muda: para trocar de arma, o jogador sai do servidor (dono). */
export class EmCampo extends Error {
  constructor() {
    super('Você está na Ilha Lemnos agora. Saia do servidor para trocar o kit.');
  }
}

export type KitEscolhido = { principal: string | null; secundaria: string | null; granadas: string[]; mochila: string | null };
/** gratis: a Glock de quem entrou sem secundária. Não tem linha, nunca cai no chão e nunca vira arma achada. */
export type PecaDoKit = { linha: string | null; classe: string; magcoin: boolean; gratis: boolean };
export type KitDaEntrada = { principal: PecaDoKit | null; secundaria: PecaDoKit; granadas: PecaDoKit[]; espacos: number };

const KIT_VAZIO: KitEscolhido = { principal: null, secundaria: null, granadas: [], mochila: null };
const LIMITE_DE_GRANADAS: Record<string, number> = { hegrenade: 1, flashbang: 2, smokegrenade: 1, molotov: 1 };
const MAXIMO_DE_GRANADAS = 4;
const ESPACOS_DA_BASICA = 8;

/** Linha que pode entrar no kit: guardada no baú e, se tem prazo, ainda valendo. */
const usavel = (agora: Date) => and(eq(lemnosItens.situacao, 'no_bau'), or(isNull(lemnosItens.expiraEm), gt(lemnosItens.expiraEm, agora)));

export async function sessaoAbertaDe(bd: Bd | Transacao, usuarioId: string): Promise<{ id: string } | null> {
  const [aberta] = await bd.select({ id: lemnosSessoes.id }).from(lemnosSessoes).where(and(eq(lemnosSessoes.usuarioId, usuarioId), isNull(lemnosSessoes.encerradaEm)));
  return aberta ?? null;
}

async function quantasUsaveis(tx: Transacao, usuarioId: string, tipo: 'arma' | 'granada' | 'mochila', itemId: string, agora: Date): Promise<number> {
  const [linha] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(lemnosItens)
    .where(and(eq(lemnosItens.usuarioId, usuarioId), eq(lemnosItens.tipo, tipo), eq(lemnosItens.itemId, itemId), usavel(agora)));
  return linha?.total ?? 0;
}

/** Salva o que o jogador vai levar. Só vale escolher o que ele tem agora no baú, e cada coisa no lugar dela. */
export async function escolherKit(bd: Bd, usuario: Pick<Usuario, 'id'>, kit: KitEscolhido, agora: Date = new Date()): Promise<void> {
  const contagem = new Map<string, number>();
  for (const granada of kit.granadas) contagem.set(granada, (contagem.get(granada) ?? 0) + 1);
  if (kit.granadas.length > MAXIMO_DE_GRANADAS) throw new ItemInvalido();
  for (const [granada, quantas] of contagem) if (!granadaLemnos(granada) || quantas > (LIMITE_DE_GRANADAS[granada] ?? 0)) throw new ItemInvalido();
  if (kit.principal !== null && armaLemnos(kit.principal)?.lugar !== 'principal') throw new ItemInvalido();
  if (kit.secundaria !== null && armaLemnos(kit.secundaria)?.lugar !== 'secundaria') throw new ItemInvalido();
  if (kit.mochila !== null && (!mochilaLemnos(kit.mochila) || kit.mochila === MOCHILA_BASICA)) throw new ItemInvalido();

  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    if (await sessaoAbertaDe(tx, usuario.id)) throw new EmCampo();
    for (const arma of [kit.principal, kit.secundaria]) if (arma !== null && (await quantasUsaveis(tx, usuario.id, 'arma', arma, agora)) < 1) throw new ItemInvalido();
    for (const [granada, quantas] of contagem) if ((await quantasUsaveis(tx, usuario.id, 'granada', granada, agora)) < quantas) throw new ItemInvalido();
    if (kit.mochila !== null && (await quantasUsaveis(tx, usuario.id, 'mochila', kit.mochila, agora)) < 1) throw new ItemInvalido();
    const valores = { principal: kit.principal, secundaria: kit.secundaria, granadas: kit.granadas, mochila: kit.mochila, atualizadoEm: agora };
    await tx.insert(lemnosKits).values({ usuarioId: usuario.id, ...valores }).onConflictDoUpdate({ target: lemnosKits.usuarioId, set: valores });
  });
}

export async function kitDe(bd: Bd | Transacao, usuarioId: string): Promise<KitEscolhido> {
  const [salvo] = await bd.select().from(lemnosKits).where(eq(lemnosKits.usuarioId, usuarioId));
  return salvo ? { principal: salvo.principal, secundaria: salvo.secundaria, granadas: salvo.granadas, mochila: salvo.mochila } : { ...KIT_VAZIO };
}

/**
 * Pega uma linha usável do item e põe em campo nesta sessão. A de Magcoin vem primeiro (ela nunca se perde); entre as
 * de grana e achadas, a mais antiga. Sem nenhuma, devolve null.
 */
async function separarUma(tx: Transacao, usuarioId: string, sessaoId: string, tipo: 'arma' | 'granada', itemId: string, agora: Date, jaUsadas: string[]): Promise<{ id: string; origem: string } | null> {
  const [linha] = await tx
    .select({ id: lemnosItens.id, origem: lemnosItens.origem })
    .from(lemnosItens)
    .where(
      and(
        eq(lemnosItens.usuarioId, usuarioId),
        eq(lemnosItens.tipo, tipo),
        eq(lemnosItens.itemId, itemId),
        usavel(agora),
        jaUsadas.length > 0 ? sql`${lemnosItens.id} not in (${sql.join(jaUsadas.map((id) => sql`${id}`), sql`, `)})` : undefined,
      ),
    )
    .orderBy(sql`case when ${lemnosItens.origem} = 'magcoin' then 0 else 1 end`, asc(lemnosItens.criadoEm), asc(lemnosItens.id))
    .limit(1)
    .for('update');
  if (!linha) return null;
  await tx.update(lemnosItens).set({ situacao: 'em_campo', sessaoId, atualizadoEm: agora }).where(eq(lemnosItens.id, linha.id));
  return linha;
}

/** Monta o kit de uma vida na ilha: as unidades saem do baú e ficam em campo até a morte, a extração ou a saída. */
export async function separarKit(tx: Transacao, usuarioId: string, sessaoId: string, agora: Date): Promise<KitDaEntrada> {
  const kit = await kitDe(tx, usuarioId);
  const usadas: string[] = [];
  const peca = async (tipo: 'arma' | 'granada', itemId: string, classe: string): Promise<PecaDoKit | null> => {
    const linha = await separarUma(tx, usuarioId, sessaoId, tipo, itemId, agora, usadas);
    if (!linha) return null;
    usadas.push(linha.id);
    return { linha: linha.id, classe, magcoin: linha.origem === 'magcoin', gratis: false };
  };

  const principal = kit.principal ? await peca('arma', kit.principal, armaLemnos(kit.principal)?.classe ?? '') : null;
  const secundaria = (kit.secundaria ? await peca('arma', kit.secundaria, armaLemnos(kit.secundaria)?.classe ?? '') : null) ?? {
    linha: null,
    classe: PISTOLA_DE_GRACA.classe,
    magcoin: false,
    gratis: true,
  };
  const granadas: PecaDoKit[] = [];
  for (const granada of kit.granadas) {
    const separada = await peca('granada', granada, granadaLemnos(granada)?.classe ?? '');
    if (separada) granadas.push(separada);
  }

  let espacos = ESPACOS_DA_BASICA;
  if (kit.mochila && (await quantasUsaveis(tx, usuarioId, 'mochila', kit.mochila, agora)) > 0) espacos = mochilaLemnos(kit.mochila)?.espacos ?? ESPACOS_DA_BASICA;

  return { principal, secundaria, granadas, espacos };
}

/** As linhas em campo de uma sessão (para morte, saída e queda). */
export function linhasEmCampo(tx: Transacao, sessaoId: string) {
  return tx.select().from(lemnosItens).where(and(eq(lemnosItens.sessaoId, sessaoId), eq(lemnosItens.situacao, 'em_campo')));
}

export const ORIGENS_QUE_SE_PERDEM = ['grana', 'achado'] as const;
