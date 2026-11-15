import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste, criarUsuario, STEAM_A } from '@/bd/teste';
import { respostaDoAviso } from './api';

let bd: Bd;
const TOKEN = 'segredo-de-teste';

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  await criarUsuario(bd, { estado: 'ativo', steamid64: STEAM_A });
});

function pedido(corpo: unknown, token = TOKEN) {
  return new Request('http://site/api/servidor/lemnos/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

test('sem token dá 401', async () => {
  expect((await respostaDoAviso(bd, 'entrada', pedido({}, 'errado'), TOKEN)).status).toBe(401);
  expect((await respostaDoAviso(bd, 'entrada', pedido({}), undefined)).status).toBe(401);
});

test('aviso desconhecido dá 404', async () => {
  expect((await respostaDoAviso(bd, 'roubar', pedido({}), TOKEN)).status).toBe(404);
});

test('corpo inválido dá 400 e grande demais dá 413', async () => {
  expect((await respostaDoAviso(bd, 'entrada', pedido('{nao e json'), TOKEN)).status).toBe(400);
  expect((await respostaDoAviso(bd, 'entrada', pedido({ porta: 27024, steamid64: 'abc', referencia: 'lemnos:1' }), TOKEN)).status).toBe(400);
  expect((await respostaDoAviso(bd, 'entrada', pedido('x'.repeat(70_000)), TOKEN)).status).toBe(413);
});

test('entrada válida devolve sessão e kit, e o mesmo corpo duas vezes devolve a mesma resposta', async () => {
  const corpo = { porta: 27024, steamid64: STEAM_A, referencia: 'lemnos:27024:abc' };
  const primeira = await respostaDoAviso(bd, 'entrada', pedido(corpo), TOKEN);
  expect(primeira.status).toBe(200);
  const json = await primeira.json();
  expect(json).toMatchObject({ ok: true, kit: { secundaria: { classe: 'weapon_glock', gratis: true }, espacos: 8 } });
  const segunda = await respostaDoAviso(bd, 'entrada', pedido(corpo), TOKEN);
  expect(await segunda.json()).toEqual(json);
});

test('saque com id fora do catálogo dá 400', async () => {
  const entrada = await (await respostaDoAviso(bd, 'entrada', pedido({ porta: 27024, steamid64: STEAM_A, referencia: 'lemnos:27024:e' }), TOKEN)).json();
  const corpo = { sessao: entrada.sessao, referencia: 'lemnos:27024:x', saque: ['faca_de_ouro'], armas: [], gastas: [] };
  expect((await respostaDoAviso(bd, 'extracao', pedido(corpo), TOKEN)).status).toBe(400);
});

test('extração, morte, renascer e saída respondem 200; sessão encerrada dá 409', async () => {
  const entrada = await (await respostaDoAviso(bd, 'entrada', pedido({ porta: 27024, steamid64: STEAM_A, referencia: 'lemnos:27024:e' }), TOKEN)).json();
  const sessao = entrada.sessao;
  const extracao = await respostaDoAviso(bd, 'extracao', pedido({ sessao, referencia: 'lemnos:27024:1', saque: ['joias'], armas: [{ linha: null, classe: 'weapon_ak47' }], gastas: [] }), TOKEN);
  expect(extracao.status).toBe(200);
  expect((await extracao.json()).linhasNovas).toHaveLength(1);
  expect((await respostaDoAviso(bd, 'morte', pedido({ sessao, referencia: 'lemnos:27024:2', matador: null, gastas: [] }), TOKEN)).status).toBe(200);
  expect((await respostaDoAviso(bd, 'renascer', pedido({ sessao, referencia: 'lemnos:27024:3' }), TOKEN)).status).toBe(200);
  expect((await respostaDoAviso(bd, 'saida', pedido({ sessao, referencia: 'lemnos:27024:4', motivo: 'saiu', naSafeZone: true, gastas: [], armas: [] }), TOKEN)).status).toBe(200);
  expect((await respostaDoAviso(bd, 'renascer', pedido({ sessao, referencia: 'lemnos:27024:5' }), TOKEN)).status).toBe(409);
});

test('início fecha as sessões da porta', async () => {
  await respostaDoAviso(bd, 'entrada', pedido({ porta: 27024, steamid64: STEAM_A, referencia: 'lemnos:27024:e' }), TOKEN);
  const inicio = await respostaDoAviso(bd, 'inicio', pedido({ porta: 27024, referencia: 'lemnos:27024:i' }), TOKEN);
  expect(await inicio.json()).toEqual({ fechadas: 1 });
});
