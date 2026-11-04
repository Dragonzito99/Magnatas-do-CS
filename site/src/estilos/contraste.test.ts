import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const css = readFileSync(path.join(process.cwd(), 'src/estilos/global.css'), 'utf8');

function cor(variavel: string): string {
  const achada = new RegExp(`${variavel}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  if (!achada) throw new Error(`Variável ${variavel} sem cor hexadecimal.`);
  return achada[1];
}

function luminancia(hexadecimal: string): number {
  const canais = [1, 3, 5].map((inicio) => {
    const valor = parseInt(hexadecimal.slice(inicio, inicio + 2), 16) / 255;
    return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

test.each([['--tinta'], ['--tinta-2'], ['--tinta-3']])('%s tem contraste de 4,5:1 em página, painel e painel 2', (variavel) => {
  for (const fundo of ['--pagina', '--painel', '--painel-2']) {
    expect(contraste(cor(variavel), cor(fundo))).toBeGreaterThanOrEqual(4.5);
  }
});

test('o texto sobre o ouro tem contraste nas duas pontas do botão', () => {
  for (const fundo of ['#ffcf33', '#e88f00']) {
    expect(contraste(cor('--sobre-ouro'), fundo)).toBeGreaterThanOrEqual(4.5);
  }
});

test('o ouro se destaca em página e painel', () => {
  for (const fundo of ['--pagina', '--painel']) {
    expect(contraste(cor('--ouro'), cor(fundo))).toBeGreaterThanOrEqual(4.5);
  }
});

test('toda classe usada nas telas tem estilo', () => {
  const definidas = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((achado) => achado[1]));
  const telas = readdirSync(path.join(process.cwd(), 'src/app'), { recursive: true, encoding: 'utf8' }).filter((nome) => nome.endsWith('.tsx'));
  const semEstilo = telas.flatMap((nome) => {
    const texto = readFileSync(path.join(process.cwd(), 'src/app', nome), 'utf8');
    return [...texto.matchAll(/className="([^"]+)"/g)].flatMap((achado) => achado[1].split(/\s+/)).filter((classe) => !definidas.has(classe));
  });
  expect([...new Set(semEstilo)]).toEqual([]);
});

test('nenhum fundo claro sobrou', () => {
  expect(css).not.toMatch(/background(-color)?:\s*(#fff\b|#ffffff|white|#fff7ed)/i);
  expect(css).not.toMatch(/background(-color)?:\s*rgba\(255,\s*255,\s*255,\s*0?\.[3-9]/i);
});
