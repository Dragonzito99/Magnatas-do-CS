import { expect, test } from 'vitest';
import { DESTINO_DO_JOGAR, ITENS_DO_MENU, itemAtivo, mostrarAvisoDeSala } from './navegacao';

test('o menu de cima não tem as áreas da equipe nem o "Seja um Magnata"', () => {
  const nomes = ITENS_DO_MENU.map((item) => item.nome);
  expect(nomes).not.toContain('Equipe');
  expect(nomes).not.toContain('Olho de Águia');
  expect(nomes.join(' ')).not.toMatch(/Seja um Magnata/i);
});

test('Clãs e Magnata Shop ficam no menu como "em breve", sem levar a lugar nenhum', () => {
  for (const nome of ['Clãs', 'Magnata Shop']) {
    const item = ITENS_DO_MENU.find((candidato) => candidato.nome === nome);
    expect(item).toMatchObject({ emBreve: true });
    expect(item).not.toHaveProperty('href');
  }
});

test('o botão JOGAR leva para a tela que junta salas, mix e Diversão', () => {
  expect(DESTINO_DO_JOGAR).toBe('/jogar');
  const nomes = ITENS_DO_MENU.map((item) => item.nome);
  for (const modo of ['Salas', 'Mix', 'Diversão']) expect(nomes).not.toContain(modo);
});

test('o item do menu acende na própria página e nas de dentro dela', () => {
  expect(itemAtivo('/ranking', '/ranking')).toBe(true);
  expect(itemAtivo('/jogar/123', '/jogar')).toBe(true);
  expect(itemAtivo('/jogarx', '/jogar')).toBe(false);
  expect(itemAtivo('/inicio', '/ranking')).toBe(false);
});

test('o aviso de sala aparece fora da tela Jogar, e some quando a sala está em partida', () => {
  const sala = { nome: 'Sala do Alfa', membros: 3, emPartida: false };
  expect(mostrarAvisoDeSala('/ranking', sala)).toBe(true);
  expect(mostrarAvisoDeSala('/jogar', sala)).toBe(false);
  expect(mostrarAvisoDeSala('/ranking', null)).toBe(false);
  expect(mostrarAvisoDeSala('/ranking', { ...sala, emPartida: true })).toBe(false);
});
