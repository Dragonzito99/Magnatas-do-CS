import { expect, test } from 'vitest';
import { deveIrParaAvaliar } from './ir-para-avaliar';

const destino = '/partidas/diversao/27020-abc#avaliar';

test('vai para a partida de qualquer página comum, uma vez só por destino', () => {
  expect(deveIrParaAvaliar(destino, '/inicio', '', false)).toBe(true);
  expect(deveIrParaAvaliar(destino, '/inicio', '', true)).toBe(false);
  expect(deveIrParaAvaliar(null, '/inicio', '', false)).toBe(false);
});

test('não tira a pessoa do apoio, das compras, da janela da loja nem de uma partida da Diversão', () => {
  expect(deveIrParaAvaliar(destino, '/apoio', '', false)).toBe(false);
  expect(deveIrParaAvaliar(destino, '/compras/123', '', false)).toBe(false);
  expect(deveIrParaAvaliar(destino, '/loja', '?item=moldura-ouro', false)).toBe(false);
  expect(deveIrParaAvaliar(destino, '/loja', '', false)).toBe(true);
  expect(deveIrParaAvaliar(destino, '/partidas/diversao/27020-abc', '', false)).toBe(false);
  expect(deveIrParaAvaliar(destino, '/partidas/diversao/27020-outra', '', false)).toBe(false);
  expect(deveIrParaAvaliar('/partidas/9f1#avaliar', '/partidas/9f1', '?aviso=elogiado', false)).toBe(false);
});

test('só sai sozinho de páginas de navegar, nunca de fila, sala, partida, painel ou formulário da equipe', () => {
  for (const caminho of ['/inicio', '/noticias', '/ranking', '/comunidade', '/jogadores/abc', '/bau', '/patentes', '/diversao']) {
    expect(deveIrParaAvaliar(destino, caminho, '', false)).toBe(true);
  }
  for (const caminho of ['/jogar', '/mix/12', '/salas/x', '/partidas/9f1', '/partidas', '/equipe/noticias', '/painel/grana', '/olho-de-aguia', '/clas/x', '/testes', '/convites']) {
    expect(deveIrParaAvaliar(destino, caminho, '', false)).toBe(false);
  }
});
