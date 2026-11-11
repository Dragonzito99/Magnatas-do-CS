import { expect, test } from 'vitest';
import { descreverLinha, motivoDaLinha } from './textos-da-grana';

test('cada linha do extrato tem um motivo que o jogador entende', () => {
  expect(motivoDaLinha({ tipo: 'partida', referencia: 'abc', detalhes: null })).toBe('Partida');
  expect(motivoDaLinha({ tipo: 'abertura', referencia: 'abertura', detalhes: { xp: 5000 } })).toBe('Abertura da loja: XP que você já tinha');
  expect(motivoDaLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'cor-verde', dias: 3, preco: 200 } })).toBe('Compra: Cor do nome Verde, 3 dias');
  expect(motivoDaLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'sumiu', dias: 1, preco: 80 } })).toBe('Compra, 1 dia');
  expect(motivoDaLinha({ tipo: 'ajuste', referencia: 'x', detalhes: { motivo: 'erro na partida' } })).toBe('Ajuste da equipe: erro na partida');
});

test('as linhas da MagCoin também têm motivo claro', () => {
  expect(motivoDaLinha({ tipo: 'pagamento', referencia: '1', detalhes: { pacote: 'medio' } })).toBe('Compra de MagCoin: Pacote médio');
  expect(motivoDaLinha({ tipo: 'mensalidade', referencia: '1', detalhes: { nivel: 'ouro' } })).toBe('MagCoins do mês: Ouro');
  expect(motivoDaLinha({ tipo: 'estorno', referencia: '1', detalhes: {} })).toBe('Pagamento estornado');
  expect(motivoDaLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'cor-verde', paraSempre: true, preco: 150 } })).toBe('Compra: Cor do nome Verde, para sempre');
});

test('cada linha vira título e detalhe para a lista de compras, com o item quando é compra', () => {
  expect(descreverLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'moldura-fogo', dias: 3, preco: 160, desconto: 20 } })).toEqual({
    titulo: 'Fogo',
    detalhe: 'Moldura do perfil · 3 dias · oferta -20%',
    itemId: 'moldura-fogo',
  });
  expect(descreverLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'mutante-blindado', paraSempre: true, preco: 300 } })).toEqual({
    titulo: 'Cyber Hulk (Blindado)',
    detalhe: 'Mutante · para sempre',
    itemId: 'mutante-blindado',
  });
  expect(descreverLinha({ tipo: 'compra', referencia: 'x', detalhes: { itemId: 'sumiu', dias: 1 } })).toEqual({ titulo: 'Compra', detalhe: '1 dia' });
  expect(descreverLinha({ tipo: 'partida', referencia: 'x', detalhes: null })).toEqual({ titulo: 'Partida', detalhe: 'Grana pelo XP da partida' });
  expect(descreverLinha({ tipo: 'ajuste', referencia: 'x', detalhes: { motivo: 'teste' } })).toEqual({ titulo: 'Ajuste da equipe', detalhe: 'teste' });
  expect(descreverLinha({ tipo: 'pagamento', referencia: 'x', detalhes: { pacote: 'pequeno' } })).toEqual({ titulo: 'Compra de MagCoin', detalhe: 'Pacote pequeno' });
});
