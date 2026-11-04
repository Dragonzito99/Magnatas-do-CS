import { expect, test } from 'vitest';
import type { EstadoUsuario, Papel } from '@/bd/esquema';
import { destinoPara } from './destino';

type Conta = [EstadoUsuario, Papel] | null;

test.each<[Conta, string, string | null]>([
  [null, '/', null],
  [null, '/salas', '/'],
  [null, '/equipe', '/'],
  [null, '/verificacao', '/'],
  [['aguardando_verificacao', 'jogador'], '/', '/verificacao'],
  [['aguardando_verificacao', 'jogador'], '/salas', '/verificacao'],
  [['aguardando_verificacao', 'jogador'], '/verificacao', null],
  [['aguardando_verificacao', 'jogador'], '/verificacao/simulador', null],
  [['aguardando_verificacao', 'adm'], '/equipe', '/verificacao'],
  [['ativo', 'jogador'], '/', '/salas'],
  [['ativo', 'jogador'], '/verificacao', '/salas'],
  [['ativo', 'jogador'], '/salas', null],
  [['ativo', 'jogador'], '/convites', null],
  [['ativo', 'jogador'], '/equipe', '/salas'],
  [['ativo', 'gm'], '/equipe', null],
  [['ativo', 'adm'], '/equipe', null],
  [['ativo', 'jogador'], '/olho-de-aguia', '/salas'],
  [['ativo', 'gm'], '/olho-de-aguia', null],
  [['ativo', 'adm'], '/olho-de-aguia', null],
  [['ativo', 'jogador'], '/banido', '/salas'],
  [['suspenso', 'jogador'], '/salas', '/suspenso'],
  [['suspenso', 'jogador'], '/suspenso', null],
  [['banido', 'jogador'], '/salas', '/banido'],
  [['banido', 'adm'], '/equipe', '/banido'],
  [['banido', 'jogador'], '/', '/banido'],
  [['banido', 'jogador'], '/banido', null],
  [['ativo', 'jogador'], '/equipes-falsas', null],
])('%j em %s vai para %s', (conta, caminho, esperado) => {
  expect(destinoPara(conta && { estado: conta[0], papel: conta[1] }, caminho)).toBe(esperado);
});
