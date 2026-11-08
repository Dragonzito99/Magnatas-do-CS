import { expect, test } from 'vitest';
import { ehCelular } from './aparelho';

function cabecalhos(valores: Record<string, string>) {
  return new Headers(valores);
}

test('ehCelular reconhece Android, iPhone e iPad pelo navegador', () => {
  expect(ehCelular(cabecalhos({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' }))).toBe(true);
  expect(ehCelular(cabecalhos({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1' }))).toBe(true);
  expect(ehCelular(cabecalhos({ 'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }))).toBe(true);
});

test('ehCelular confia no aviso de celular do Chrome mesmo com o navegador no modo computador', () => {
  expect(ehCelular(cabecalhos({ 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36', 'sec-ch-ua-mobile': '?1' }))).toBe(true);
});

test('ehCelular deixa o PC ligar', () => {
  expect(
    ehCelular(cabecalhos({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'sec-ch-ua-mobile': '?0' })),
  ).toBe(false);
  expect(ehCelular(cabecalhos({}))).toBe(false);
});
