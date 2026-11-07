import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { criarFluxoDeAvisos, formatarEvento, INTERVALO_DA_CONFERENCIA_MS, INTERVALO_DO_PING_MS, PING } from './sse';

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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const texto = (pedaco: Uint8Array | undefined) => new TextDecoder().decode(pedaco);

test('o fluxo manda ping, manda a partida uma vez só e para de conferir quando o navegador cancela', async () => {
  let conferencias = 0;
  const aviso = { partidaId: 'p1', aceiteAte: new Date('2026-11-06T22:00:30Z') };
  const fluxo = criarFluxoDeAvisos(async () => {
    conferencias += 1;
    return aviso;
  }, new AbortController().signal);
  const leitor = fluxo.getReader();
  expect(texto((await leitor.read()).value)).toBe(PING);
  await vi.advanceTimersByTimeAsync(0);
  expect(texto((await leitor.read()).value)).toBe(formatarEvento('partida', { partidaId: 'p1', aceiteAte: '2026-11-06T22:00:30.000Z' }));
  await vi.advanceTimersByTimeAsync(INTERVALO_DA_CONFERENCIA_MS * 3);
  expect(conferencias).toBe(4);
  await leitor.cancel();
  const antes = conferencias;
  await vi.advanceTimersByTimeAsync(INTERVALO_DO_PING_MS * 2);
  expect(conferencias).toBe(antes);
});

test('o fluxo fecha quando o pedido é abortado', async () => {
  let conferencias = 0;
  const controle = new AbortController();
  const fluxo = criarFluxoDeAvisos(async () => {
    conferencias += 1;
    return null;
  }, controle.signal);
  const leitor = fluxo.getReader();
  await leitor.read();
  controle.abort();
  const antes = conferencias;
  await vi.advanceTimersByTimeAsync(INTERVALO_DA_CONFERENCIA_MS * 5);
  expect(conferencias).toBe(antes);
  expect((await leitor.read()).done).toBe(true);
});
