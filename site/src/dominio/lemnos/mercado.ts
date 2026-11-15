import { and, eq, inArray, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, lemnosItens, usuarios, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from '@/dominio/disponibilidade';
import { lancarGrana, lancarMoeda } from '@/dominio/grana';
import { DIAS_A_VENDA, FORMATO_DO_CODIGO, ItemInvalido, JaEhSeu, type DiasAVenda } from '@/dominio/loja';
import { armaLemnos, granadaLemnos, MOCHILA_BASICA, mochilaLemnos, nomeLemnos, saqueLemnos } from './catalogo';

const DIA_MS = 24 * 60 * 60 * 1000;
const MAXIMO_POR_COMPRA = 10;

type TipoDoItem = (typeof lemnosItens.$inferSelect)['tipo'];

export type ItemDoBauLemnos = {
  linha: string;
  tipo: TipoDoItem;
  itemId: string;
  nome: string;
  origem: (typeof lemnosItens.$inferSelect)['origem'];
  expiraEm: Date | null;
  vencido: boolean;
  emCampo: boolean;
};

const diasValidos = (dias: number | null): dias is DiasAVenda | null => dias === null || DIAS_A_VENDA.some((opcao) => opcao === dias);

async function travarConta(tx: Transacao, usuario: Pick<Usuario, 'id'>) {
  await exigirAtivo(tx, usuario);
  // Duas compras juntas passam uma de cada vez, e a segunda já vê o saldo da primeira.
  await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuario.id)).for('update');
}

/**
 * Arma ou granada de uso único, paga com grana: uma linha por unidade e uma linha só no livro-caixa. O código vem da
 * tela, gerado antes do clique; o mesmo código de novo é a mesma compra.
 */
