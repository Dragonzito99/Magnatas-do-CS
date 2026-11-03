import { expect, test } from 'vitest';
import type { EstadoUsuario, Papel } from '@/bd/esquema';
import { pode, type Acao } from './permissoes';

const conta = (papel: Papel, estado: EstadoUsuario = 'ativo') => ({ papel, estado });

test.each<[Papel, Acao, boolean]>([
  ['jogador', 'gerar_convite_ilimitado', false],
  ['gm', 'gerar_convite_ilimitado', true],
  ['adm', 'gerar_convite_ilimitado', true],
  ['jogador', 'ver_equipe', false],
  ['gm', 'ver_equipe', true],
  ['adm', 'ver_equipe', true],
  ['jogador', 'mudar_papel', false],
  ['gm', 'mudar_papel', false],
  ['adm', 'mudar_papel', true],
  ['jogador', 'dar_convites', false],
  ['gm', 'dar_convites', false],
  ['adm', 'dar_convites', true],
])('%s pode %s: %s', (papel, acao, esperado) => {
  expect(pode(conta(papel), acao)).toBe(esperado);
});

test.each<EstadoUsuario>(['suspenso', 'banido', 'aguardando_verificacao'])('adm no estado %s não pode nada', (estado) => {
  expect(pode(conta('adm', estado), 'mudar_papel')).toBe(false);
  expect(pode(conta('adm', estado), 'ver_equipe')).toBe(false);
});
