import { expect, test } from 'vitest';
import { criarVerificador } from './verificador';

const CONTA = { id: 'id-de-teste' };

test('simulador não inicia em produção', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production', VERIFICADOR: 'simulador' })).toThrow(/produção/);
});

test('simulador em produção só com a liberação explícita da fase de teste', () => {
  expect(() => criarVerificador({ NODE_ENV: 'production', VERIFICADOR: 'simulador', VERIFICADOR_SIMULADOR_EM_PRODUCAO: 'talvez' })).toThrow(/produção/);
  const verificador = criarVerificador({ NODE_ENV: 'production', VERIFICADOR: 'simulador', VERIFICADOR_SIMULADOR_EM_PRODUCAO: 'sim' });
  expect(verificador.nome).toBe('simulador');
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

test('Didit só inicia com a chave, o fluxo e o segredo do aviso guardados', () => {
  const completo = { NODE_ENV: 'production', VERIFICADOR: 'didit', DIDIT_API_KEY: 'chave', DIDIT_WORKFLOW_ID: 'fluxo', DIDIT_WEBHOOK_SECRET: 'segredo', SITE_URL: 'https://magnatasdocs.com.br' };
  expect(criarVerificador(completo).nome).toBe('didit');
  for (const falta of ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET']) {
    expect(() => criarVerificador({ ...completo, [falta]: '' })).toThrow(/Didit/);
  }
});
