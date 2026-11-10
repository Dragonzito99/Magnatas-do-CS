import { expect, test } from 'vitest';
import { motivoDaLinha } from './textos-da-grana';

test('cada linha do extrato tem um motivo que o jogador entende', () => {
  expect(motivoDaLinha({ tipo: 'partida', referencia: 'abc', detalhes: null })).toBe('Partida');
  expect(motivoDaLinha({ tipo: 'abertura', referencia: 'abertura', detalhes: { xp: 5000 } })).toBe('Abertura da loja: XP que você já tinha');
  expect(motivoDaLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'cor-verde', dias: 3, preco: 200 } })).toBe('Compra: Cor do nome Verde, 3 dias');
  expect(motivoDaLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'sumiu', dias: 1, preco: 80 } })).toBe('Compra, 1 dia');
  expect(motivoDaLinha({ tipo: 'ajuste', referencia: 'x', detalhes: { motivo: 'erro na partida' } })).toBe('Ajuste da equipe: erro na partida');
});
