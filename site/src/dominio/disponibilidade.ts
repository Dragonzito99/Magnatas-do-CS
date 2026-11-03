import { and, eq, inArray } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { filaMix, partidaJogadores, partidas, salaMembros, usuarios, type Usuario } from '@/bd/esquema';

export type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

export const ESTADOS_ATIVOS_DE_PARTIDA = ['aguardando_servidor', 'carregando', 'aguardando_jogadores', 'ao_vivo'] as const;

export class ContaSemAcesso extends Error {
  constructor() {
    super('Sua conta não pode fazer isso agora.');
  }
}

export class JaOcupado extends Error {
  constructor() {
    super('Você já está em uma sala, no mix ou em uma partida.');
  }
}

/** Confere no banco, porque o objeto da sessão pode estar desatualizado. */
export async function exigirAtivo(tx: Transacao, usuario: Pick<Usuario, 'id'>): Promise<Usuario> {
  const [atual] = await tx.select().from(usuarios).where(eq(usuarios.id, usuario.id));
  if (!atual || atual.estado !== 'ativo') throw new ContaSemAcesso();
  return atual;
}

/** Uma pessoa só pode estar em uma sala, no mix ou em uma partida de cada vez. */
export async function exigirLivre(tx: Transacao, usuarioId: string): Promise<void> {
  // Trava a linha da pessoa: dois pedidos juntos dela passam um de cada vez, e o segundo já vê o primeiro.
  await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).for('no key update');

  const [naSala] = await tx.select({ id: salaMembros.usuarioId }).from(salaMembros).where(eq(salaMembros.usuarioId, usuarioId));
  if (naSala) throw new JaOcupado();

  const [naFila] = await tx.select({ id: filaMix.usuarioId }).from(filaMix).where(eq(filaMix.usuarioId, usuarioId));
  if (naFila) throw new JaOcupado();

  const [emPartida] = await tx
    .select({ id: partidas.id })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .where(and(eq(partidaJogadores.usuarioId, usuarioId), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA])));
  if (emPartida) throw new JaOcupado();
}
