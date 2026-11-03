import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { sessoes, usuarios, type Usuario } from '@/bd/esquema';

const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function criarSessao(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await bd.insert(sessoes).values({
    tokenHash: hashDoToken(token),
    usuarioId,
    expiraEm: new Date(agora.getTime() + DURACAO_MS),
  });
  return token;
}

export async function lerSessao(bd: Bd, token: string, agora: Date = new Date()): Promise<Usuario | null> {
  const [linha] = await bd
    .select({ usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(and(eq(sessoes.tokenHash, hashDoToken(token)), gt(sessoes.expiraEm, agora)));
  return linha?.usuario ?? null;
}

export async function encerrarSessao(bd: Bd, token: string): Promise<void> {
  await bd.delete(sessoes).where(eq(sessoes.tokenHash, hashDoToken(token)));
}
