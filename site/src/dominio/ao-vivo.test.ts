import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import type { Usuario } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { desfazerAmizade, pedirAmizade, responderAmizade } from './amigos';
import { avisar, ouvir, type Novidade } from './ao-vivo';
import { conversaDiretaCom, criarGrupo, enviarMensagem } from './mensagens';

let bd: Bd;
let eu: Usuario;
let ele: Usuario;
let outro: Usuario;
let recebidas: Record<string, Novidade[]>;
let paradas: (() => void)[];
const AGORA = new Date('2026-11-12T18:00:00Z');

function escutar(...contas: Usuario[]) {
  for (const conta of contas) paradas.push(ouvir(conta.id, (novidade) => (recebidas[conta.apelido] ??= []).push(novidade)));
}

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  eu = await criarUsuario(bd, { estado: 'ativo', apelido: 'Dragonzit0' });
  ele = await criarUsuario(bd, { estado: 'ativo', apelido: 'Marfioso' });
  outro = await criarUsuario(bd, { estado: 'ativo', apelido: 'Alfa' });
  recebidas = {};
  paradas = [];
});

afterEach(() => {
  for (const parar of paradas) parar();
});

test('avisar chega só a quem está ouvindo aquela conta, e parar de ouvir corta', () => {
  escutar(eu);
  avisar([eu.id, ele.id], { tipo: 'amigos' });
  expect(recebidas).toEqual({ Dragonzit0: [{ tipo: 'amigos' }] });
  paradas.pop()!();
  avisar([eu.id], { tipo: 'amigos' });
  expect(recebidas.Dragonzit0).toHaveLength(1);
});

test('pedir, aceitar e desfazer amizade avisam as duas contas na hora', async () => {
  escutar(eu, ele, outro);
  await pedirAmizade(bd, eu, ele.id, AGORA);
  await responderAmizade(bd, ele, eu.id, true, AGORA);
  await desfazerAmizade(bd, eu, ele.id);
  expect(recebidas.Dragonzit0).toEqual([{ tipo: 'amigos' }, { tipo: 'amigos' }, { tipo: 'amigos' }]);
  expect(recebidas.Marfioso).toEqual([{ tipo: 'amigos' }, { tipo: 'amigos' }, { tipo: 'amigos' }]);
  expect(recebidas.Alfa).toBeUndefined();
});

test('mensagem nova avisa todo mundo da conversa, com o id dela, e mais ninguém', async () => {
  await pedirAmizade(bd, eu, ele.id, AGORA);
  await responderAmizade(bd, ele, eu.id, true, AGORA);
  await pedirAmizade(bd, eu, outro.id, AGORA);
  await responderAmizade(bd, outro, eu.id, true, AGORA);
  const direta = await conversaDiretaCom(bd, eu, ele.id, AGORA);
  escutar(eu, ele, outro);
  await enviarMensagem(bd, eu, direta, 'oi', AGORA);
  expect(recebidas.Marfioso).toEqual([{ tipo: 'mensagem', conversaId: direta }]);
  expect(recebidas.Dragonzit0).toEqual([{ tipo: 'mensagem', conversaId: direta }]);
  expect(recebidas.Alfa).toBeUndefined();

  const grupo = await criarGrupo(bd, eu, 'Trio', [ele.id, outro.id], AGORA);
  expect(recebidas.Alfa).toEqual([{ tipo: 'conversas' }]);
  await enviarMensagem(bd, ele, grupo, 'bora', AGORA);
  expect(recebidas.Alfa).toEqual([{ tipo: 'conversas' }, { tipo: 'mensagem', conversaId: grupo }]);
});
