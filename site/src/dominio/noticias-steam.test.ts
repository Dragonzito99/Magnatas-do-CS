import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { noticiasSteam } from '@/bd/esquema';
import { criarBancoDeTeste } from '@/bd/teste';
import amostra from './exemplos/steam-noticias.json';
import { atualizarNoticiasSteam, limparConteudo, noticiasSteamDaTela, URL_DAS_NOTICIAS_STEAM, type Traduzir } from './noticias-steam';

let bd: Bd;
let buscas: string[];
const AGORA = new Date('2026-11-07T12:00:00Z');
const minutos = (n: number) => new Date(AGORA.getTime() + n * 60_000);

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  buscas = [];
});

const buscar = async (url: string) => {
  buscas.push(url);
  return amostra;
};

const tradutorFalso: Traduzir = async ({ titulo }) => ({ titulo: `PT: ${titulo}`, resumo: 'Resumo em português.' });

test('busca só o canal oficial da Valve para o CS2', () => {
  expect(URL_DAS_NOTICIAS_STEAM).toContain('appid=730');
  expect(URL_DAS_NOTICIAS_STEAM).toContain('feeds=steam_community_announcements');
});

test('guarda as notícias da amostra uma vez só, mesmo buscando de novo depois de 30 minutos', async () => {
  await atualizarNoticiasSteam(bd, buscar, null, AGORA);
  await atualizarNoticiasSteam(bd, buscar, null, minutos(31));
  expect(buscas).toHaveLength(2);
  expect(await bd.select().from(noticiasSteam)).toHaveLength(amostra.appnews.newsitems.length);
});

test('dentro de 30 minutos não busca de novo', async () => {
  await atualizarNoticiasSteam(bd, buscar, null, AGORA);
  await atualizarNoticiasSteam(bd, buscar, null, minutos(10));
  expect(buscas).toHaveLength(1);
});

test('traduz cada notícia uma vez e a tela mostra a tradução', async () => {
  let traducoes = 0;
  const contar: Traduzir = async (entrada) => {
    traducoes += 1;
    return tradutorFalso(entrada);
  };
  await atualizarNoticiasSteam(bd, buscar, contar, AGORA);
  await atualizarNoticiasSteam(bd, buscar, contar, minutos(31));
  expect(traducoes).toBe(amostra.appnews.newsitems.length);
  const tela = await noticiasSteamDaTela(bd, 4);
  expect(tela).toHaveLength(4);
  expect(tela[0].titulo).toMatch(/^PT: /);
  expect(tela[0].resumo).toBe('Resumo em português.');
  expect(tela[0].publicadaEm >= tela[1].publicadaEm).toBe(true);
});

test('tradução que falha 3 vezes para de tentar, e a tela mostra o original', async () => {
  let tentativas = 0;
  const falha: Traduzir = async () => {
    tentativas += 1;
    return null;
  };
  for (let i = 0; i < 5; i += 1) await atualizarNoticiasSteam(bd, buscar, falha, minutos(i * 31));
  expect(tentativas).toBe(3 * amostra.appnews.newsitems.length);
  const [primeira] = await noticiasSteamDaTela(bd, 1);
  expect(primeira.titulo).toBe(amostra.appnews.newsitems[0].title);
  expect(primeira.resumo).toBeNull();
});

test('tradução que lança erro conta como falha e não derruba a atualização', async () => {
  const quebra: Traduzir = async () => {
    throw new Error('fora do ar');
  };
  await expect(atualizarNoticiasSteam(bd, buscar, quebra, AGORA)).resolves.toBeUndefined();
  const [linha] = await bd.select().from(noticiasSteam);
  expect(linha.tentativas).toBe(1);
});

test('resposta estranha da Steam não guarda nada e não quebra', async () => {
  await expect(atualizarNoticiasSteam(bd, async () => ({ erro: true }), null, AGORA)).resolves.toBeUndefined();
  expect(await bd.select().from(noticiasSteam)).toEqual([]);
});

test('limparConteudo tira as marcações da Steam e o HTML', () => {
  expect(limparConteudo('[p]\\[ GAMEPLAY ][/p][list][*][p]Bomb defusal now <b>faster</b>.[/p][/*][/list]')).toBe('[ GAMEPLAY ] Bomb defusal now faster.');
});

test('limparConteudo corta em 4.000 caracteres', () => {
  expect(limparConteudo('a'.repeat(10_000))).toHaveLength(4000);
});
