import { readFileSync } from 'node:fs';

export function carregarAmbiente() {
  if (process.env.DATABASE_URL) return;
  for (const linha of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const separador = linha.indexOf('=');
    if (separador > 0 && !linha.startsWith('#')) {
      process.env[linha.slice(0, separador).trim()] = linha.slice(separador + 1).trim();
    }
  }
}
