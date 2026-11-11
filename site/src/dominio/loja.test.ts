import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { itensDoJogador, lancamentosDeGrana, usuarios, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar } from '@/bd/teste';
import { ContaSemAcesso } from './disponibilidade';
import { lancarGrana, lancarMoeda, SaldoInsuficiente } from './grana';
import { bauDe, CATALOGO, comprarItem, comprarParaSempre, DIAS_A_VENDA, fimDasOfertas, ITENS_A_VENDA, itemDoCatalogo, ItemInvalido, JaEhSeu, lojaAberta, maisComprados, moldurasDe, ofertasDoDia, PRECOS, PRECOS_MAGCOIN, precoDeHoje, RARIDADE, tirarItem, usarItem, visuaisDe } from './loja';

let bd: Bd;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-10T12:00:00Z');

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

async function contaCom(grana: number, valores: Partial<Usuario> = {}): Promise<Usuario> {
  const conta = await criarUsuario(bd, { estado: 'ativo', ...valores });
  if (grana > 0) await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: grana, referencia: 'inicio' }));
  return recarregar(bd, conta);
}

const comprar = (conta: Usuario, itemId: string, dias: number, agora = AGORA, codigo = randomUUID()) => comprarItem(bd, conta, { itemId, dias, codigo }, agora);
const posse = async (conta: Usuario, itemId: string) =>
  (await bd.select().from(itensDoJogador).where(eq(itensDoJogador.usuarioId, conta.id))).find((item) => item.itemId === itemId);

test('os preços são os da tabela aprovada pelo dono', () => {
  expect(DIAS_A_VENDA).toEqual([1, 3, 5, 9]);
  expect(PRECOS).toEqual({
    cor: { 1: 80, 3: 200, 5: 300, 9: 480 },
    etiqueta: { 1: 100, 3: 250, 5: 380, 9: 600 },
    aviso: { 1: 60, 3: 150, 5: 230, 9: 370 },
    moldura: { 1: 80, 3: 200, 5: 300, 9: 480 },
    mutante: { 1: 200, 3: 550, 5: 850, 9: 1350 },
  });
});

test('o catálogo tem os quatro tipos, ids únicos, e nenhuma etiqueta parece cargo da equipe', () => {
  expect(new Set(CATALOGO.map((item) => item.tipo))).toEqual(new Set(['cor', 'etiqueta', 'aviso', 'moldura', 'mutante']));
  expect(new Set(CATALOGO.map((item) => item.id)).size).toBe(CATALOGO.length);
  for (const item of CATALOGO.filter((candidato) => candidato.tipo === 'etiqueta')) {
    expect(item.valor).not.toMatch(/ADM|GM|STAFF|EQUIPE|MOD/i);
  }
});

test('comprar cobra o preço, guarda o que foi pago e põe o item no baú pelos dias comprados', async () => {
  const conta = await contaCom(500);
  expect(await comprar(conta, 'cor-verde', 3)).toBe('comprado');
  expect((await recarregar(bd, conta)).grana).toBe(300);
  const [linha] = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.tipo, 'compra'));
  expect(linha).toMatchObject({ quantidade: -200, detalhes: { itemId: 'cor-verde', dias: 3, preco: 200 } });
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toEqual(new Date(AGORA.getTime() + 3 * DIA));
});

test('sem saldo a compra é recusada e nada é gravado', async () => {
  const conta = await contaCom(50);
  await expect(comprar(conta, 'cor-verde', 1)).rejects.toBeInstanceOf(SaldoInsuficiente);
  expect((await recarregar(bd, conta)).grana).toBe(50);
  expect(await posse(conta, 'cor-verde')).toBeUndefined();
});

test('o mesmo código de compra cobra uma vez só (clique duplo)', async () => {
  const conta = await contaCom(500);
  const codigo = randomUUID();
  expect(await comprar(conta, 'cor-verde', 1, AGORA, codigo)).toBe('comprado');
  expect(await comprar(conta, 'cor-verde', 1, AGORA, codigo)).toBe('repetido');
  expect((await recarregar(bd, conta)).grana).toBe(420);
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toEqual(new Date(AGORA.getTime() + DIA));
});

test('duas compras ao mesmo tempo com saldo para uma: uma passa, o saldo não fica negativo', async () => {
  const conta = await contaCom(100);
  const resultados = await Promise.allSettled([comprar(conta, 'cor-verde', 1), comprar(conta, 'cor-azul', 1)]);
  expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
  expect((await recarregar(bd, conta)).grana).toBe(20);
  expect(await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.tipo, 'compra'))).toHaveLength(1);
});

