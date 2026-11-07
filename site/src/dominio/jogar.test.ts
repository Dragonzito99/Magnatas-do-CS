import { expect, test } from 'vitest';
import { FILTROS_DO_JOGAR, lerFiltroDoJogar, mostraNoFiltro } from './jogar';

test('os filtros da tela Jogar são os que o dono pediu, nesta ordem', () => {
  expect(FILTROS_DO_JOGAR.map((filtro) => filtro.nome)).toEqual(['Todos', 'Competitivo', 'Mix', 'Cada um por si', 'Equipe x Equipe', 'Fantasma', 'Mutação']);
});

test('filtro desconhecido ou vazio mostra tudo', () => {
  expect(lerFiltroDoJogar(undefined)).toBeNull();
  expect(lerFiltroDoJogar('qualquer')).toBeNull();
  expect(lerFiltroDoJogar('competitivo')).toBe('competitivo');
  expect(lerFiltroDoJogar('fantasma')).toBe('fantasma');
});

test('cada cartão aparece no filtro dele e em Todos', () => {
  expect(mostraNoFiltro(null, 'mix')).toBe(true);
  expect(mostraNoFiltro('mix', 'mix')).toBe(true);
  expect(mostraNoFiltro('competitivo', 'mix')).toBe(false);
  expect(mostraNoFiltro('equipe', 'equipe')).toBe(true);
});
