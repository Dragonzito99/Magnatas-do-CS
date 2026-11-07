import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { criarClienteLiquipedia, INTERVALO_DO_PARSE_MS, INTERVALO_ENTRE_PEDIDOS_MS, userAgentDaLiquipedia } from './liquipedia';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('os limites são os da Liquipedia: 2 segundos entre pedidos e 30 entre parses', () => {
  expect(INTERVALO_ENTRE_PEDIDOS_MS).toBe(2_000);
  expect(INTERVALO_DO_PARSE_MS).toBe(30_000);
});

test('o User-Agent identifica o site e o contato', () => {
  expect(userAgentDaLiquipedia('contato@exemplo.com')).toBe('MagnatasDoCS/1.0 (https://magnatasdocs.com.br; contato@exemplo.com)');
});

test('sem contato, não existe cliente', () => {
  expect(criarClienteLiquipedia(undefined)).toBeNull();
  expect(criarClienteLiquipedia('  ')).toBeNull();
});

test('pede só a api.php, com User-Agent e gzip, e espera 30 segundos entre dois parses', async () => {
  const chamadas: { url: string; quando: number; headers: Record<string, string> }[] = [];
  const buscar = vi.fn(async (url: string, opcoes: { headers: Record<string, string> }) => {
    chamadas.push({ url, quando: Date.now(), headers: opcoes.headers });
    return new Response(JSON.stringify({ parse: { text: 'ok' } }), { status: 200 });
  });
  const pedir = criarClienteLiquipedia('contato@exemplo.com', buscar as unknown as typeof fetch)!;
  const inicio = Date.now();
  const primeiro = pedir({ action: 'parse', page: 'A' });
  const segundo = pedir({ action: 'parse', page: 'B' });
  await vi.advanceTimersByTimeAsync(0);
  expect(chamadas).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(29_000);
  expect(chamadas).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1_000);
  await Promise.all([primeiro, segundo]);
  expect(chamadas).toHaveLength(2);
  expect(chamadas[1].quando - inicio).toBeGreaterThanOrEqual(30_000);
  expect(chamadas[0].url).toMatch(/^https:\/\/liquipedia\.net\/counterstrike\/api\.php\?/);
  expect(chamadas[0].url).toContain('page=A');
  expect(chamadas[0].headers['User-Agent']).toContain('contato@exemplo.com');
  expect(chamadas[0].headers['Accept-Encoding']).toBe('gzip');
});

test('resposta com erro HTTP vira exceção, para o cache antigo continuar valendo', async () => {
  const buscar = async () => new Response('limite', { status: 429 });
  const pedir = criarClienteLiquipedia('contato@exemplo.com', buscar as unknown as typeof fetch)!;
  const pedido = pedir({ action: 'query', meta: 'siteinfo' });
  const verificado = expect(pedido).rejects.toThrow(/429/);
  await vi.advanceTimersByTimeAsync(0);
  await verificado;
});
