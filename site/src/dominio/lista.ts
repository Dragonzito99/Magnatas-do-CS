import { createHash, timingSafeEqual } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { usuarios } from '@/bd/esquema';

export async function listaDeLiberados(bd: Bd): Promise<string> {
  const contas = await bd
    .select({ steamid64: usuarios.steamid64 })
    .from(usuarios)
    .where(eq(usuarios.estado, 'ativo'))
    .orderBy(asc(usuarios.steamid64));
  return contas.map((conta) => `${conta.steamid64}\n`).join('');
}

function tokenConfere(cabecalho: string | null, esperado: string | undefined): boolean {
  if (!esperado || !cabecalho) return false;
  // Compara os hashes para o tempo não depender do tamanho nem do conteúdo do token.
  const hash = (texto: string) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(hash(cabecalho), hash(`Bearer ${esperado}`));
}

export async function respostaDaLista(bd: Bd, cabecalho: string | null, tokenEsperado: string | undefined): Promise<Response> {
  if (!tokenConfere(cabecalho, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  return new Response(await listaDeLiberados(bd), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
