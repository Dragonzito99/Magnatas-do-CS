import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../scripts/guardar-segredos-portal.sh');
const CHAVE_VALIDA = `sk-ant-api03-${'a'.repeat(40)}`;

function rodar(conteudoInicial: string, argumentos: string[], entrada: string) {
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'segredos-')), '.env.local');
  writeFileSync(arquivo, conteudoInicial);
  const resultado = spawnSync('bash', [SCRIPT, ...argumentos], {
    input: entrada,
    encoding: 'utf8',
    env: { ...process.env, ARQUIVO_DO_AMBIENTE: arquivo, MODO_DE_TESTE: '1' },
  });
  return { codigo: resultado.status, saida: `${resultado.stdout}${resultado.stderr}`, conteudo: readFileSync(arquivo, 'utf8') };
}

test('chave inválida não muda nada, nem o contato que veio junto', () => {
  const { codigo, conteudo, saida } = rodar('DATABASE_URL=x\n', ['contato@exemplo.com'], 'chave-errada\n');
  expect(codigo).toBe(1);
  expect(conteudo).toBe('DATABASE_URL=x\n');
  expect(saida).not.toContain('chave-errada');
});

test('contato inválido não muda nada', () => {
  const { codigo, conteudo } = rodar('DATABASE_URL=x\n', ['nao-e-email'], `${CHAVE_VALIDA}\n`);
  expect(codigo).toBe(1);
  expect(conteudo).toBe('DATABASE_URL=x\n');
});

test('arquivo sem quebra de linha no fim não gruda a linha nova na última variável', () => {
  const { codigo, conteudo, saida } = rodar('DATABASE_URL=x', ['contato@exemplo.com'], `${CHAVE_VALIDA}\n`);
  expect(codigo).toBe(0);
  expect(conteudo.split('\n')).toEqual(['DATABASE_URL=x', 'LIQUIPEDIA_CONTATO=contato@exemplo.com', `ANTHROPIC_API_KEY=${CHAVE_VALIDA}`, '']);
  expect(saida).not.toContain(CHAVE_VALIDA);
});

test('trocar de novo substitui as linhas em vez de repetir', () => {
  const inicial = `DATABASE_URL=x\nANTHROPIC_API_KEY=sk-ant-antiga-${'b'.repeat(30)}\nLIQUIPEDIA_CONTATO=velho@exemplo.com\n`;
  const { codigo, conteudo } = rodar(inicial, ['novo@exemplo.com'], `${CHAVE_VALIDA}\n`);
  expect(codigo).toBe(0);
  expect(conteudo.match(/ANTHROPIC_API_KEY=/g)).toHaveLength(1);
  expect(conteudo).toContain('LIQUIPEDIA_CONTATO=novo@exemplo.com');
  expect(conteudo).not.toContain('velho@exemplo.com');
});
