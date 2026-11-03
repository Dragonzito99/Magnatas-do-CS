import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Bd } from './conexao';
import * as esquema from './esquema';
import { usuarios, type Usuario } from './esquema';

export const STEAM_A = '76561198000000001';
export const STEAM_B = '76561198000000002';
export const STEAM_C = '76561198000000003';
export const STEAM_D = '76561198000000004';

export async function criarBancoDeTeste(): Promise<Bd> {
  const bd = drizzle(new PGlite(), { schema: esquema });
  await migrate(bd, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  return bd as unknown as Bd;
}

let proximo = 1000;

export async function criarUsuario(bd: Bd, valores: Partial<typeof usuarios.$inferInsert> = {}): Promise<Usuario> {
  proximo += 1;
  const [conta] = await bd
    .insert(usuarios)
    .values({ steamid64: `7656119800000${proximo}`, apelido: `jogador${proximo}`, ...valores })
    .returning();
  return conta;
}

export async function recarregar(bd: Bd, conta: Usuario): Promise<Usuario> {
  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  return atual;
}