export async function comprarComGrana(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  pedido: { itemId: string; quantidade: number; codigo: string },
  agora: Date = new Date(),
): Promise<'comprado' | 'repetido'> {
  const arma = armaLemnos(pedido.itemId);
  const granada = granadaLemnos(pedido.itemId);
  const item = arma ?? granada;
  const quantidade = pedido.quantidade;
  if (!item || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_POR_COMPRA || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();
  const preco = item.precoGrana * quantidade;

  return bd.transaction(async (tx) => {
    await travarConta(tx, usuario);
    const { lancado } = await lancarGrana(tx, {
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { lemnos: true, itemId: item.id, quantidade, preco },
    });
    if (!lancado) return 'repetido';
    const tipo: 'arma' | 'granada' = arma ? 'arma' : 'granada';
    await tx.insert(lemnosItens).values(Array.from({ length: quantidade }, () => ({ usuarioId: usuario.id, tipo, itemId: item.id, origem: 'grana' as const, criadoEm: agora, atualizadoEm: agora })));
    return 'comprado';
  });
}

/**
 * A linha de uma coisa que se compra por dias ou para sempre (arma de Magcoin, mochila). Comprar de novo soma os dias no
 * fim atual, ou a partir de agora se já venceu; o que é para sempre não se compra de novo.
 */
async function estenderOuCriar(
  tx: Transacao,
  usuarioId: string,
  item: { tipo: 'arma' | 'mochila'; itemId: string; origem: 'grana' | 'magcoin' },
  dias: DiasAVenda | null,
  agora: Date,
) {
  const [atual] = await tx
    .select()
    .from(lemnosItens)
    .where(
      and(
        eq(lemnosItens.usuarioId, usuarioId),
        eq(lemnosItens.tipo, item.tipo),
        eq(lemnosItens.itemId, item.itemId),
        // Mochila de grana e de Magcoin somam na mesma linha; arma, só a de Magcoin (a de grana é de uso único).
        item.tipo === 'arma' ? eq(lemnosItens.origem, 'magcoin') : inArray(lemnosItens.origem, ['grana', 'magcoin']),
        inArray(lemnosItens.situacao, ['no_bau', 'em_campo']),
      ),
    );
  if (atual && atual.expiraEm === null) throw new JaEhSeu();
  let expiraEm: Date | null = null;
  if (dias !== null) {
    const inicio = atual?.expiraEm && atual.expiraEm.getTime() > agora.getTime() ? atual.expiraEm : agora;
    expiraEm = new Date(inicio.getTime() + dias * DIA_MS);
  }
  if (atual) {
    await tx
      .update(lemnosItens)
      .set({ expiraEm, atualizadoEm: agora, ...(dias === null ? { origem: 'magcoin' as const } : {}) })
      .where(eq(lemnosItens.id, atual.id));
    return;
  }
  await tx.insert(lemnosItens).values({ usuarioId, tipo: item.tipo, itemId: item.itemId, origem: item.origem, expiraEm, criadoEm: agora, atualizadoEm: agora });
}

/** Arma com Magcoin, por dias ou para sempre (dias null). Ela volta ao baú quando o jogador morre. */
export async function comprarArmaComMagcoin(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  pedido: { itemId: string; dias: DiasAVenda | null; codigo: string },
  agora: Date = new Date(),
): Promise<'comprado' | 'repetido'> {
  const arma = armaLemnos(pedido.itemId);
  if (!arma || !diasValidos(pedido.dias) || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();
  const preco = pedido.dias === null ? arma.precoMagcoinSempre : arma.precoMagcoinDias[pedido.dias];

  return bd.transaction(async (tx) => {
    await travarConta(tx, usuario);
    const { lancado } = await lancarMoeda(tx, {
      moeda: 'magcoin',
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { lemnos: true, itemId: arma.id, dias: pedido.dias, paraSempre: pedido.dias === null, preco },
    });
    if (!lancado) return 'repetido';
    await estenderOuCriar(tx, usuario.id, { tipo: 'arma', itemId: arma.id, origem: 'magcoin' }, pedido.dias, agora);
    return 'comprado';
  });
}

/** Mochila maior: por dias com grana, ou para sempre (dias null) com Magcoin (dono). A básica todo mundo já tem. */
export async function comprarMochila(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  pedido: { itemId: string; dias: DiasAVenda | null; codigo: string },
  agora: Date = new Date(),
): Promise<'comprado' | 'repetido'> {
  const mochila = mochilaLemnos(pedido.itemId);
  if (!mochila || mochila.id === MOCHILA_BASICA || !diasValidos(pedido.dias) || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();
  const paraSempre = pedido.dias === null;
  const preco = paraSempre ? mochila.precoMagcoinSempre : mochila.precoGranaDias?.[pedido.dias as DiasAVenda];
  if (!preco) throw new ItemInvalido();

  return bd.transaction(async (tx) => {
    await travarConta(tx, usuario);
    const { lancado } = await lancarMoeda(tx, {
      moeda: paraSempre ? 'magcoin' : 'grana',
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { lemnos: true, itemId: mochila.id, dias: pedido.dias, paraSempre, preco },
    });
    if (!lancado) return 'repetido';
    await estenderOuCriar(tx, usuario.id, { tipo: 'mochila', itemId: mochila.id, origem: paraSempre ? 'magcoin' : 'grana' }, pedido.dias, agora);
    return 'comprado';
  });
}

/** Vende saque que está no baú. Tudo de uma vez numa linha de venda; o mesmo código de novo não paga duas vezes. */
export async function venderSaque(bd: Bd, usuario: Pick<Usuario, 'id'>, pedido: { linhas: string[]; codigo: string }): Promise<{ grana: number } | 'repetido'> {
  const linhas = [...new Set(pedido.linhas)];
  if (linhas.length === 0 || linhas.length > 200 || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();

  return bd.transaction(async (tx) => {
    await travarConta(tx, usuario);
    // Reenvio da mesma venda: o código já pagou.
    const [feita] = await tx
      .select({ id: lancamentosDeGrana.id })
      .from(lancamentosDeGrana)
      .where(and(eq(lancamentosDeGrana.usuarioId, usuario.id), eq(lancamentosDeGrana.tipo, 'venda'), eq(lancamentosDeGrana.referencia, pedido.codigo)));
    if (feita) return 'repetido';
    const achadas = await tx
      .select()
      .from(lemnosItens)
      .where(and(eq(lemnosItens.usuarioId, usuario.id), inArray(lemnosItens.id, linhas), eq(lemnosItens.tipo, 'saque'), eq(lemnosItens.situacao, 'no_bau')))
      .for('update');
    const total = achadas.reduce((soma, linha) => soma + (saqueLemnos(linha.itemId)?.valor ?? 0), 0);
    if (achadas.length !== linhas.length || total <= 0) throw new ItemInvalido();
    await lancarGrana(tx, { usuarioId: usuario.id, tipo: 'venda', quantidade: total, referencia: pedido.codigo, detalhes: { lemnos: true, itens: achadas.map((linha) => linha.itemId) } });
    await tx.update(lemnosItens).set({ situacao: 'vendido', atualizadoEm: new Date() }).where(inArray(lemnosItens.id, linhas));
    return { grana: total };
  });
}

/** O baú da extração: o que está guardado e o que está em campo agora, com nome e se já venceu. */
export async function bauDaLemnos(bd: Bd | Transacao, usuarioId: string, agora: Date = new Date()): Promise<ItemDoBauLemnos[]> {
  const linhas = await bd
    .select()
    .from(lemnosItens)
    .where(and(eq(lemnosItens.usuarioId, usuarioId), or(eq(lemnosItens.situacao, 'no_bau'), eq(lemnosItens.situacao, 'em_campo'))))
    .orderBy(lemnosItens.criadoEm);
  return linhas.map((linha) => ({
    linha: linha.id,
    tipo: linha.tipo,
    itemId: linha.itemId,
    nome: nomeLemnos(linha.itemId),
    origem: linha.origem,
    expiraEm: linha.expiraEm,
    vencido: linha.expiraEm !== null && linha.expiraEm.getTime() <= agora.getTime(),
    emCampo: linha.situacao === 'em_campo',
  }));
}
