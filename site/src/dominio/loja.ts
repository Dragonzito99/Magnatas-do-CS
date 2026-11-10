import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { itensDoJogador, lancamentosDeGrana, usuarios, type Usuario } from '@/bd/esquema';
import { exigirAtivo } from './disponibilidade';
import { lancarGrana, lancarMoeda } from './grana';

/**
 * A Magnata Shop, primeira etapa: só itens de aparência, comprados com Grana por tempo. Nada aqui imita skin, arma,
 * faca, luva, patente ou medalha da Valve (regra dela, o servidor perderia a licença).
 */

export type TipoDeItem = 'cor' | 'etiqueta' | 'aviso' | 'moldura' | 'mutante';
export const DIAS_A_VENDA = [1, 3, 5, 9] as const;
export type DiasAVenda = (typeof DIAS_A_VENDA)[number];

/** Tabela aprovada pelo dono em 09/11/2026. Mudar aqui não mexe no que já foi pago: o preço fica gravado na compra. */
export const PRECOS: Record<TipoDeItem, Record<DiasAVenda, number>> = {
  cor: { 1: 80, 3: 200, 5: 300, 9: 480 },
  etiqueta: { 1: 100, 3: 250, 5: 380, 9: 600 },
  aviso: { 1: 60, 3: 150, 5: 230, 9: 370 },
  moldura: { 1: 80, 3: 200, 5: 300, 9: 480 },
  // Mutante com poder custa mais (dono, 10/11/2026).
  mutante: { 1: 200, 3: 550, 5: 850, 9: 1350 },
};

/** Para sempre, com MagCoin (dono, 10/11/2026): R$ 15 nos itens de aparência e R$ 30 no mutante. */
export const PRECOS_MAGCOIN: Record<TipoDeItem, number> = { cor: 150, etiqueta: 150, aviso: 150, moldura: 150, mutante: 300 };

export const NOME_DO_TIPO: Record<TipoDeItem, string> = {
  cor: 'Cor do nome',
  etiqueta: 'Etiqueta no chat',
  aviso: 'Aviso de entrada',
  moldura: 'Moldura do perfil',
  mutante: 'Mutante',
};

export type ItemDaLoja = {
  id: string;
  tipo: TipoDeItem;
  nome: string;
  /** Cor: o nome da cor do chat no CounterStrikeSharp. Etiqueta: o texto. Moldura: o nome da classe do site. */
  valor: string;
  /** Para a prévia no site. */
  corCss?: string;
  /** Foto do boneco, para a prévia dos mutantes. */
  imagem?: string;
  /** Falso nos itens que só os membros ganham: não aparecem na loja nem se compram. */
  venda?: boolean;
  /** Item de lançamento: o Premium ganha para sempre. */
  lancamento?: boolean;
  /** Os bonecos de cada nível, andando, que a vitrine mostra um depois do outro. */
  evolucoes?: { nivel: number; nome: string; imagem: string; escudo: number }[];
};

