import { eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { usuarios, type Usuario } from '@/bd/esquema';

export async function buscarPorSteam(bd: Bd, steamid64: string): Promise<Usuario | null> {
  const [conta] = await bd.select().from(usuarios).where(eq(usuarios.steamid64, steamid64));
  return conta ?? null;
}

/** Quando a Steam falha, o perfil volta só com o SteamID. Nesse caso, a conta mantém o que já tinha. */
export async function atualizarPerfil(
  bd: Bd,
  conta: Pick<Usuario, 'id' | 'steamid64'>,
  perfil: { apelido: string; avatarUrl?: string },
): Promise<void> {
  if (perfil.apelido === conta.steamid64) return;
  await bd
    .update(usuarios)
    .set({ apelido: perfil.apelido, avatarUrl: perfil.avatarUrl ?? null })
    .where(eq(usuarios.id, conta.id));
}
