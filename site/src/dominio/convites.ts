import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { convites, usuarios, type Convite, type Usuario } from '@/bd/esquema';

export class SemConvites extends Error {
  constructor() {
    super('Você não tem convites disponíveis.');
  }
}

export class ConviteInvalido extends Error {
  constructor() {
    super('Este código de convite não é válido.');
  }
}

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TAMANHO_DO_CODIGO = 10;

function novoCodigo(): string {
  return Array.from({ length: TAMANHO_DO_CODIGO }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}

function normalizar(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export async function gerarConvite(bd: Bd, ator: Usuario): Promise<string> {
  return bd.transaction(async (tx) => {
    const [atual] = await tx.select().from(usuarios).where(eq(usuarios.id, ator.id));
    if (!atual || atual.estado !== 'ativo') throw new SemConvites();

    if (atual.papel === 'jogador') {
      const gastos = await tx
        .update(usuarios)
        .set({ convitesRestantes: sql`${usuarios.convitesRestantes} - 1` })
        .where(and(eq(usuarios.id, ator.id), gt(usuarios.convitesRestantes, 0)))
        .returning({ id: usuarios.id });
      if (gastos.length === 0) throw new SemConvites();
    }

    const codigo = novoCodigo();
    await tx.insert(convites).values({ codigo, criadoPor: ator.id });
    return codigo;
  });
}

export async function conviteValido(bd: Bd, codigo: string): Promise<boolean> {
  const [linha] = await bd
    .select({ id: convites.id })
    .from(convites)
    .where(and(eq(convites.codigo, normalizar(codigo)), isNull(convites.usadoEm), isNull(convites.revogadoEm)));
  return Boolean(linha);
}

export async function consumirConvite(
  bd: Bd,
  codigo: string,
  novo: { steamid64: string; apelido: string; avatarUrl?: string },
): Promise<Usuario> {
  return bd.transaction(async (tx) => {
    // A condição no próprio UPDATE garante que só um pedido fica com o código.
    const [convite] = await tx
      .update(convites)
      .set({ usadoEm: new Date() })
      .where(and(eq(convites.codigo, normalizar(codigo)), isNull(convites.usadoEm), isNull(convites.revogadoEm)))
      .returning();
    if (!convite) throw new ConviteInvalido();

    const [conta] = await tx
      .insert(usuarios)
      .values({ ...novo, convidadoPor: convite.criadoPor })
      .returning();
    await tx.update(convites).set({ usadoPor: conta.id }).where(eq(convites.id, convite.id));
    return conta;
  });
}

export async function revogarConvite(bd: Bd, ator: Usuario, codigo: string): Promise<void> {
  await bd.transaction(async (tx) => {
    const [convite] = await tx
      .update(convites)
      .set({ revogadoEm: new Date() })
      .where(
        and(
          eq(convites.codigo, normalizar(codigo)),
          eq(convites.criadoPor, ator.id),
          isNull(convites.usadoEm),
          isNull(convites.revogadoEm),
        ),
      )
      .returning();
    if (!convite) throw new ConviteInvalido();

    if (ator.papel === 'jogador') {
      await tx
        .update(usuarios)
        .set({ convitesRestantes: sql`${usuarios.convitesRestantes} + 1` })
        .where(eq(usuarios.id, ator.id));
    }
  });
}

export async function listarConvites(bd: Bd, ator: Usuario): Promise<Convite[]> {
  return bd.select().from(convites).where(eq(convites.criadoPor, ator.id)).orderBy(desc(convites.criadoEm));
}