export const CATALOGO: readonly ItemDaLoja[] = [
  { id: 'cor-vermelha', tipo: 'cor', nome: 'Vermelho', valor: 'Red', corCss: '#ff4040' },
  { id: 'cor-verde', tipo: 'cor', nome: 'Verde', valor: 'Green', corCss: '#3fd34f' },
  { id: 'cor-azul', tipo: 'cor', nome: 'Azul', valor: 'Blue', corCss: '#4c7dff' },
  { id: 'cor-roxa', tipo: 'cor', nome: 'Roxo', valor: 'Purple', corCss: '#b05cff' },
  { id: 'cor-dourada', tipo: 'cor', nome: 'Dourado', valor: 'Gold', corCss: '#e4ae39' },
  { id: 'cor-laranja', tipo: 'cor', nome: 'Laranja', valor: 'Orange', corCss: '#ff8c1a' },
  { id: 'cor-rosa', tipo: 'cor', nome: 'Rosa', valor: 'Magenta', corCss: '#ff4fd8' },
  { id: 'cor-azul-claro', tipo: 'cor', nome: 'Azul-claro', valor: 'LightBlue', corCss: '#6fc8ff' },
  { id: 'etiqueta-magnata', tipo: 'etiqueta', nome: '[MAGNATA]', valor: '[MAGNATA]' },
  { id: 'etiqueta-chefao', tipo: 'etiqueta', nome: '[CHEFÃO]', valor: '[CHEFÃO]' },
  { id: 'etiqueta-don', tipo: 'etiqueta', nome: '[DON]', valor: '[DON]' },
  { id: 'etiqueta-patrao', tipo: 'etiqueta', nome: '[PATRÃO]', valor: '[PATRÃO]' },
  { id: 'etiqueta-lenda', tipo: 'etiqueta', nome: '[LENDA]', valor: '[LENDA]' },
  // Só dos membros (Bronze em diante), enquanto a assinatura vale.
  { id: 'etiqueta-apoiador', tipo: 'etiqueta', nome: '[APOIADOR]', valor: '[APOIADOR]', venda: false },
  { id: 'aviso-entrada', tipo: 'aviso', nome: 'Aviso de entrada', valor: '★ {apelido} chegou' },
  { id: 'moldura-dourada', tipo: 'moldura', nome: 'Dourada', valor: 'dourada' },
  { id: 'moldura-neon', tipo: 'moldura', nome: 'Neon', valor: 'neon' },
  { id: 'moldura-fogo', tipo: 'moldura', nome: 'Fogo', valor: 'fogo' },
  { id: 'moldura-gelo', tipo: 'moldura', nome: 'Gelo', valor: 'gelo' },
  // Exclusiva do Ouro e do Premium.
  { id: 'moldura-ouro', tipo: 'moldura', nome: 'Ouro exclusiva', valor: 'ouro', venda: false },
  // O valor é o nome do mutante no plugin da Mutação: o boneco e o poder no G vêm dele.
  {
    id: 'mutante-blindado',
    tipo: 'mutante',
    nome: 'Cyber Hulk (Blindado)',
    valor: 'blindado',
    imagem: '/loja/mutante-blindado.webp',
    lancamento: true,
    evolucoes: [
      { nivel: 1, nome: 'Cyber Hulk', imagem: '/loja/blindado-1-andando.webp', escudo: 2 },
      { nivel: 2, nome: 'Toxic Warlord', imagem: '/loja/blindado-2-andando.webp', escudo: 4 },
      { nivel: 3, nome: 'Venomclaw Titan', imagem: '/loja/blindado-3-andando.webp', escudo: 6 },
    ],
  },
];

const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_DO_CODIGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ItemInvalido extends Error {
  constructor() {
    super('Esse item não está à venda desse jeito.');
  }
}

export class JaEhSeu extends Error {
  constructor() {
    super('Esse item já é seu para sempre.');
  }
}

/** Itens que aparecem na loja (os dos membros ficam de fora). */
export const ITENS_A_VENDA = () => CATALOGO.filter((item) => item.venda !== false);

export function itemDoCatalogo(itemId: string): ItemDaLoja | undefined {
  return CATALOGO.find((item) => item.id === itemId);
}

/** Até o dono abrir (LOJA_ABERTA=sim), só o Adm vê a loja, para testar no site de verdade. */
export function lojaAberta(usuario: Pick<Usuario, 'papel' | 'estado'>, ambiente: Record<string, string | undefined> = process.env): boolean {
  if (usuario.estado !== 'ativo') return false;
  return ambiente.LOJA_ABERTA === 'sim' || usuario.papel === 'adm';
}

const valendo = (expiraEm: Date | null, agora: Date) => expiraEm === null || expiraEm.getTime() > agora.getTime();

/**
 * Compra um item por alguns dias. O código vem da tela, gerado antes do clique: o mesmo código duas vezes (clique duplo,
 * reenvio) é a mesma compra e não cobra de novo. Dias comprados somam ao fim atual se o item ainda vale.
 */
