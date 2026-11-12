import { and, count, desc, eq, gte, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { itensDoJogador, lancamentosDeGrana, usuarios, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
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

/** Para sempre, com MagCoin (100 = R$ 10). O dono achou R$ 15 numa moldura caro demais e escolheu estes (11/11/2026). */
export const PRECOS_MAGCOIN: Record<TipoDeItem, number> = { cor: 50, etiqueta: 70, aviso: 50, moldura: 80, mutante: 150 };

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
  /** Item de lançamento: aparece no destaque da Shop. (O Premium não ganha mais todos: escolhe um no presente.) */
  lancamento?: boolean;
  /** O que o mutante faz, para o destaque da loja e a janela do item. */
  descricao?: string;
  /** Os bonecos de cada nível, andando, que a vitrine mostra um depois do outro, com o poder do G naquele nível. */
  evolucoes?: { nivel: number; nome: string; imagem: string; poder: string }[];
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
    descricao: 'Na Mutação, você vira esse mutante. Aperte E e fica sem levar dano por 2 s no nível 1, 4 s no nível 2 e 6 s no nível 3. Recarga de 15 s.',
    evolucoes: [
      { nivel: 1, nome: 'Cyber Hulk', imagem: '/loja/blindado-1-andando.webp', poder: 'escudo de 2 s' },
      { nivel: 2, nome: 'Toxic Warlord', imagem: '/loja/blindado-2-andando.webp', poder: 'escudo de 4 s' },
      { nivel: 3, nome: 'Venomclaw Titan', imagem: '/loja/blindado-3-andando.webp', poder: 'escudo de 6 s' },
    ],
  },
  // Senhor do Vazio (dono, 11/11/2026): o G solta uma cortina de fumaça roxa e custa 10% da vida, como o Smoke do
  // CrossFire. Um boneco por nível: Voidforged Warlord, Voidreaver Titan e Abyssal Void Titan.
  {
    id: 'mutante-fumaca',
    tipo: 'mutante',
    nome: 'Senhor do Vazio',
    valor: 'fumaca',
    imagem: '/loja/mutante-fumaca.webp',
    lancamento: true,
    descricao:
      'Na Mutação, você vira esse mutante. Aperte E e solta uma cortina de fumaça roxa de 8 s no nível 1, 10 s no nível 2 e 12 s no nível 3. Cada fumaça custa 10% da sua vida. Recarga de 15 s.',
    evolucoes: [
      { nivel: 1, nome: 'Voidforged Warlord', imagem: '/loja/fumaca-1-andando.webp', poder: 'fumaça de 8 s' },
      { nivel: 2, nome: 'Voidreaver Titan', imagem: '/loja/fumaca-2-andando.webp', poder: 'fumaça de 10 s' },
      { nivel: 3, nome: 'Abyssal Void Titan', imagem: '/loja/fumaca-3-andando.webp', poder: 'fumaça de 12 s' },
    ],
  },
  // HEALIX (dono, 11/11/2026): o E recupera vida; do nível 2 pula mais alto; no nível 3 ganha pulo duplo, com o
  // segundo pulo mais baixo. Um boneco por nível: Neon Night Nurse, Cybernetic Plague Nurse e Neon Nightingale.
  {
    id: 'mutante-healix',
    tipo: 'mutante',
    nome: 'HEALIX',
    valor: 'healix',
    imagem: '/loja/mutante-healix.webp',
    lancamento: true,
    descricao:
      'Na Mutação, você vira essa mutante. Aperte E e recupera 30% da vida em 3 s (recarga de 15 s). No nível 2 pula mais alto; no nível 3 ganha pulo duplo.',
    evolucoes: [
      { nivel: 1, nome: 'Neon Night Nurse', imagem: '/loja/healix-1-andando.webp', poder: 'cura 30%' },
      { nivel: 2, nome: 'Cybernetic Plague Nurse', imagem: '/loja/healix-2-andando.webp', poder: 'cura e pulo alto' },
      { nivel: 3, nome: 'Neon Nightingale', imagem: '/loja/healix-3-andando.webp', poder: 'cura, pulo alto e duplo' },
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

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

/** A cor do cartão na vitrine, como nas lojas de jogo (dono, 11/11/2026). Vai pelo tipo do item. */
export const RARIDADE: Record<TipoDeItem, Raridade> = { cor: 'comum', etiqueta: 'raro', aviso: 'raro', moldura: 'epico', mutante: 'lendario' };
export const NOME_DA_RARIDADE: Record<Raridade, string> = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário' };

export type Oferta = { itemId: string; desconto: number };

/** Desconto em % de cada oferta do dia, na ordem. Vale só para a Grana; o MagCoin não tem oferta. */
const DESCONTOS_DO_DIA = [30, 25, 20, 20];
/** Brasília não tem horário de verão desde 2019: o dia vira às 03:00 UTC. */
const FUSO_DE_BRASILIA_MS = 3 * 60 * 60 * 1000;

const diaDeBrasilia = (agora: Date) => new Date(agora.getTime() - FUSO_DE_BRASILIA_MS).toISOString().slice(0, 10);

/** Um número fixo para cada dia, para sortear as mesmas ofertas para todos o dia inteiro. */
function sementeDoDia(dia: string): () => number {
  let semente = 2166136261;
  for (const letra of dia) semente = Math.imul(semente ^ letra.charCodeAt(0), 16777619);
  return () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let mistura = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    mistura = (mistura + Math.imul(mistura ^ (mistura >>> 7), 61 | mistura)) ^ mistura;
    return ((mistura ^ (mistura >>> 14)) >>> 0) / 4294967296;
  };
}

/** As 4 ofertas do dia de Brasília: itens de aparência sorteados pela data, os mesmos para todos até a meia-noite. */
export function ofertasDoDia(agora: Date = new Date()): Oferta[] {
  const sorteio = sementeDoDia(diaDeBrasilia(agora));
  const candidatos = ITENS_A_VENDA().filter((item) => item.tipo !== 'mutante');
  for (let indice = candidatos.length - 1; indice > 0; indice--) {
    const outro = Math.floor(sorteio() * (indice + 1));
    [candidatos[indice], candidatos[outro]] = [candidatos[outro], candidatos[indice]];
  }
  return DESCONTOS_DO_DIA.map((desconto, indice) => ({ itemId: candidatos[indice].id, desconto }));
}

/** Quando as ofertas de hoje acabam: a próxima meia-noite de Brasília. */
export function fimDasOfertas(agora: Date = new Date()): Date {
  const [ano, mes, dia] = diaDeBrasilia(agora).split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1) + FUSO_DE_BRASILIA_MS);
}

