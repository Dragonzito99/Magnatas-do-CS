import { expect, test } from 'vitest';
import { FAMILIAS, lerChaveDaInsignia, niveisAlcancados, nomeDaInsignia, PREMIOS } from './insignias';

const ZERO = { mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 };

test('as metas e os prêmios são os da tabela aprovada', () => {
  expect(FAMILIAS.map((familia) => [familia.chave, familia.metas])).toEqual([
    ['mira', [50, 250, 1000, 3000, 10000]],
    ['ace', [1, 5, 20, 50, 100]],
    ['estrela', [10, 50, 200, 500, 1000]],
    ['vencedor', [5, 25, 100, 300, 1000]],
    ['mutacao', [5, 25, 100, 300, 1000]],
    ['veterano', [10, 50, 200, 500, 1500]],
  ]);
  expect(PREMIOS).toEqual([
    { grana: 50, xp: 200, mutanteDias: undefined },
    { grana: 100, xp: 500, mutanteDias: 1 },
    { grana: 200, xp: 1000, mutanteDias: 3 },
    { grana: 400, xp: 2000, mutanteDias: 5 },
    { grana: 800, xp: 5000, mutanteDias: null },
  ]);
});

test('alcançar uma meta dá todos os níveis até ela', () => {
  expect(niveisAlcancados({ ...ZERO, estrela: 231 })).toEqual([
    { familia: 'estrela', nivel: 0 },
    { familia: 'estrela', nivel: 1 },
    { familia: 'estrela', nivel: 2 },
  ]);
  expect(niveisAlcancados({ ...ZERO, mira: 49 })).toEqual([]);
  expect(niveisAlcancados({ ...ZERO, ace: 100 })).toHaveLength(5);
});

test('o nome e a chave da insígnia', () => {
  expect(nomeDaInsignia('estrela', 2)).toBe('Estrela Ouro');
  expect(lerChaveDaInsignia('mutacao:4')).toEqual({ familia: 'mutacao', nivel: 4 });
  expect(lerChaveDaInsignia('qualquer:9')).toBeNull();
  expect(lerChaveDaInsignia('mira:5')).toBeNull();
  expect(lerChaveDaInsignia(null)).toBeNull();
});