export async function comprarItem(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  pedido: { itemId: string; dias: number; codigo: string },
  agora: Date = new Date(),
): Promise<'comprado' | 'repetido'> {
  const item = itemDoCatalogo(pedido.itemId);
  const dias = DIAS_A_VENDA.find((opcao) => opcao === pedido.dias);
  if (!item || item.venda === false || !dias || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();
  const preco = PRECOS[item.tipo][dias];

  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    // Trava a conta: duas compras juntas passam uma de cada vez, e a segunda já vê o saldo da primeira.
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuario.id)).for('update');
    const { lancado } = await lancarGrana(tx, {
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { itemId: item.id, dias, preco },
    });
    if (!lancado) return 'repetido';

    const [atual] = await tx
      .select({ expiraEm: itensDoJogador.expiraEm })
      .from(itensDoJogador)
      .where(and(eq(itensDoJogador.usuarioId, usuario.id), eq(itensDoJogador.itemId, item.id)));
    if (atual && atual.expiraEm === null) return 'comprado';
    const inicio = atual?.expiraEm && atual.expiraEm.getTime() > agora.getTime() ? atual.expiraEm : agora;
    const expiraEm = new Date(inicio.getTime() + dias * DIA_MS);
    await tx
      .insert(itensDoJogador)
      .values({ usuarioId: usuario.id, itemId: item.id, expiraEm, atualizadoEm: agora })
      .onConflictDoUpdate({ target: [itensDoJogador.usuarioId, itensDoJogador.itemId], set: { expiraEm, atualizadoEm: agora } });
    return 'comprado';
  });
}

/**
 * Compra com MagCoin: o item fica para sempre. O mesmo código é a mesma compra; item que já é para sempre não se compra
 * de novo; o que estava por dias vira para sempre.
 */
export async function comprarParaSempre(
  bd: Bd,
  usuario: Pick<Usuario, 'id'>,
  pedido: { itemId: string; codigo: string },
  agora: Date = new Date(),
): Promise<'comprado' | 'repetido'> {
  const item = itemDoCatalogo(pedido.itemId);
  if (!item || item.venda === false || !FORMATO_DO_CODIGO.test(pedido.codigo)) throw new ItemInvalido();
  const preco = PRECOS_MAGCOIN[item.tipo];

  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuario.id)).for('update');
    const [repetida] = await tx
      .select({ id: lancamentosDeGrana.id })
      .from(lancamentosDeGrana)
      .where(and(eq(lancamentosDeGrana.usuarioId, usuario.id), eq(lancamentosDeGrana.moeda, 'magcoin'), eq(lancamentosDeGrana.tipo, 'compra'), eq(lancamentosDeGrana.referencia, pedido.codigo)));
    if (repetida) return 'repetido';
    const [atual] = await tx
      .select({ expiraEm: itensDoJogador.expiraEm })
      .from(itensDoJogador)
      .where(and(eq(itensDoJogador.usuarioId, usuario.id), eq(itensDoJogador.itemId, item.id)));
    if (atual && atual.expiraEm === null) throw new JaEhSeu();
    await lancarMoeda(tx, {
      moeda: 'magcoin',
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { itemId: item.id, paraSempre: true, preco },
    });
    await tx
      .insert(itensDoJogador)
      .values({ usuarioId: usuario.id, itemId: item.id, expiraEm: null, atualizadoEm: agora })
      .onConflictDoUpdate({ target: [itensDoJogador.usuarioId, itensDoJogador.itemId], set: { expiraEm: null, atualizadoEm: agora } });
    return 'comprado';
  });
}

/** Põe o item em uso e tira o que estava em uso do mesmo tipo. Só item que a pessoa tem e que ainda vale. */
export async function usarItem(bd: Bd, usuario: Pick<Usuario, 'id'>, itemId: string, agora: Date = new Date()): Promise<void> {
  const item = itemDoCatalogo(itemId);
  if (!item) throw new ItemInvalido();
  await bd.transaction(async (tx) => {
    const [posse] = await tx
      .select({ expiraEm: itensDoJogador.expiraEm })
      .from(itensDoJogador)
      .where(and(eq(itensDoJogador.usuarioId, usuario.id), eq(itensDoJogador.itemId, itemId)));
    if (!posse || !valendo(posse.expiraEm, agora)) throw new ItemInvalido();
    const mesmoTipo = CATALOGO.filter((candidato) => candidato.tipo === item.tipo).map((candidato) => candidato.id);
    await tx
      .update(itensDoJogador)
      .set({ usando: false, atualizadoEm: agora })
      .where(and(eq(itensDoJogador.usuarioId, usuario.id), inArray(itensDoJogador.itemId, mesmoTipo), ne(itensDoJogador.itemId, itemId)));
    await tx
      .update(itensDoJogador)
      .set({ usando: true, atualizadoEm: agora })
      .where(and(eq(itensDoJogador.usuarioId, usuario.id), eq(itensDoJogador.itemId, itemId)));
  });
}

