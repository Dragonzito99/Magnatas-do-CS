import { and, eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lancamentosDeGrana, lemnosEventos, lemnosItens, lemnosPunicoes, lemnosSessoes, xpPartidas, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario, recarregar, STEAM_A, STEAM_B } from '@/bd/teste';
import { ItemInvalido } from '@/dominio/loja';
import { escolherKit } from './kit';
import { entrarNaIlha, extrair, fecharSessoesDaPorta, morrer, renascer, SessaoEncerrada, sair } from './sessoes';

let bd: Bd;
let ana: Usuario;
let beto: Usuario;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-15T12:00:00Z');
let numero = 0;
const ref = () => `lemnos:27024:${(numero += 1)}`;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  ana = await criarUsuario(bd, { estado: 'ativo', steamid64: STEAM_A });
  beto = await criarUsuario(bd, { estado: 'ativo', steamid64: STEAM_B });
});

async function dar(conta: Usuario, tipo: 'arma' | 'granada' | 'mochila', itemId: string, origem: 'grana' | 'magcoin' = 'grana', expiraEm: Date | null = null) {
  const [linha] = await bd.insert(lemnosItens).values({ usuarioId: conta.id, tipo, itemId, origem, expiraEm }).returning();
  return linha.id;
}
const linha = async (id: string) => (await bd.select().from(lemnosItens).where(eq(lemnosItens.id, id)))[0];
const sessaoDe = async (id: string) => (await bd.select().from(lemnosSessoes).where(eq(lemnosSessoes.id, id)))[0];

async function entrar(conta: Usuario, steamid64: string, agora = AGORA) {
  const resposta = await entrarNaIlha(bd, { porta: 27024, steamid64, referencia: ref() }, agora);
  if (!resposta.ok) throw new Error(resposta.motivo);
  return resposta;
}

test('entrar abre sessão e põe o kit em campo', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  const resposta = await entrar(ana, STEAM_A);
  expect(resposta.kit.principal).toMatchObject({ linha: ak, classe: 'weapon_ak47' });
  expect(resposta.adm).toBe(false);
  expect(await linha(ak)).toMatchObject({ situacao: 'em_campo', sessaoId: resposta.sessao });
  expect(await sessaoDe(resposta.sessao)).toMatchObject({ usuarioId: ana.id, porta: 27024, encerradaEm: null, espacos: 8 });
});

test('entrar duas vezes com a mesma referência devolve a mesma sessão', async () => {
  const referencia = ref();
  const primeira = await entrarNaIlha(bd, { porta: 27024, steamid64: STEAM_A, referencia }, AGORA);
  const segunda = await entrarNaIlha(bd, { porta: 27024, steamid64: STEAM_A, referencia }, AGORA);
  expect(segunda).toEqual(primeira);
  expect(await bd.select().from(lemnosSessoes)).toHaveLength(1);
});

test('a entrada diz ao servidor quem é o Adm (para o !marcar)', async () => {
  const adm = await criarUsuario(bd, { estado: 'ativo', papel: 'adm', steamid64: '76561198000000099' });
  expect(adm.papel).toBe('adm');
  expect((await entrar(adm, '76561198000000099')).adm).toBe(true);
});

test('quem não é membro ativo fica de fora', async () => {
  expect(await entrarNaIlha(bd, { porta: 27024, steamid64: '76561198000009999', referencia: ref() }, AGORA)).toEqual({ ok: false, motivo: 'nao_membro', ate: null });
});

test('entrar com sessão aberta fecha a velha como queda e devolve as armas', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  const velha = await entrar(ana, STEAM_A);
  const nova = await entrar(ana, STEAM_A);
  expect(await sessaoDe(velha.sessao)).toMatchObject({ fim: 'queda' });
  expect(nova.sessao).not.toBe(velha.sessao);
  expect(nova.kit.principal?.linha).toBe(ak);
  expect(await linha(ak)).toMatchObject({ situacao: 'em_campo', sessaoId: nova.sessao });
});

test('banido recebe motivo banido e nada abre', async () => {
  await bd.insert(lemnosPunicoes).values({ usuarioId: ana.id, motivo: 'afk', banidoAte: new Date(AGORA.getTime() + DIA) });
  const resposta = await entrarNaIlha(bd, { porta: 27024, steamid64: STEAM_A, referencia: ref() }, AGORA);
  expect(resposta).toEqual({ ok: false, motivo: 'banido', ate: new Date(AGORA.getTime() + DIA).toISOString() });
  expect(await bd.select().from(lemnosSessoes)).toEqual([]);
});

