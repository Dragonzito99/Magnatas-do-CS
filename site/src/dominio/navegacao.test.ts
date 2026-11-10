import { expect, test } from 'vitest';
import { DESTINO_DO_JOGAR, ITENS_DO_MENU, itemAtivo, itensDoMenu, mostrarAvisoDeSala } from './navegacao';

test('o menu de cima não tem as áreas da equipe nem o "Seja um Magnata"', () => {
  const nomes = ITENS_DO_MENU.map((item) => item.nome);
  expect(nomes).not.toContain('Equipe');
  expect(nomes).not.toContain('Olho de Águia');
  expect(nomes.join(' ')).not.toMatch(/Seja um Magnata/i);
});

test('Magnata Shop fica no menu como "em breve", sem levar a lugar nenhum', () => {
  const item = ITENS_DO_MENU.find((candidato) => candidato.nome === 'Magnata Shop');
  expect(item).toMatchObject({ emBreve: true });
  expect(item).not.toHaveProperty('href');
});

test('com a loja aberta, Magnata Shop leva à loja e às compras, e o Baú fica ao lado', () => {
  const itens = itensDoMenu(true);
  const loja = itens.find((candidato) => candidato.nome === 'Magnata Shop');
  expect(loja).toMatchObject({ href: '/loja', destaque: true });
  expect(loja?.emBreve).toBeFalsy();
  expect(loja?.filhos?.map((filho) => [filho.nome, filho.href])).toEqual([
    ['Loja', '/loja'],
    ['Minhas compras', '/compras'],
    ['Apoie o clube', '/apoio'],
  ]);
  expect(itens.map((candidato) => candidato.nome)).toEqual([...ITENS_DO_MENU.map((candidato) => candidato.nome), 'Baú']);
  expect(itens.at(-1)).toMatchObject({ nome: 'Baú', href: '/bau' });
  expect(itensDoMenu(false)).toBe(ITENS_DO_MENU);
});

test('Clãs saiu do "em breve" e abre Meu clã, Procurar, Ranking e Criar', () => {
  const item = ITENS_DO_MENU.find((candidato) => candidato.nome === 'Clãs');
  expect(item).toMatchObject({ href: '/clas' });
  expect(item?.emBreve).toBeFalsy();
  expect(item?.filhos?.map((filho) => [filho.nome, filho.href])).toEqual([
    ['Meu clã', '/clas'],
    ['Procurar clãs', '/clas?aba=procurar'],
    ['Ranking de clãs', '/clas?aba=ranking'],
    ['Criar clã', '/clas?aba=criar'],
  ]);
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

test('o menu começa por Notícias e Jogo, e o Jogo abre Como funciona, Modos, Mapas, Patentes e Regras', () => {
  expect(ITENS_DO_MENU.slice(0, 2).map((item) => [item.nome, item.href])).toEqual([
    ['Notícias', '/noticias'],
    ['Jogo', '/jogo'],
  ]);
  const jogo = ITENS_DO_MENU.find((item) => item.nome === 'Jogo');
  expect(jogo?.filhos?.map((filho) => [filho.nome, filho.href])).toEqual([
    ['Como funciona', '/jogo#como-funciona'],
    ['Modos', '/jogo#modos'],
    ['Mapas', '/jogo#mapas'],
    ['Patentes', '/patentes'],
    ['Regras', '/jogo#regras'],
  ]);
});

test('o Jogo acende também na página das patentes', () => {
  const jogo = ITENS_DO_MENU.find((item) => item.nome === 'Jogo')!;
  expect(itemAtivo('/patentes', jogo.href!, jogo.filhos)).toBe(true);
  expect(itemAtivo('/ranking', jogo.href!, jogo.filhos)).toBe(false);
});

test('como no rascunho, o menu tem Comunidade no lugar de Convites, e o convite fica dentro dela', () => {
  const nomes = ITENS_DO_MENU.map((item) => item.nome);
  expect(nomes).toEqual(['Notícias', 'Jogo', 'Ranking', 'Comunidade', 'Clãs', 'Magnata Shop']);
  const comunidade = ITENS_DO_MENU.find((item) => item.nome === 'Comunidade');
  expect(comunidade).toMatchObject({ href: '/convites' });
  expect(comunidade?.filhos?.map((filho) => filho.nome)).toEqual(['Convites']);
});

test('como no rascunho, o Ranking abre Comunidade, Mix do mês e MVPs', () => {
  const ranking = ITENS_DO_MENU.find((item) => item.nome === 'Ranking');
  expect(ranking?.filhos?.map((filho) => [filho.nome, filho.href])).toEqual([
    ['Comunidade', '/ranking'],
    ['Mix do mês', '/ranking?aba=mix'],
    ['MVPs', '/ranking?aba=mvps'],
  ]);
});