export async function tirarItem(bd: Bd, usuario: Pick<Usuario, 'id'>, itemId: string): Promise<void> {
  await bd
    .update(itensDoJogador)
    .set({ usando: false, atualizadoEm: new Date() })
    .where(and(eq(itensDoJogador.usuarioId, usuario.id), eq(itensDoJogador.itemId, itemId)));
}

export type ItemDoBau = { item: ItemDaLoja; expiraEm: Date | null; vencido: boolean; usando: boolean; diasRestantes: number | null };

/** O baú da conta. Item vencido aparece vencido e nunca "em uso", sem depender de tarefa agendada. */
export async function bauDe(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<ItemDoBau[]> {
  const linhas = await bd.select().from(itensDoJogador).where(eq(itensDoJogador.usuarioId, usuarioId));
  const bau: ItemDoBau[] = [];
  for (const linha of linhas) {
    const item = itemDoCatalogo(linha.itemId);
    if (!item) continue;
    const vencido = !valendo(linha.expiraEm, agora);
    const diasRestantes = linha.expiraEm === null || vencido ? null : Math.ceil((linha.expiraEm.getTime() - agora.getTime()) / DIA_MS);
    bau.push({ item, expiraEm: linha.expiraEm, vencido, usando: linha.usando && !vencido, diasRestantes });
  }
  const ordem = (registro: ItemDoBau) => CATALOGO.indexOf(registro.item);
  return bau.sort((a, b) => Number(a.vencido) - Number(b.vencido) || ordem(a) - ordem(b));
}

export type Visual = { cor?: string; etiqueta?: string; aviso?: boolean; moldura?: string; mutante?: string; boneco?: string };

/** O que cada conta ativa está usando e ainda vale, pronto para o servidor e para as telas. */
export async function visuaisDe(bd: Bd, steamids: string[], agora: Date = new Date()): Promise<Record<string, Visual>> {
  if (steamids.length === 0) return {};
  const linhas = await bd
    .select({ steamid64: usuarios.steamid64, itemId: itensDoJogador.itemId, expiraEm: itensDoJogador.expiraEm })
    .from(itensDoJogador)
    .innerJoin(usuarios, eq(usuarios.id, itensDoJogador.usuarioId))
    .where(and(inArray(usuarios.steamid64, steamids), eq(usuarios.estado, 'ativo'), eq(itensDoJogador.usando, true)));
  const visuais: Record<string, Visual> = {};
  for (const linha of linhas) {
    const item = itemDoCatalogo(linha.itemId);
    if (!item || !valendo(linha.expiraEm, agora)) continue;
    const visual = (visuais[linha.steamid64] ??= {});
    if (item.tipo === 'cor') visual.cor = item.valor;
    if (item.tipo === 'etiqueta') visual.etiqueta = item.valor;
    if (item.tipo === 'aviso') visual.aviso = true;
    if (item.tipo === 'moldura') visual.moldura = item.valor;
    if (item.tipo === 'mutante') visual.mutante = item.valor;
  }
  const bonecos = await bd
    .select({ steamid64: usuarios.steamid64, boneco: usuarios.boneco })
    .from(usuarios)
    .where(and(inArray(usuarios.steamid64, steamids), eq(usuarios.estado, 'ativo'), isNotNull(usuarios.boneco)));
  for (const { steamid64, boneco } of bonecos) if (boneco) (visuais[steamid64] ??= {}).boneco = boneco;
  return visuais;
}

/** A moldura em uso de cada conta, pelo id, para o perfil e o ranking. */
export async function moldurasDe(bd: Bd, usuarioIds: string[], agora: Date = new Date()): Promise<Map<string, string>> {
  const molduras = new Map<string, string>();
  if (usuarioIds.length === 0) return molduras;
  const ids = CATALOGO.filter((item) => item.tipo === 'moldura').map((item) => item.id);
  const linhas = await bd
    .select({ usuarioId: itensDoJogador.usuarioId, itemId: itensDoJogador.itemId, expiraEm: itensDoJogador.expiraEm })
    .from(itensDoJogador)
    .where(and(inArray(itensDoJogador.usuarioId, usuarioIds), inArray(itensDoJogador.itemId, ids), eq(itensDoJogador.usando, true)));
  for (const linha of linhas) {
    const item = itemDoCatalogo(linha.itemId);
    if (item && valendo(linha.expiraEm, agora)) molduras.set(linha.usuarioId, item.valor);
  }
  return molduras;
}
