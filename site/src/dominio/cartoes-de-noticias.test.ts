import { expect, test } from 'vitest';
import { cartoesDeNoticias, FILTROS_DE_NOTICIAS, lerFiltroDeNoticias } from './cartoes-de-noticias';

const clube = [
  { id: 'a', titulo: 'Fixada', texto: 'Texto fixado', imagem: '/mapas/egypt.webp', fixada: true, criadoEm: new Date('2026-11-01T12:00:00Z') },
  { id: 'b', titulo: 'Nova', texto: 'Primeiro parágrafo.\n\nSegundo.', imagem: null, fixada: false, criadoEm: new Date('2026-11-06T12:00:00Z') },
];
const steam = [{ gid: 's1', titulo: 'Atualização do CS2', resumo: 'Resumo', url: 'https://steam/1', publicadaEm: new Date('2026-11-05T12:00:00Z') }];
const jogos = [{ pagina: 'IEM', torneio: 'IEM Beijing', time1: 'FURIA', time2: 'NAVI', placar: '2:1', quando: new Date('2026-11-04T12:00:00Z') }];

test('os filtros são os do rascunho, nesta ordem', () => {
  expect(FILTROS_DE_NOTICIAS.map((filtro) => filtro.nome)).toEqual(['Todas', 'Do clube', 'CS2 oficial', 'Times brasileiros']);
  expect(lerFiltroDeNoticias('cs2')).toBe('cs2');
  expect(lerFiltroDeNoticias('qualquer')).toBeNull();
});

test('em Todas, a primeira do clube vira destaque e o resto vem em cartões, da mais nova para a mais antiga', () => {
  const { destaque, cartoes } = cartoesDeNoticias({ clube, steam, jogos }, null);
  expect(destaque?.titulo).toBe('Fixada');
  expect(cartoes.map((cartao) => [cartao.tipo, cartao.titulo])).toEqual([
    ['clube', 'Nova'],
    ['cs2', 'Atualização do CS2'],
    ['times', 'FURIA x NAVI'],
  ]);
});

test('cada cartão tem foto, etiqueta e destino; os de fora do site abrem em outra aba', () => {
  const { cartoes } = cartoesDeNoticias({ clube, steam, jogos }, null);
  expect(cartoes.every((cartao) => cartao.imagem.startsWith('/'))).toBe(true);
  expect(cartoes.find((cartao) => cartao.tipo === 'clube')).toMatchObject({ etiqueta: 'Do clube', href: '/noticias/b', externo: false, resumo: 'Primeiro parágrafo.' });
  expect(cartoes.find((cartao) => cartao.tipo === 'cs2')).toMatchObject({ etiqueta: 'CS2 oficial', href: 'https://steam/1', externo: true });
  expect(cartoes.find((cartao) => cartao.tipo === 'times')).toMatchObject({ etiqueta: 'Times BR', resumo: 'IEM Beijing · 2:1', externo: true });
});

test('com filtro, só aparece aquele tipo, e o destaque só existe no filtro do clube', () => {
  expect(cartoesDeNoticias({ clube, steam, jogos }, 'cs2')).toMatchObject({ destaque: null, cartoes: [{ tipo: 'cs2' }] });
  const doClube = cartoesDeNoticias({ clube, steam, jogos }, 'clube');
  expect(doClube.destaque?.titulo).toBe('Fixada');
  expect(doClube.cartoes.map((cartao) => cartao.tipo)).toEqual(['clube']);
});