test('comprar o item que ainda vale soma os dias ao fim atual', async () => {
  const conta = await contaCom(1000);
  await comprar(conta, 'cor-verde', 3);
  await comprar(conta, 'cor-verde', 5, new Date(AGORA.getTime() + DIA));
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toEqual(new Date(AGORA.getTime() + 8 * DIA));
});

test('comprar o item que já venceu conta de agora', async () => {
  const conta = await contaCom(1000);
  await comprar(conta, 'cor-verde', 1);
  const depois = new Date(AGORA.getTime() + 10 * DIA);
  await comprar(conta, 'cor-verde', 1, depois);
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toEqual(new Date(depois.getTime() + DIA));
});

test('item permanente continua permanente ao comprar dias', async () => {
  const conta = await contaCom(1000);
  await bd.insert(itensDoJogador).values({ usuarioId: conta.id, itemId: 'cor-verde', expiraEm: null });
  await comprar(conta, 'cor-verde', 1);
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toBeNull();
});

test('item ou dias fora da tabela são recusados', async () => {
  const conta = await contaCom(1000);
  await expect(comprar(conta, 'skin-ak47', 1)).rejects.toBeInstanceOf(ItemInvalido);
  await expect(comprar(conta, 'cor-verde', 2)).rejects.toBeInstanceOf(ItemInvalido);
  await expect(comprarItem(bd, conta, { itemId: 'cor-verde', dias: 1, codigo: 'qualquer' }, AGORA)).rejects.toBeInstanceOf(ItemInvalido);
  expect((await recarregar(bd, conta)).grana).toBe(1000);
});

test('conta suspensa não compra', async () => {
  const conta = await contaCom(1000);
  await bd.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, conta.id));
  await expect(comprar(conta, 'cor-verde', 1)).rejects.toBeInstanceOf(ContaSemAcesso);
});

test('usar um item troca o que estava em uso do mesmo tipo, e não mexe nos outros tipos', async () => {
  const conta = await contaCom(2000);
  await comprar(conta, 'cor-verde', 1);
  await comprar(conta, 'cor-azul', 1);
  await comprar(conta, 'etiqueta-don', 1);
  await usarItem(bd, conta, 'etiqueta-don', AGORA);
  await usarItem(bd, conta, 'cor-verde', AGORA);
  await usarItem(bd, conta, 'cor-azul', AGORA);
  expect((await posse(conta, 'cor-verde'))?.usando).toBe(false);
  expect((await posse(conta, 'cor-azul'))?.usando).toBe(true);
  expect((await posse(conta, 'etiqueta-don'))?.usando).toBe(true);
  await tirarItem(bd, conta, 'cor-azul');
  expect((await posse(conta, 'cor-azul'))?.usando).toBe(false);
});

test('não dá para usar item que não tem ou que venceu', async () => {
  const conta = await contaCom(1000);
  await expect(usarItem(bd, conta, 'cor-verde', AGORA)).rejects.toBeInstanceOf(ItemInvalido);
  await comprar(conta, 'cor-verde', 1);
  await expect(usarItem(bd, conta, 'cor-verde', new Date(AGORA.getTime() + 2 * DIA))).rejects.toBeInstanceOf(ItemInvalido);
});

test('o baú mostra dias restantes, e o item vencido aparece vencido e fora de uso', async () => {
  const conta = await contaCom(1000);
  await comprar(conta, 'cor-verde', 3);
  await comprar(conta, 'etiqueta-don', 1);
  await usarItem(bd, conta, 'cor-verde', AGORA);
  await usarItem(bd, conta, 'etiqueta-don', AGORA);
  const bau = await bauDe(bd, conta.id, new Date(AGORA.getTime() + 2 * DIA));
  const cor = bau.find((item) => item.item.id === 'cor-verde');
  const etiqueta = bau.find((item) => item.item.id === 'etiqueta-don');
  expect(cor).toMatchObject({ vencido: false, usando: true, diasRestantes: 1 });
  expect(etiqueta).toMatchObject({ vencido: true, usando: false });
});

