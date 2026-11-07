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

/** Os scripts de desenvolvimento só mexem num banco desta máquina, nunca no da VPS. */
export function ehBancoLocal(url: string | undefined): boolean {
  try {
    const host = new URL(url ?? '').hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

export function exigirBancoLocal(): void {
  if (process.env.NODE_ENV === 'production' || !ehBancoLocal(process.env.DATABASE_URL)) {
    throw new Error('Este script é só para desenvolvimento e só roda num banco local.');
  }
}
