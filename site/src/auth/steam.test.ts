import { expect, test, vi } from 'vitest';
import { STEAM_A } from '@/bd/teste';
import { urlDeLoginSteam, validarRetornoSteam } from './steam';

const RETORNO = 'http://localhost:3000/api/auth/steam/retorno';

const VALIDO = () =>
  new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_A}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_A}`,
    'openid.return_to': RETORNO,
    'openid.response_nonce': '2026-11-03T12:00:00Zabc',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'assinatura',
  });

const steamConfirma = async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
const steamNega = async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n');

test('url de login pede à Steam para voltar ao site e escolher a identidade', () => {
  const url = new URL(urlDeLoginSteam(RETORNO));
  expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
  expect(url.searchParams.get('openid.return_to')).toBe(RETORNO);
  expect(url.searchParams.get('openid.realm')).toBe('http://localhost:3000');
  expect(url.searchParams.get('openid.mode')).toBe('checkid_setup');
  expect(url.searchParams.get('openid.claimed_id')).toBe('http://specs.openid.net/auth/2.0/identifier_select');
});

test('aceita retorno confirmado pela Steam', async () => {
  expect(await validarRetornoSteam(VALIDO(), RETORNO, steamConfirma)).toBe(STEAM_A);
});

test('confirma com a Steam usando check_authentication e os mesmos parâmetros', async () => {
  const buscar = vi.fn(steamConfirma) as unknown as typeof fetch;
  await validarRetornoSteam(VALIDO(), RETORNO, buscar);
  const [url, opcoes] = vi.mocked(buscar).mock.calls[0];
  expect(url).toBe('https://steamcommunity.com/openid/login');
  const corpo = new URLSearchParams(String(opcoes?.body));
  expect(opcoes?.method).toBe('POST');
  expect(corpo.get('openid.mode')).toBe('check_authentication');
  expect(corpo.get('openid.sig')).toBe('assinatura');
});

test('recusa quando a Steam não confirma a assinatura', async () => {
  expect(await validarRetornoSteam(VALIDO(), RETORNO, steamNega)).toBeNull();
});

test('recusa resposta da Steam com is_valid em outro contexto', async () => {
  const enganosa = async () => new Response('is_valid:false\nerror:is_valid:true\n');
  expect(await validarRetornoSteam(VALIDO(), RETORNO, enganosa)).toBeNull();
});

test.each([
  ['openid.claimed_id', 'https://steamcommunity.com.falso.net/openid/id/76561198000000001'],
  ['openid.claimed_id', 'https://steamcommunity.com/openid/id/123'],
  ['openid.claimed_id', 'http://steamcommunity.com/openid/id/76561198000000001'],
  ['openid.identity', 'https://steamcommunity.com/openid/id/76561198000000002'],
  ['openid.op_endpoint', 'https://falso.net/openid/login'],
  ['openid.return_to', 'https://falso.net/retorno'],
  ['openid.mode', 'cancel'],
])('recusa %s adulterado sem nem consultar a Steam', async (campo, valor) => {
  const parametros = VALIDO();
  parametros.set(campo, valor);
  const buscar = vi.fn(steamConfirma) as unknown as typeof fetch;
  expect(await validarRetornoSteam(parametros, RETORNO, buscar)).toBeNull();
  expect(buscar).not.toHaveBeenCalled();
});

test('falha de rede na Steam não autentica ninguém', async () => {
  const falha = async () => {
    throw new Error('rede');
  };
  expect(await validarRetornoSteam(VALIDO(), RETORNO, falha)).toBeNull();
});

test('resposta de erro da Steam não autentica ninguém', async () => {
  const erro = async () => new Response('is_valid:true\n', { status: 500 });
  expect(await validarRetornoSteam(VALIDO(), RETORNO, erro)).toBeNull();
});