test('o servidor recebe só o que está em uso e valendo, de contas ativas', async () => {
  const conta = await contaCom(2000);
  const outra = await contaCom(2000);
  await comprar(conta, 'cor-dourada', 3);
  await comprar(conta, 'etiqueta-don', 1);
  await comprar(conta, 'aviso-entrada', 3);
  await comprar(conta, 'moldura-neon', 3);
  for (const id of ['cor-dourada', 'etiqueta-don', 'aviso-entrada', 'moldura-neon']) await usarItem(bd, conta, id, AGORA);
  await comprar(outra, 'cor-verde', 1);
  await usarItem(bd, outra, 'cor-verde', AGORA);
  await bd.update(usuarios).set({ estado: 'banido' }).where(eq(usuarios.id, outra.id));

  const depois = new Date(AGORA.getTime() + 2 * DIA);
  expect(await visuaisDe(bd, [conta.steamid64, outra.steamid64, '123'], depois)).toEqual({
    [conta.steamid64]: { cor: 'Gold', aviso: true, moldura: 'neon' },
  });
});

test('a loja fica fechada para todos menos o Adm até ser aberta', () => {
  const jogador = { papel: 'jogador', estado: 'ativo' } as const;
  const adm = { papel: 'adm', estado: 'ativo' } as const;
  expect(lojaAberta(jogador, {})).toBe(false);
  expect(lojaAberta(adm, {})).toBe(true);
  expect(lojaAberta(jogador, { LOJA_ABERTA: 'sim' })).toBe(true);
  expect(lojaAberta({ papel: 'jogador', estado: 'suspenso' }, { LOJA_ABERTA: 'sim' })).toBe(false);
});

test('a moldura em uso e valendo aparece pelo id da conta', async () => {
  const conta = await contaCom(1000);
  const outra = await contaCom(1000);
  await comprar(conta, 'moldura-fogo', 3);
  await usarItem(bd, conta, 'moldura-fogo', AGORA);
  await comprar(outra, 'moldura-gelo', 1);
  await usarItem(bd, outra, 'moldura-gelo', AGORA);
  const molduras = await moldurasDe(bd, [conta.id, outra.id], new Date(AGORA.getTime() + 2 * DIA));
  expect([...molduras]).toEqual([[conta.id, 'fogo']]);
});

test('o mutante Blindado está à venda com imagem, e o servidor recebe qual mutante usar', async () => {
  const blindado = CATALOGO.find((item) => item.id === 'mutante-blindado');
  expect(blindado).toMatchObject({ tipo: 'mutante', valor: 'blindado', imagem: '/loja/mutante-blindado.webp' });
  expect(blindado?.evolucoes).toEqual([
    { nivel: 1, nome: 'Cyber Hulk', imagem: '/loja/blindado-1-andando.webp', poder: 'escudo de 2 s' },
    { nivel: 2, nome: 'Toxic Warlord', imagem: '/loja/blindado-2-andando.webp', poder: 'escudo de 4 s' },
    { nivel: 3, nome: 'Venomclaw Titan', imagem: '/loja/blindado-3-andando.webp', poder: 'escudo de 6 s' },
  ]);
  expect(blindado?.descricao).toBe('Na Mutação, você vira esse mutante. Aperte E e fica sem levar dano por 2 s no nível 1, 4 s no nível 2 e 6 s no nível 3. Recarga de 15 s.');
  const conta = await contaCom(2000);
  await comprar(conta, 'mutante-blindado', 1);
  expect((await recarregar(bd, conta)).grana).toBe(1800);
  await usarItem(bd, conta, 'mutante-blindado', AGORA);
  expect(await visuaisDe(bd, [conta.steamid64], AGORA)).toEqual({ [conta.steamid64]: { mutante: 'blindado' } });
});

