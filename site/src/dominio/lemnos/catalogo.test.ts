import { expect, test } from 'vitest';
import { ARMAS, armaLemnos, GRANADAS, granadaLemnos, MOCHILA_BASICA, MOCHILAS, mochilaLemnos, PISTOLA_DE_GRACA, SAQUES, saqueLemnos } from './catalogo';

test('os preços das armas são a proposta da tabela', () => {
  const tabela = Object.fromEntries(ARMAS.map((arma) => [arma.id, [arma.precoGrana, arma.precoMagcoinDias, arma.precoMagcoinSempre, arma.lugar]]));
  const pistola = [10, { 1: 5, 3: 12, 5: 18, 9: 28 }, 120, 'secundaria'];
  const deagle = [20, { 1: 8, 3: 20, 5: 30, 9: 45 }, 180, 'secundaria'];
  const smg = [25, { 1: 10, 3: 25, 5: 38, 9: 60 }, 220, 'principal'];
  const rifle = [45, { 1: 15, 3: 35, 5: 55, 9: 85 }, 300, 'principal'];
  expect(tabela).toEqual({
    glock: pistola,
    usp_silencer: pistola,
    p250: pistola,
    deagle,
    mp9: smg,
    mac10: smg,
    ump45: smg,
    ak47: rifle,
    m4a1: rifle,
    m4a1_silencer: rifle,
    galilar: rifle,
    famas: rifle,
    awp: [90, { 1: 20, 3: 50, 5: 75, 9: 110 }, 400, 'principal'],
  });
});

test('granadas, mochilas e saque com os valores da proposta', () => {
  expect(Object.fromEntries(GRANADAS.map((granada) => [granada.id, granada.precoGrana]))).toEqual({ hegrenade: 8, flashbang: 4, smokegrenade: 4, molotov: 10 });
  expect(MOCHILAS.map((mochila) => [mochila.id, mochila.espacos, mochila.precoGranaDias, mochila.precoMagcoinSempre])).toEqual([
    ['basica', 8, null, null],
    ['media', 12, { 1: 40, 3: 100, 5: 150, 9: 240 }, 120],
    ['grande', 16, { 1: 70, 3: 180, 5: 270, 9: 430 }, 200],
    ['tatica', 20, { 1: 100, 3: 250, 5: 380, 9: 600 }, 300],
  ]);
  expect(Object.fromEntries(SAQUES.map((saque) => [saque.id, [saque.raridade, saque.valor]]))).toEqual({
    relogio: ['comum', 3],
    celular: ['comum', 5],
    radio: ['comum', 4],
    joias: ['raro', 20],
    notebook: ['raro', 25],
    documentos: ['raro', 15],
    barra_de_ouro: ['lendario', 100],
    maleta_de_diamantes: ['lendario', 120],
    maco_de_notas: ['dinheiro', 8],
  });
});

test('toda classe começa com weapon_', () => {
  for (const item of [...ARMAS, ...GRANADAS, PISTOLA_DE_GRACA]) expect(item.classe).toMatch(/^weapon_[a-z0-9_]+$/);
  expect(armaLemnos('m4a1_silencer')?.classe).toBe('weapon_m4a1_silencer');
  expect(armaLemnos('usp_silencer')?.classe).toBe('weapon_usp_silencer');
  expect(PISTOLA_DE_GRACA).toEqual({ classe: 'weapon_glock', nome: 'Glock-18' });
});

test('só a básica é grátis e ela não está à venda', () => {
  expect(MOCHILA_BASICA).toBe('basica');
  const gratis = MOCHILAS.filter((mochila) => mochila.precoGranaDias === null && mochila.precoMagcoinSempre === null);
  expect(gratis.map((mochila) => mochila.id)).toEqual(['basica']);
});

test('nenhum id se repete entre os quatro catálogos e a busca acha cada um', () => {
  const ids = [...ARMAS, ...GRANADAS, ...MOCHILAS, ...SAQUES].map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(granadaLemnos('molotov')?.nome).toBeTruthy();
  expect(mochilaLemnos('grande')?.espacos).toBe(16);
  expect(saqueLemnos('joias')?.valor).toBe(20);
  expect(armaLemnos('nao_existe')).toBeUndefined();
});

test('todo item tem imagem que existe, categoria e raridade', async () => {
  const { existsSync } = await import('node:fs');
  const path = await import('node:path');
  const { categoriaLemnos, imagemLemnos, raridadeLemnos } = await import('./catalogo');
  for (const item of [...ARMAS, ...GRANADAS, ...MOCHILAS, ...SAQUES]) {
    const imagem = imagemLemnos(item.id);
    expect(existsSync(path.resolve(__dirname, '../../../public', imagem.slice(1))), imagem).toBe(true);
    expect(categoriaLemnos(item.id)).toBeTruthy();
    expect(['comum', 'raro', 'epico', 'lendario']).toContain(raridadeLemnos(item.id));
  }
  expect(categoriaLemnos('awp')).toBe('Sniper');
  expect(categoriaLemnos('ak47')).toBe('Fuzil');
  expect(raridadeLemnos('awp')).toBe('lendario');
});
