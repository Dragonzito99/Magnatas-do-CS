import { expect, test } from 'vitest';
import { formatarEvento, INTERVALO_DA_CONFERENCIA_MS, INTERVALO_DO_PING_MS, PING } from './sse';

test('um evento SSE leva o nome e os dados em JSON, terminando em linha vazia', () => {
  expect(formatarEvento('partida', { partidaId: 'abc', aceiteAte: '2026-11-06T22:00:30.000Z' })).toBe(
    'event: partida\ndata: {"partidaId":"abc","aceiteAte":"2026-11-06T22:00:30.000Z"}\n\n',
  );
});

test('o ping é um comentário, que o navegador ignora e o proxy deixa passar', () => {
  expect(PING).toBe(': ping\n\n');
});

test('confere a cada 2 segundos e faz ping a cada 20', () => {
  expect(INTERVALO_DA_CONFERENCIA_MS).toBe(2_000);
  expect(INTERVALO_DO_PING_MS).toBe(20_000);
});