test('o Senhor do Vazio está à venda: fumaça no E e um boneco por nível', async () => {
  const fumaca = CATALOGO.find((item) => item.id === 'mutante-fumaca');
  expect(fumaca).toMatchObject({ tipo: 'mutante', valor: 'fumaca', nome: 'Senhor do Vazio', imagem: '/loja/mutante-fumaca.webp' });
  // Os dois mutantes passam juntos no destaque da loja (dono, 11/11/2026).
  expect(fumaca?.lancamento).toBe(true);
  expect(fumaca?.evolucoes).toEqual([
    { nivel: 1, nome: 'Voidforged Warlord', imagem: '/loja/fumaca-1-andando.webp', poder: 'fumaça de 8 s' },
    { nivel: 2, nome: 'Voidreaver Titan', imagem: '/loja/fumaca-2-andando.webp', poder: 'fumaça de 10 s' },
    { nivel: 3, nome: 'Abyssal Void Titan', imagem: '/loja/fumaca-3-andando.webp', poder: 'fumaça de 12 s' },
  ]);
  expect(fumaca?.descricao).toBe(
    'Na Mutação, você vira esse mutante. Aperte E e solta uma cortina de fumaça roxa de 8 s no nível 1, 10 s no nível 2 e 12 s no nível 3. Cada fumaça custa 10% da sua vida. Recarga de 15 s.',
  );
  // Nenhum mutante da loja fica sem o próprio texto: a janela do item mostra a descrição dele.
  expect(CATALOGO.filter((item) => item.tipo === 'mutante' && !item.descricao)).toEqual([]);
  const conta = await contaCom(2000);
  await comprar(conta, 'mutante-fumaca', 1);
  await usarItem(bd, conta, 'mutante-fumaca', AGORA);
  expect(await visuaisDe(bd, [conta.steamid64], AGORA)).toEqual({ [conta.steamid64]: { mutante: 'fumaca' } });
});

test('o boneco próprio vai junto com os itens, só da conta dele e só enquanto ativa', async () => {
  const BONECO = 'models/magnatas/marfioso_v1/mutante.vmdl';
  const dono = await criarUsuario(bd, { estado: 'ativo', boneco: BONECO });
  const outra = await contaCom(1000);
  expect(await visuaisDe(bd, [dono.steamid64, outra.steamid64], AGORA)).toEqual({ [dono.steamid64]: { boneco: BONECO } });
  await bd.update(usuarios).set({ estado: 'banido' }).where(eq(usuarios.id, dono.id));
  expect(await visuaisDe(bd, [dono.steamid64], AGORA)).toEqual({});
});

async function contaComMagcoin(magcoin: number): Promise<Usuario> {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'pagamento', quantidade: magcoin, referencia: 'mp' }));
  return recarregar(bd, conta);
}

test('preço para sempre em MagCoin: 150 nos itens de aparência e 300 no mutante', () => {
  expect(PRECOS_MAGCOIN).toEqual({ cor: 150, etiqueta: 150, aviso: 150, moldura: 150, mutante: 300 });
});

test('comprar com MagCoin dá o item para sempre e cobra uma vez pelo mesmo código', async () => {
  const conta = await contaComMagcoin(400);
  const codigo = randomUUID();
  expect(await comprarParaSempre(bd, conta, { itemId: 'mutante-blindado', codigo })).toBe('comprado');
  expect(await comprarParaSempre(bd, conta, { itemId: 'mutante-blindado', codigo })).toBe('repetido');
  const atual = await recarregar(bd, conta);
  expect([atual.magcoin, atual.grana]).toEqual([100, 0]);
  expect((await posse(conta, 'mutante-blindado'))?.expiraEm).toBeNull();
});

test('item que já é para sempre não se compra de novo, e comprar por dias não tira o para sempre', async () => {
  const conta = await contaComMagcoin(400);
  await comprarParaSempre(bd, conta, { itemId: 'cor-verde', codigo: randomUUID() });
  await expect(comprarParaSempre(bd, conta, { itemId: 'cor-verde', codigo: randomUUID() })).rejects.toBeInstanceOf(JaEhSeu);
  expect((await recarregar(bd, conta)).magcoin).toBe(250);
});

test('item que estava por dias vira para sempre', async () => {
  const conta = await contaCom(500);
  await bd.transaction((tx) => lancarMoeda(tx, { moeda: 'magcoin', usuarioId: conta.id, tipo: 'pagamento', quantidade: 150, referencia: 'mp' }));
  await comprar(conta, 'cor-verde', 3);
  await comprarParaSempre(bd, conta, { itemId: 'cor-verde', codigo: randomUUID() });
  expect((await posse(conta, 'cor-verde'))?.expiraEm).toBeNull();
});

test('sem MagCoin suficiente, nada muda', async () => {
  const conta = await contaComMagcoin(100);
  await expect(comprarParaSempre(bd, conta, { itemId: 'cor-verde', codigo: randomUUID() })).rejects.toBeInstanceOf(SaldoInsuficiente);
  expect(await posse(conta, 'cor-verde')).toBeUndefined();
});

