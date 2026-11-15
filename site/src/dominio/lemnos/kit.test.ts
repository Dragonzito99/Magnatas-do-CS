import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { lemnosItens, lemnosSessoes, type Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { ItemInvalido } from '@/dominio/loja';
import { EmCampo, escolherKit, kitDe, separarKit } from './kit';

let bd: Bd;
let conta: Usuario;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-15T12:00:00Z');
const VAZIO = { principal: null, secundaria: null, granadas: [], mochila: null };

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  conta = await criarUsuario(bd, { estado: 'ativo' });
});

async function dar(tipo: 'arma' | 'granada' | 'mochila', itemId: string, origem: 'grana' | 'magcoin' | 'achado' = 'grana', expiraEm: Date | null = null, criadoEm = AGORA) {
  const [linha] = await bd.insert(lemnosItens).values({ usuarioId: conta.id, tipo, itemId, origem, expiraEm, criadoEm }).returning();
  return linha.id;
}

async function abrirSessao() {
  const [sessao] = await bd.insert(lemnosSessoes).values({ usuarioId: conta.id, porta: 27024 }).returning();
  return sessao.id;
}

const separar = async (sessao: string, agora = AGORA) => bd.transaction((tx) => separarKit(tx, conta.id, sessao, agora));

test('sem kit salvo, kitDe devolve o vazio', async () => {
  expect(await kitDe(bd, conta.id)).toEqual(VAZIO);
});

test('escolher e ler o kit', async () => {
  await dar('arma', 'ak47');
  await dar('arma', 'deagle');
  await dar('granada', 'flashbang');
  await dar('granada', 'flashbang');
  await dar('mochila', 'media', 'grana', new Date(AGORA.getTime() + DIA));
  const kit = { principal: 'ak47', secundaria: 'deagle', granadas: ['flashbang', 'flashbang'], mochila: 'media' };
  await escolherKit(bd, conta, kit, AGORA);
  expect(await kitDe(bd, conta.id)).toEqual(kit);
});

test('trocar o kit com sessão aberta lança EmCampo', async () => {
  await abrirSessao();
  await expect(escolherKit(bd, conta, VAZIO, AGORA)).rejects.toThrow(EmCampo);
});

test('escolher AK sem ter AK lança ItemInvalido', async () => {
  await expect(escolherKit(bd, conta, { ...VAZIO, principal: 'ak47' }, AGORA)).rejects.toThrow(ItemInvalido);
});

test('arma no lugar errado, granada a mais ou mochila vencida lança ItemInvalido', async () => {
  await dar('arma', 'deagle');
  await dar('arma', 'ak47');
  for (let i = 0; i < 3; i += 1) await dar('granada', 'flashbang');
  await dar('granada', 'hegrenade');
  await dar('granada', 'hegrenade');
  await dar('mochila', 'grande', 'grana', new Date(AGORA.getTime() - DIA));
  await expect(escolherKit(bd, conta, { ...VAZIO, principal: 'deagle' }, AGORA)).rejects.toThrow(ItemInvalido);
  await expect(escolherKit(bd, conta, { ...VAZIO, secundaria: 'ak47' }, AGORA)).rejects.toThrow(ItemInvalido);
  await expect(escolherKit(bd, conta, { ...VAZIO, granadas: ['flashbang', 'flashbang', 'flashbang'] }, AGORA)).rejects.toThrow(ItemInvalido);
  await expect(escolherKit(bd, conta, { ...VAZIO, granadas: ['hegrenade', 'hegrenade'] }, AGORA)).rejects.toThrow(ItemInvalido);
  await expect(escolherKit(bd, conta, { ...VAZIO, mochila: 'grande' }, AGORA)).rejects.toThrow(ItemInvalido);
});

test('escolher 2 flashbangs tendo só 1 lança ItemInvalido', async () => {
  await dar('granada', 'flashbang');
  await expect(escolherKit(bd, conta, { ...VAZIO, granadas: ['flashbang', 'flashbang'] }, AGORA)).rejects.toThrow(ItemInvalido);
});

test('separarKit prefere a AK de Magcoin à de grana e põe em campo', async () => {
  const grana = await dar('arma', 'ak47', 'grana');
  const magcoin = await dar('arma', 'ak47', 'magcoin', new Date(AGORA.getTime() + DIA));
  await escolherKit(bd, conta, { ...VAZIO, principal: 'ak47' }, AGORA);
  const sessao = await abrirSessao();
  const kit = await separar(sessao);
  expect(kit.principal).toEqual({ linha: magcoin, classe: 'weapon_ak47', magcoin: true, gratis: false });
  const [linha] = await bd.select().from(lemnosItens).where(eq(lemnosItens.id, magcoin));
  expect(linha).toMatchObject({ situacao: 'em_campo', sessaoId: sessao });
  const [outra] = await bd.select().from(lemnosItens).where(eq(lemnosItens.id, grana));
  expect(outra.situacao).toBe('no_bau');
});

test('entre duas de grana, separarKit usa a mais antiga', async () => {
  const antiga = await dar('arma', 'ak47', 'grana', null, new Date(AGORA.getTime() - DIA));
  await dar('arma', 'ak47', 'grana');
  await escolherKit(bd, conta, { ...VAZIO, principal: 'ak47' }, AGORA);
  expect((await separar(await abrirSessao())).principal?.linha).toBe(antiga);
});

test('sem AK sobrando, entra sem principal', async () => {
  const unica = await dar('arma', 'ak47');
  await escolherKit(bd, conta, { ...VAZIO, principal: 'ak47' }, AGORA);
  await bd.update(lemnosItens).set({ situacao: 'perdido' }).where(eq(lemnosItens.id, unica));
  expect((await separar(await abrirSessao())).principal).toBeNull();
});

test('sem secundária, entra com a Glock de graça', async () => {
  const kit = await separar(await abrirSessao());
  expect(kit.secundaria).toEqual({ linha: null, classe: 'weapon_glock', magcoin: false, gratis: true });
  expect(kit.granadas).toEqual([]);
});

test('granadas escolhidas saem uma linha cada', async () => {
  await dar('granada', 'flashbang');
  await dar('granada', 'flashbang');
  await dar('granada', 'molotov');
  await escolherKit(bd, conta, { ...VAZIO, granadas: ['flashbang', 'flashbang', 'molotov'] }, AGORA);
  const kit = await separar(await abrirSessao());
  expect(kit.granadas.map((peca) => peca.classe)).toEqual(['weapon_flashbang', 'weapon_flashbang', 'weapon_molotov']);
  expect(new Set(kit.granadas.map((peca) => peca.linha)).size).toBe(3);
});

test('mochila valendo dá os espaços dela; vencida volta a 8', async () => {
  await dar('mochila', 'grande', 'grana', new Date(AGORA.getTime() + DIA));
  await escolherKit(bd, conta, { ...VAZIO, mochila: 'grande' }, AGORA);
  expect((await separar(await abrirSessao())).espacos).toBe(16);
  await bd.update(lemnosSessoes).set({ encerradaEm: AGORA });
  expect((await separar(await abrirSessao(), new Date(AGORA.getTime() + 2 * DIA))).espacos).toBe(8);
});

test('arma de Magcoin vencida não entra no kit', async () => {
  await dar('arma', 'awp', 'magcoin', new Date(AGORA.getTime() + DIA));
  await escolherKit(bd, conta, { ...VAZIO, principal: 'awp' }, AGORA);
  expect((await separar(await abrirSessao(), new Date(AGORA.getTime() + 2 * DIA))).principal).toBeNull();
});
