import { expect, test, vi } from 'vitest';
import { avisarNoDiscord, enderecoDoDiscord, mensagemDaNoticia, mensagemDoResultado, webhookDoDiscord } from './discord';

test('sem endereço não há link', () => {
  expect(enderecoDoDiscord(undefined)).toBeNull();
  expect(enderecoDoDiscord('  ')).toBeNull();
});

test('só aceita endereço https', () => {
  expect(enderecoDoDiscord('https://discord.gg/abc')).toBe('https://discord.gg/abc');
  expect(enderecoDoDiscord('http://discord.gg/abc')).toBeNull();
  expect(enderecoDoDiscord('javascript:alert(1)')).toBeNull();
});

test('texto que não é endereço não vira link', () => {
  expect(enderecoDoDiscord('discord')).toBeNull();
});

test('o webhook só vale se for do próprio Discord', () => {
  expect(webhookDoDiscord('https://discord.com/api/webhooks/123/abc')).toBe('https://discord.com/api/webhooks/123/abc');
  expect(webhookDoDiscord(' https://discord.com/api/webhooks/123/abc ')).toBe('https://discord.com/api/webhooks/123/abc');
  expect(webhookDoDiscord(undefined)).toBeNull();
  expect(webhookDoDiscord('https://exemplo.com/api/webhooks/123/abc')).toBeNull();
  expect(webhookDoDiscord('http://discord.com/api/webhooks/123/abc')).toBeNull();
  expect(webhookDoDiscord('https://discord.com.mal.com/api/webhooks/1/a')).toBeNull();
});

test('a notícia vai com título, link para o site e o começo do texto, sem marcar ninguém', () => {
  const corpo = mensagemDaNoticia({ id: 'n1', titulo: 'Servidor novo', texto: 'a'.repeat(500) + ' @everyone' }, 'https://magnatasdocs.com.br/');
  expect(corpo.allowed_mentions).toEqual({ parse: [] });
  const [cartao] = corpo.embeds;
  expect(cartao.title).toBe('Servidor novo');
  expect(cartao.url).toBe('https://magnatasdocs.com.br/noticias/n1');
  expect(cartao.description.length).toBeLessThanOrEqual(300);
  expect(cartao.description.endsWith('…')).toBe(true);
});

test('o resultado mostra o placar com o vencedor em negrito e o link da partida', () => {
  const corpo = mensagemDoResultado(
    { id: 'p1', numero: 42, tipo: 'mix', mapa: 'de_mirage', nomeTime1: null, nomeTime2: null, placar1: 9, placar2: 13, vencedor: 2 },
    'https://magnatasdocs.com.br',
  );
  const [cartao] = corpo!.embeds;
  expect(cartao.title).toBe('Mix #42 · Mirage');
  expect(cartao.description).toBe('Time 1 9 x 13 **Time 2**');
  expect(cartao.url).toBe('https://magnatasdocs.com.br/partidas/p1');
  expect(corpo!.allowed_mentions).toEqual({ parse: [] });
});

test('no desafio aparecem os nomes das salas', () => {
  const corpo = mensagemDoResultado(
    { id: 'p2', numero: 7, tipo: 'desafio', mapa: 'de_inferno', nomeTime1: 'Os Brabos', nomeTime2: 'Vila', placar1: 13, placar2: 4, vencedor: 1 },
    'https://magnatasdocs.com.br',
  );
  expect(corpo!.embeds[0].description).toBe('**Os Brabos** 13 x 4 Vila');
});

test('partida de teste e treino não vão para o Discord', () => {
  const base = { id: 'p', numero: 1, mapa: 'de_dust2', nomeTime1: null, nomeTime2: null, placar1: 13, placar2: 0, vencedor: 1 };
  expect(mensagemDoResultado({ ...base, tipo: 'teste' }, 'https://x')).toBeNull();
  expect(mensagemDoResultado({ ...base, tipo: 'treino' }, 'https://x')).toBeNull();
});

test('avisar manda o corpo em JSON para o webhook', async () => {
  const buscar = vi.fn(async () => new Response(null, { status: 204 }));
  await avisarNoDiscord('https://discord.com/api/webhooks/1/a', { embeds: [], allowed_mentions: { parse: [] } }, buscar);
  expect(buscar).toHaveBeenCalledOnce();
  const [endereco, opcoes] = buscar.mock.calls[0] as unknown as [string, RequestInit];
  expect(endereco).toBe('https://discord.com/api/webhooks/1/a');
  expect(opcoes.method).toBe('POST');
  expect(JSON.parse(String(opcoes.body))).toEqual({ embeds: [], allowed_mentions: { parse: [] } });
});

test('sem webhook ou com o Discord fora do ar, o site segue sem erro', async () => {
  const buscar = vi.fn(async () => {
    throw new Error('fora do ar');
  });
  await avisarNoDiscord(undefined, { embeds: [], allowed_mentions: { parse: [] } }, buscar);
  expect(buscar).not.toHaveBeenCalled();
  await expect(avisarNoDiscord('https://discord.com/api/webhooks/1/a', { embeds: [], allowed_mentions: { parse: [] } }, buscar)).resolves.toBeUndefined();
});
