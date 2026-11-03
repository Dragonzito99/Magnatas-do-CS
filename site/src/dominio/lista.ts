import { asc, eq } from 'drizzle-orm';
import { tokenConfere } from '@/auth/token-servidor';
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

export async function respostaDaLista(bd: Bd, cabecalho: string | null, tokenEsperado: string | undefined): Promise<Response> {
  if (!tokenConfere(cabecalho, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  return new Response(await listaDeLiberados(bd), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