test('extrair guarda o saque, soma o maço como grana tipo lemnos e uma vez só', async () => {
  const { sessao } = await entrar(ana, STEAM_A);
  const pedido = { sessao, referencia: ref(), saque: ['joias', 'maco_de_notas', 'maco_de_notas'], armas: [], gastas: [] };
  expect(await extrair(bd, pedido, AGORA)).toEqual({ linhasNovas: [], grana: 16 });
  expect(await extrair(bd, pedido, AGORA)).toEqual({ linhasNovas: [], grana: 16 });
  const saque = await bd.select().from(lemnosItens).where(and(eq(lemnosItens.usuarioId, ana.id), eq(lemnosItens.tipo, 'saque')));
  expect(saque.map((item) => [item.itemId, item.situacao, item.origem])).toEqual([['joias', 'no_bau', 'achado']]);
  const grana = await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.usuarioId, ana.id));
  expect(grana.map((item) => [item.tipo, item.quantidade])).toEqual([['lemnos', 16]]);
  expect((await recarregar(bd, ana)).grana).toBe(16);
  expect(await sessaoDe(sessao)).toMatchObject({ extracoes: 1, granaGanha: 16 });
});

test('extrair mais saque que os espaços da sessão é recusado', async () => {
  const { sessao } = await entrar(ana, STEAM_A);
  await expect(extrair(bd, { sessao, referencia: ref(), saque: Array(9).fill('relogio'), armas: [], gastas: [] }, AGORA)).rejects.toThrow(ItemInvalido);
});

test('arma achada extraída vira linha em campo; a de graça e a do kit não', async () => {
  const { sessao } = await entrar(ana, STEAM_A);
  const resposta = await extrair(
    bd,
    { sessao, referencia: ref(), saque: [], armas: [{ linha: null, classe: 'weapon_awp' }, { linha: null, classe: 'weapon_negev' }], gastas: [] },
    AGORA,
  );
  expect(resposta.linhasNovas).toHaveLength(1);
  expect(resposta.linhasNovas[0].classe).toBe('weapon_awp');
  expect(await linha(resposta.linhasNovas[0].linha)).toMatchObject({ tipo: 'arma', itemId: 'awp', origem: 'achado', situacao: 'em_campo', sessaoId: sessao });
});

test('granada lançada vira gasta', async () => {
  const flash = await dar(ana, 'granada', 'flashbang');
  await escolherKit(bd, ana, { principal: null, secundaria: null, granadas: ['flashbang'], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  await extrair(bd, { sessao, referencia: ref(), saque: [], armas: [], gastas: [flash] }, AGORA);
  expect((await linha(flash)).situacao).toBe('gasto');
});

test('morrer perde a AK de grana e devolve a de Magcoin; o abate entra na sessão do matador', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  const deagle = await dar(ana, 'arma', 'deagle', 'magcoin', new Date(AGORA.getTime() + DIA));
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: 'deagle', granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  const doBeto = await entrar(beto, STEAM_B);
  await morrer(bd, { sessao, referencia: ref(), matador: STEAM_B, gastas: [] }, AGORA);
  expect((await linha(ak)).situacao).toBe('perdido');
  expect((await linha(deagle)).situacao).toBe('no_bau');
  expect(await sessaoDe(sessao)).toMatchObject({ mortes: 1 });
  expect(await sessaoDe(doBeto.sessao)).toMatchObject({ abates: 1 });
  const [evento] = await bd.select().from(lemnosEventos).where(eq(lemnosEventos.tipo, 'morte'));
  expect(evento.detalhes).toEqual({ matador: STEAM_B, morto: STEAM_A });
});

test('arma de Magcoin vencida na sessão volta ao baú vencida e não entra no próximo kit', async () => {
  const awp = await dar(ana, 'arma', 'awp', 'magcoin', new Date(AGORA.getTime() + 60_000));
  await escolherKit(bd, ana, { principal: 'awp', secundaria: null, granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  const depois = new Date(AGORA.getTime() + DIA);
  await morrer(bd, { sessao, referencia: ref(), matador: null, gastas: [] }, depois);
  expect((await linha(awp)).situacao).toBe('no_bau');
  expect((await renascer(bd, { sessao, referencia: ref() }, depois)).kit.principal).toBeNull();
});

test('renascer separa um kit novo', async () => {
  await dar(ana, 'arma', 'ak47');
  const segunda = await dar(ana, 'arma', 'ak47');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  await morrer(bd, { sessao, referencia: ref(), matador: null, gastas: [] }, AGORA);
  expect((await renascer(bd, { sessao, referencia: ref() }, AGORA)).kit.principal?.linha).toBe(segunda);
});

test('sair na safe zone devolve o que está na mão; o que não está se perde', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  const deagle = await dar(ana, 'arma', 'deagle');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: 'deagle', granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  await sair(bd, { sessao, referencia: ref(), motivo: 'saiu', naSafeZone: true, gastas: [], armas: [{ linha: ak, classe: 'weapon_ak47' }] }, AGORA);
  expect((await linha(ak)).situacao).toBe('no_bau');
  expect((await linha(deagle)).situacao).toBe('perdido');
  expect(await sessaoDe(sessao)).toMatchObject({ fim: 'saiu' });
  expect((await sessaoDe(sessao)).encerradaEm).not.toBeNull();
});

test('sair fora da safe zone perde como morte', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  await sair(bd, { sessao, referencia: ref(), motivo: 'saiu', naSafeZone: false, gastas: [], armas: [{ linha: ak, classe: 'weapon_ak47' }] }, AGORA);
  expect((await linha(ak)).situacao).toBe('perdido');
  expect(await sessaoDe(sessao)).toMatchObject({ fim: 'morreu_saindo' });
});

test('kick perde como morte, mesmo na safe zone, e conta na escada', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  const { sessao } = await entrar(ana, STEAM_A);
  await sair(bd, { sessao, referencia: ref(), motivo: 'kick_afk', naSafeZone: true, gastas: [], armas: [{ linha: ak, classe: 'weapon_ak47' }] }, AGORA);
  expect((await linha(ak)).situacao).toBe('perdido');
  expect(await sessaoDe(sessao)).toMatchObject({ fim: 'kick_afk' });
  expect(await bd.select().from(lemnosPunicoes).where(eq(lemnosPunicoes.usuarioId, ana.id))).toHaveLength(1);
});

