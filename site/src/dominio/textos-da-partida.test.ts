import { expect, test } from 'vitest';
import { FASES_DA_PARTIDA, faseDaPartida } from './textos-da-partida';

test('cada estado da partida cai numa das cinco fases da tela', () => {
  expect(faseDaPartida('aguardando_aceite')).toBe('aceite');
  expect(faseDaPartida('vetando')).toBe('vetos');
  expect(faseDaPartida('aguardando_servidor')).toBe('entrar');
  expect(faseDaPartida('carregando')).toBe('entrar');
  expect(faseDaPartida('aguardando_jogadores')).toBe('entrar');
  expect(faseDaPartida('ao_vivo')).toBe('vivo');
  expect(faseDaPartida('encerrada')).toBe('fim');
  expect(faseDaPartida('cancelada')).toBe('fim');
});

test('as fases aparecem na ordem do rascunho', () => {
  expect(FASES_DA_PARTIDA.map((fase) => fase.nome)).toEqual(['Aceite', 'Vetos', 'Entrar no servidor', 'Ao vivo', 'Fim']);
});
