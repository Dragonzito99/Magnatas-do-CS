import { expect, test } from 'vitest';
import { linhaHltv, mvpDaPartida, ratingHltv1 } from './desempenho';

const semMultis = { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 };

test('rating 1.0 da HLTV de um jogador bom', () => {
  expect(ratingHltv1({ kills: 20, deaths: 15, rodadas: 24, k1: 8, k2: 3, k3: 2, k4: 0, k5: 0 })).toBe(1.22);
});

test('rating 1.0 da HLTV de um jogador fraco', () => {
  expect(ratingHltv1({ kills: 5, deaths: 20, rodadas: 20, k1: 5, k2: 0, k3: 0, k4: 0, k5: 0 })).toBe(0.21);
});

test('rating sem rodadas é 0, sem dividir por zero', () => {
  expect(ratingHltv1({ kills: 0, deaths: 0, rodadas: 0, ...semMultis })).toBe(0);
});

test('mvpDaPartida escolhe mais MVPs; empate, mais kills; empate, menor apelido', () => {
  const a = { mvps: 3, kills: 10, apelido: 'Zeca', rodadas: 20 };
  const b = { mvps: 5, kills: 8, apelido: 'Bia', rodadas: 20 };
  const c = { mvps: 5, kills: 12, apelido: 'Caio', rodadas: 20 };
  const d = { mvps: 5, kills: 12, apelido: 'Ana', rodadas: 20 };
  expect(mvpDaPartida([a, b])).toBe(b);
  expect(mvpDaPartida([a, b, c])).toBe(c);
  expect(mvpDaPartida([a, b, c, d])).toBe(d);
});

test('mvpDaPartida é null sem jogadores ou sem rodada jogada', () => {
  expect(mvpDaPartida([])).toBeNull();
  expect(mvpDaPartida([{ mvps: 0, kills: 0, apelido: 'A', rodadas: 0 }])).toBeNull();
});

test('linhaHltv monta K-D, +/-, ADR, KAST, HS% e Rating', () => {
  const linha = linhaHltv({ kills: 20, deaths: 15, damage: 2040, rodadas: 24, kast: 18, headshotKills: 9, k1: 8, k2: 3, k3: 2, k4: 0, k5: 0 });
  expect(linha).toEqual({ kd: '20-15', saldo: 5, adr: 85, kast: 75, hs: 45, rating: 1.22 });
});

test('linhaHltv com 0 kills e 0 rodadas não divide por zero', () => {
  expect(linhaHltv({ kills: 0, deaths: 0, damage: 0, rodadas: 0, kast: 0, headshotKills: 0, ...semMultis })).toEqual({
    kd: '0-0',
    saldo: 0,
    adr: 0,
    kast: 0,
    hs: 0,
    rating: 0,
  });
});
