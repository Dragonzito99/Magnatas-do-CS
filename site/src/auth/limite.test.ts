import { expect, test } from 'vitest';
import { criarLimitador } from './limite';

const INICIO = 1_000_000;

test('permite até o limite dentro da janela', () => {
  const permitir = criarLimitador(3, 60_000);
  expect([permitir('ip', INICIO), permitir('ip', INICIO), permitir('ip', INICIO), permitir('ip', INICIO)]).toEqual([
    true,
    true,
    true,
    false,
  ]);
});

test('a janela libera de novo depois do tempo', () => {
  const permitir = criarLimitador(1, 60_000);
  expect(permitir('ip', INICIO)).toBe(true);
  expect(permitir('ip', INICIO + 59_999)).toBe(false);
  expect(permitir('ip', INICIO + 60_000)).toBe(true);
});

test('cada IP tem sua própria conta', () => {
  const permitir = criarLimitador(1, 60_000);
  expect(permitir('a', INICIO)).toBe(true);
  expect(permitir('b', INICIO)).toBe(true);
});
