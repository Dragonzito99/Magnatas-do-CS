import { expect, test } from 'vitest';
import { biparNoAceite, SOM_DA_PARTIDA_ENCONTRADA, vozDaEtapa } from './sons-da-partida';

test('a voz de cada etapa é a gravação do dono', () => {
  expect(SOM_DA_PARTIDA_ENCONTRADA).toBe('/sons/partida-encontrada.mp3');
  expect(vozDaEtapa('vetando', true)).toBe('/sons/escolher-o-mapa.mp3');
  expect(vozDaEtapa('aguardando_jogadores', true)).toBe('/sons/entrar-no-servidor.mp3');
});

test('as outras etapas não têm voz, e quem só assiste não ouve', () => {
  for (const estado of ['aguardando_aceite', 'aguardando_servidor', 'carregando', 'ao_vivo', 'encerrada', 'cancelada'] as const) {
    expect(vozDaEtapa(estado, true)).toBeNull();
  }
  expect(vozDaEtapa('vetando', false)).toBeNull();
  expect(vozDaEtapa('aguardando_jogadores', false)).toBeNull();
});

test('o bip toca só para quem joga, enquanto a partida espera o aceite dele', () => {
  expect(biparNoAceite('aguardando_aceite', true, false)).toBe(true);
  expect(biparNoAceite('aguardando_aceite', true, true)).toBe(false);
  expect(biparNoAceite('aguardando_aceite', false, false)).toBe(false);
  expect(biparNoAceite('vetando', true, false)).toBe(false);
});
