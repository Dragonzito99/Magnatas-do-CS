import { expect, test } from 'vitest';
import { FASES_DA_PARTIDA, faseDaPartida, nomeDaPartida, seloDaPartida } from './textos-da-partida';

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

test('o nome da partida diz o tipo e o número', () => {
  expect(nomeDaPartida({ tipo: 'cla', numero: 7 })).toBe('Clã x clã #7');
  expect(nomeDaPartida({ tipo: 'treino', numero: 8 })).toBe('Treino #8');
  expect(nomeDaPartida({ tipo: 'mix', numero: 9 })).toBe('Mix #9');
  expect(nomeDaPartida({ tipo: 'desafio', numero: 10 })).toBe('Desafio #10');
});

test('o selo da partida diz se é clã x clã, treino, mix ou desafio, com MD1 ou MD3', () => {
  expect(seloDaPartida({ tipo: 'cla', mapasDaPartida: 3 })).toBe('Clã x clã · MD3');
  expect(seloDaPartida({ tipo: 'cla', mapasDaPartida: 1 })).toBe('Clã x clã · MD1');
  expect(seloDaPartida({ tipo: 'treino', mapasDaPartida: 1 })).toBe('Treino · MD1');
  expect(seloDaPartida({ tipo: 'mix', mapasDaPartida: 1 })).toBe('Mix');
  expect(seloDaPartida({ tipo: 'desafio', mapasDaPartida: 1 })).toBe('Desafio');
});
