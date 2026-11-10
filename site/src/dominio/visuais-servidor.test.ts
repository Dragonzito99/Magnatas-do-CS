import { randomUUID } from 'node:crypto';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { lancarGrana } from './grana';
import { comprarItem, usarItem } from './loja';
import { respostaDosVisuais } from './visuais-servidor';

let bd: Bd;
const TOKEN = 'segredo-de-teste';

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

const pedir = (consulta: string, cabecalho: string | null = `Bearer ${TOKEN}`) =>
  respostaDosVisuais(bd, cabecalho, TOKEN, `http://site/api/servidor/visuais?${consulta}`);

test('sem o token do servidor a resposta é 401', async () => {
  expect((await pedir('steamids=1', null)).status).toBe(401);
  expect((await pedir('steamids=1', 'Bearer errado')).status).toBe(401);
});

test('devolve o que cada conta está usando, e ignora steamid inválido', async () => {
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const semNada = await criarUsuario(bd, { estado: 'ativo' });
  await bd.transaction((tx) => lancarGrana(tx, { usuarioId: conta.id, tipo: 'ajuste', quantidade: 500, referencia: 'x' }));
  await comprarItem(bd, conta, { itemId: 'etiqueta-don', dias: 1, codigo: randomUUID() });
  await usarItem(bd, conta, 'etiqueta-don');

  const resposta = await pedir(`steamids=${conta.steamid64},${semNada.steamid64},abc;drop`);
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get('Cache-Control')).toBe('no-store');
  expect(await resposta.json()).toEqual({ [conta.steamid64]: { etiqueta: '[DON]' } });
});

test('sem steamids a resposta é vazia', async () => {
  const resposta = await pedir('');
  expect(await resposta.json()).toEqual({});
});

test('mais de 64 contas por pedido é recusado', async () => {
  const muitas = Array.from({ length: 65 }, (_, indice) => `7656119800000${String(indice).padStart(4, '0')}`).join(',');
  expect((await pedir(`steamids=${muitas}`)).status).toBe(400);
});
