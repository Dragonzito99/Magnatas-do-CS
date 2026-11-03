import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste, criarUsuario, STEAM_A, STEAM_B, STEAM_C, STEAM_D } from '@/bd/teste';
import { listaDeLiberados, respostaDaLista } from './lista';

const TOKEN = 'token-de-teste-do-servidor';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('só contas ativas entram na lista', async () => {
  await criarUsuario(bd, { steamid64: STEAM_A, estado: 'ativo' });
  await criarUsuario(bd, { steamid64: STEAM_B, estado: 'aguardando_verificacao' });
  await criarUsuario(bd, { steamid64: STEAM_C, estado: 'suspenso' });
  await criarUsuario(bd, { steamid64: STEAM_D, estado: 'banido' });
  expect(await listaDeLiberados(bd)).toBe(`${STEAM_A}\n`);
});

test('equipe ativa também entra, com um ID por linha', async () => {
  await criarUsuario(bd, { steamid64: STEAM_B, estado: 'ativo', papel: 'gm' });
  await criarUsuario(bd, { steamid64: STEAM_A, estado: 'ativo' });
  expect(await listaDeLiberados(bd)).toBe(`${STEAM_A}\n${STEAM_B}\n`);
});

test('lista vazia é um texto vazio', async () => {
  expect(await listaDeLiberados(bd)).toBe('');
});

test.each([
  [null],
  ['Bearer errado'],
  [`Bearer ${TOKEN}x`],
  [TOKEN],
  ['Bearer '],
])('recusa o cabeçalho %s', async (cabecalho) => {
  const resposta = await respostaDaLista(bd, cabecalho, TOKEN);
  expect(resposta.status).toBe(401);
  expect(await resposta.text()).not.toContain('7656119');
});

test('sem token configurado no site, ninguém acessa', async () => {
  expect((await respostaDaLista(bd, 'Bearer ', '')).status).toBe(401);
  expect((await respostaDaLista(bd, 'Bearer undefined', undefined)).status).toBe(401);
});

test('entrega a lista com o token certo, sem guardar em cache', async () => {
  await criarUsuario(bd, { steamid64: STEAM_A, estado: 'ativo' });
  const resposta = await respostaDaLista(bd, `Bearer ${TOKEN}`, TOKEN);
  expect(resposta.status).toBe(200);
  expect(await resposta.text()).toBe(`${STEAM_A}\n`);
  expect(resposta.headers.get('cache-control')).toBe('no-store');
});
