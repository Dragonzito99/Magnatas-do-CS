import { expect, test } from 'vitest';
import { criarVerificador } from './verificador';

const CONTA = { id: 'id-de-teste' };

test('simulador não inicia em produção', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production', VERIFICADOR: 'simulador' })).toThrow(/produção/);
});

test('produção sem verificador configurado não inicia', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production' })).toThrow();
});

test('verificador desconhecido não inicia', () => {
  expect(() => criarVerificador({ NODE_ENV: 'development', VERIFICADOR: 'outro' })).toThrow();
});

test('desenvolvimento usa o simulador, com uma referência nova a cada início', async () => {
  const verificador = criarVerificador({ NODE_ENV: 'development', VERIFICADOR: 'simulador' });
  const primeira = await verificador.iniciar(CONTA);
  const segunda = await verificador.iniciar(CONTA);
  expect(primeira.url).toContain('/verificacao/simulador');
  expect(primeira.url).toContain(encodeURIComponent(primeira.referencia));
  expect(primeira.referencia).not.toBe(segunda.referencia);
  expect(verificador.nome).toBe('simulador');
});