test('saída lança o XP dos abates', async () => {
  const { sessao } = await entrar(ana, STEAM_A);
  await entrar(beto, STEAM_B);
  const doBeto = (await bd.select().from(lemnosSessoes).where(eq(lemnosSessoes.usuarioId, beto.id)))[0];
  await morrer(bd, { sessao: doBeto.id, referencia: ref(), matador: STEAM_A, gastas: [] }, AGORA);
  await sair(bd, { sessao, referencia: ref(), motivo: 'saiu', naSafeZone: true, gastas: [], armas: [] }, AGORA);
  const [xp] = await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, ana.id));
  expect(xp).toMatchObject({ xp: 20, abates: 1 });
});

test('fecharSessoesDaPorta devolve as armas de todas as sessões abertas da porta', async () => {
  const ak = await dar(ana, 'arma', 'ak47');
  const awp = await dar(beto, 'arma', 'awp');
  await escolherKit(bd, ana, { principal: 'ak47', secundaria: null, granadas: [], mochila: null }, AGORA);
  await escolherKit(bd, beto, { principal: 'awp', secundaria: null, granadas: [], mochila: null }, AGORA);
  await entrar(ana, STEAM_A);
  await entrar(beto, STEAM_B);
  const referencia = ref();
  expect(await fecharSessoesDaPorta(bd, { porta: 27024, referencia }, AGORA)).toBe(2);
  expect(await fecharSessoesDaPorta(bd, { porta: 27024, referencia }, AGORA)).toBe(2);
  expect((await linha(ak)).situacao).toBe('no_bau');
  expect((await linha(awp)).situacao).toBe('no_bau');
  expect((await bd.select().from(lemnosSessoes)).every((sessao) => sessao.fim === 'queda')).toBe(true);
});

test('extrair ou renascer numa sessão encerrada lança SessaoEncerrada; morrer e sair repetidos não fazem nada', async () => {
  const { sessao } = await entrar(ana, STEAM_A);
  await sair(bd, { sessao, referencia: ref(), motivo: 'saiu', naSafeZone: true, gastas: [], armas: [] }, AGORA);
  await expect(extrair(bd, { sessao, referencia: ref(), saque: [], armas: [], gastas: [] }, AGORA)).rejects.toThrow(SessaoEncerrada);
  await expect(renascer(bd, { sessao, referencia: ref() }, AGORA)).rejects.toThrow(SessaoEncerrada);
  await morrer(bd, { sessao, referencia: ref(), matador: null, gastas: [] }, AGORA);
  await sair(bd, { sessao, referencia: ref(), motivo: 'kick_afk', naSafeZone: false, gastas: [], armas: [] }, AGORA);
  expect(await sessaoDe(sessao)).toMatchObject({ fim: 'saiu', mortes: 0 });
  expect(await bd.select().from(lemnosPunicoes)).toEqual([]);
});
