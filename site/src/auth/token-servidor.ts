import { createHash, timingSafeEqual } from 'node:crypto';

export function tokenConfere(cabecalho: string | null, esperado: string | undefined): boolean {
  if (!esperado || !cabecalho) return false;
  // Compara os hashes para o tempo não depender do tamanho nem do conteúdo do token.
  const hash = (texto: string) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(hash(cabecalho), hash(`Bearer ${esperado}`));
}