test('itens dos membros não estão à venda, nem por Grana nem por MagCoin', async () => {
  const conta = await contaComMagcoin(400);
  for (const id of ['etiqueta-apoiador', 'moldura-ouro']) {
    expect(itemDoCatalogo(id)?.venda).toBe(false);
    await expect(comprarParaSempre(bd, conta, { itemId: id, codigo: randomUUID() })).rejects.toBeInstanceOf(ItemInvalido);
    await expect(comprar(conta, id, 1)).rejects.toBeInstanceOf(ItemInvalido);
  }
  expect(itemDoCatalogo('mutante-blindado')?.lancamento).toBe(true);
});

test('raridade por tipo: cor comum, etiqueta e aviso raros, moldura épica, mutante lendário', () => {
  expect(RARIDADE).toEqual({ cor: 'comum', etiqueta: 'raro', aviso: 'raro', moldura: 'epico', mutante: 'lendario' });
});

test('as ofertas do dia são 4 itens à venda, sem mutante, iguais para todos no mesmo dia de Brasília', () => {
  const manha = new Date('2026-11-10T04:00:00Z'); // 01:00 em Brasília
  const noite = new Date('2026-11-11T02:30:00Z'); // 23:30 em Brasília, mesmo dia
  const ofertas = ofertasDoDia(manha);
  expect(ofertas).toHaveLength(4);
  expect(ofertasDoDia(noite)).toEqual(ofertas);
  expect(new Set(ofertas.map((oferta) => oferta.itemId)).size).toBe(4);
  expect(ofertas.map((oferta) => oferta.desconto)).toEqual([30, 25, 20, 20]);
  const aVenda = new Set(ITENS_A_VENDA().filter((item) => item.tipo !== 'mutante').map((item) => item.id));
  for (const oferta of ofertas) expect(aVenda.has(oferta.itemId)).toBe(true);
});

test('as ofertas mudam à meia-noite de Brasília', () => {
  const dias = Array.from({ length: 7 }, (_, indice) => ofertasDoDia(new Date(Date.UTC(2026, 10, 10 + indice, 15))).map((oferta) => oferta.itemId).join());
  expect(new Set(dias).size).toBeGreaterThan(1);
  expect(fimDasOfertas(new Date('2026-11-10T04:00:00Z'))).toEqual(new Date('2026-11-11T03:00:00Z'));
  expect(fimDasOfertas(new Date('2026-11-11T02:59:59Z'))).toEqual(new Date('2026-11-11T03:00:00Z'));
});

test('o preço de hoje tem o desconto da oferta só nos itens da oferta', () => {
  const [oferta] = ofertasDoDia(AGORA);
  const item = itemDoCatalogo(oferta.itemId)!;
  expect(precoDeHoje(item, 3, AGORA)).toBe(Math.round((PRECOS[item.tipo][3] * (100 - oferta.desconto)) / 100));
  const foraDaOferta = ITENS_A_VENDA().find((candidato) => candidato.tipo === 'mutante')!;
  expect(precoDeHoje(foraDaOferta, 3, AGORA)).toBe(PRECOS.mutante[3]);
});

test('comprar um item da oferta cobra o preço com desconto e guarda o desconto', async () => {
  const [oferta] = ofertasDoDia(AGORA);
  const item = itemDoCatalogo(oferta.itemId)!;
  const preco = precoDeHoje(item, 1, AGORA);
  const conta = await contaCom(1000);
  await comprar(conta, item.id, 1);
  expect((await recarregar(bd, conta)).grana).toBe(1000 - preco);
  const [linha] = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.tipo, 'compra'));
  expect(linha.detalhes).toEqual({ itemId: item.id, dias: 1, preco, desconto: oferta.desconto });
});

test('mais comprados: os itens com mais compras nos últimos 30 dias, sem contar ajustes', async () => {
  const conta = await contaCom(5000);
  await comprar(conta, 'moldura-fogo', 1);
  await comprar(conta, 'moldura-fogo', 1);
  await comprar(conta, 'etiqueta-don', 1);
  for (let vez = 0; vez < 3; vez++) await comprar(conta, 'cor-azul', 1);
  await bd
    .update(lancamentosDeGrana)
    .set({ criadoEm: new Date(AGORA.getTime() - 40 * DIA) })
    .where(sql`${lancamentosDeGrana.detalhes}->>'itemId' = 'cor-azul'`);
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: -1, referencia: 'x', detalhes: { itemId: 'cor-roxa' } }));
  expect(await maisComprados(bd, AGORA, 2)).toEqual(['moldura-fogo', 'etiqueta-don']);
});
