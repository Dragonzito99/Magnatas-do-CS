import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { usuarios, type Usuario } from '@/bd/esquema';

export async function buscarPorSteam(bd: Bd, steamid64: string): Promise<Usuario | null> {
  const [conta] = await bd.select().from(usuarios).where(eq(usuarios.steamid64, steamid64));
  return conta ?? null;
}