export function descontoDeHoje(item: Pick<ItemDaLoja, 'id'>, agora: Date = new Date()): number {
  return ofertasDoDia(agora).find((oferta) => oferta.itemId === item.id)?.desconto ?? 0;
}

/** O preço em Grana agora, com o desconto da oferta do dia quando o item está nela. */
export function precoDeHoje(item: Pick<ItemDaLoja, 'id' | 'tipo'>, dias: DiasAVenda, agora: Date = new Date()): number {
  return Math.round((PRECOS[item.tipo][dias] * (100 - descontoDeHoje(item, agora))) / 100);
}

/** Os itens mais comprados com Grana ou MagCoin nos últimos 30 dias, do mais para o menos. */
export async function maisComprados(bd: Bd, agora: Date = new Date(), limite = 2): Promise<string[]> {
  const item = sql<string>`${lancamentosDeGrana.detalhes}->>'itemId'`;
  const linhas = await bd
    .select({ itemId: item, vezes: count() })
    .from(lancamentosDeGrana)
    .where(and(eq(lancamentosDeGrana.tipo, 'compra'), gte(lancamentosDeGrana.criadoEm, new Date(agora.getTime() - 30 * DIA_MS))))
    .groupBy(item)
    .orderBy(desc(count()), item)
    .limit(limite);
  return linhas.map((linha) => linha.itemId).filter((id) => itemDoCatalogo(id));
}

/** Até o dono abrir (LOJA_ABERTA=sim), só o Adm vê a loja, para testar no site de verdade. */
export function lojaAberta(usuario: Pick<Usuario, 'papel' | 'estado'>, ambiente: Record<string, string | undefined> = process.env): boolean {
  if (usuario.estado !== 'ativo') return false;
  return ambiente.LOJA_ABERTA === 'sim' || usuario.papel === 'adm';
}

const valendo = (expiraEm: Date | null, agora: Date) => expiraEm === null || expiraEm.getTime() > agora.getTime();

/**
 * Põe um item no Baú, por compra ou por prêmio. dias null = para sempre. Por dias, soma ao fim atual se o item ainda
 * vale; o que já é para sempre continua para sempre.
 */
export async function darItem(tx: Transacao, usuarioId: string, itemId: string, dias: number | null, agora: Date): Promise<void> {
  const [atual] = await tx
    .select({ expiraEm: itensDoJogador.expiraEm })
    .from(itensDoJogador)
    .where(and(eq(itensDoJogador.usuarioId, usuarioId), eq(itensDoJogador.itemId, itemId)));
  if (atual && atual.expiraEm === null) return;
  let expiraEm: Date | null = null;
  if (dias !== null) {
    const inicio = atual?.expiraEm && atual.expiraEm.getTime() > agora.getTime() ? atual.expiraEm : agora;
    expiraEm = new Date(inicio.getTime() + dias * DIA_MS);
  }
  await tx
    .insert(itensDoJogador)
    .values({ usuarioId, itemId, expiraEm, atualizadoEm: agora })
    .onConflictDoUpdate({ target: [itensDoJogador.usuarioId, itensDoJogador.itemId], set: { expiraEm, atualizadoEm: agora } });
}

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
  const preco = precoDeHoje(item, dias, agora);
  const desconto = descontoDeHoje(item, agora);

  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, usuario);
    // Trava a conta: duas compras juntas passam uma de cada vez, e a segunda já vê o saldo da primeira.
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuario.id)).for('update');
    const { lancado } = await lancarGrana(tx, {
      usuarioId: usuario.id,
      tipo: 'compra',
      quantidade: -preco,
      referencia: pedido.codigo,
      detalhes: { itemId: item.id, dias, preco, ...(desconto ? { desconto } : {}) },
    });
    if (!lancado) return 'repetido';
    await darItem(tx, usuario.id, item.id, dias, agora);
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
    await darItem(tx, usuario.id, item.id, null, agora);
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

/** `adm`: só para o servidor liberar os comandos de Adm no jogo (os banners). */
export type Visual = { cor?: string; etiqueta?: string; aviso?: boolean; moldura?: string; mutante?: string; boneco?: string; adm?: boolean };

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
  const contas = await bd
    .select({ steamid64: usuarios.steamid64, boneco: usuarios.boneco, papel: usuarios.papel })
    .from(usuarios)
    .where(and(inArray(usuarios.steamid64, steamids), eq(usuarios.estado, 'ativo'), or(isNotNull(usuarios.boneco), eq(usuarios.papel, 'adm'))));
  for (const { steamid64, boneco, papel } of contas) {
    if (boneco) (visuais[steamid64] ??= {}).boneco = boneco;
    if (papel === 'adm') (visuais[steamid64] ??= {}).adm = true;
  }
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
