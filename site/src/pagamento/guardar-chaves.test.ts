import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../scripts/guardar-chaves-mercadopago.sh');
const TOKEN = `APP_USR-1234567890123456-111111-${'a'.repeat(32)}-123456789`;
const SEGREDO = 'b'.repeat(64);

function rodar(conteudoInicial: string, entrada: string) {
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'chaves-mp-')), '.env.local');
  writeFileSync(arquivo, conteudoInicial);
  const resultado = spawnSync('bash', [SCRIPT], { input: entrada, encoding: 'utf8', env: { ...process.env, ARQUIVO_DO_AMBIENTE: arquivo, MODO_DE_TESTE: '1' } });
  return { codigo: resultado.status, saida: `${resultado.stdout}${resultado.stderr}`, conteudo: readFileSync(arquivo, 'utf8') };
}

test('guarda a chave e a assinatura dos avisos sem mostrar nenhuma das duas', () => {
  const { codigo, conteudo, saida } = rodar('DATABASE_URL=x\n', `${TOKEN}\n${SEGREDO}\n`);
  expect(codigo).toBe(0);
  expect(conteudo).toBe(`DATABASE_URL=x\nMP_ACCESS_TOKEN=${TOKEN}\nMP_WEBHOOK_SECRET=${SEGREDO}\n`);
  expect(saida).not.toContain(TOKEN);
  expect(saida).not.toContain(SEGREDO);
});

test('chave que não parece do Mercado Pago não muda nada', () => {
  const { codigo, conteudo, saida } = rodar('DATABASE_URL=x\n', `sk-ant-errada\n${SEGREDO}\n`);
  expect(codigo).toBe(1);
  expect(conteudo).toBe('DATABASE_URL=x\n');
  expect(saida).not.toContain('sk-ant-errada');
});

test('assinatura dos avisos estranha não muda nada, nem a chave que veio junto', () => {
  const { codigo, conteudo } = rodar('DATABASE_URL=x\n', `${TOKEN}\nnão é\n`);
  expect(codigo).toBe(1);
  expect(conteudo).toBe('DATABASE_URL=x\n');
});

test('trocar de novo substitui as linhas, e diz se a chave é de teste ou de produção', () => {
  const inicial = `DATABASE_URL=x\nMP_ACCESS_TOKEN=TEST-${'c'.repeat(40)}\nMP_WEBHOOK_SECRET=${'d'.repeat(64)}\n`;
  const teste = rodar(inicial, `TEST-${'e'.repeat(40)}\n${SEGREDO}\n`);
  expect(teste.codigo).toBe(0);
  expect(teste.conteudo.match(/MP_ACCESS_TOKEN=/g)).toHaveLength(1);
  expect(teste.saida).toContain('de teste');
  expect(rodar(inicial, `${TOKEN}\n${SEGREDO}\n`).saida).toContain('de produção');
});
