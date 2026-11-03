import { and, asc, count, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import { auditoria, usuarios, type Papel, type Usuario } from '@/bd/esquema';
import { pode, type Acao } from '@/auth/permissoes';

export class SemPermissao extends Error {
  constructor() {
    super('Você não tem permissão para isso.');
  }
}

export class UltimoAdm extends Error {
  constructor() {
    super('A plataforma precisa ter pelo menos um Adm ativo.');
  }
}

const MAXIMO_DE_CONVITES_POR_VEZ = 100;

type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

export async function registrarAuditoria(
  bd: Bd | Transacao,
  entrada: { atorId?: string; acao: string; alvoId?: string; detalhes?: unknown },
): Promise<void> {
  await bd.insert(auditoria).values(entrada);
}

async function exigirPermissao(tx: Transacao, ator: Usuario, acao: Acao) {
  const [atual] = await tx.select().from(usuarios).where(eq(usuarios.id, ator.id));
  if (!atual || !pode(atual, acao)) throw new SemPermissao();
}

export async function mudarPapel(bd: Bd, ator: Usuario, alvoId: string, papel: Papel): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'mudar_papel');
    const [alvo] = await tx.select().from(usuarios).where(eq(usuarios.id, alvoId));
    if (!alvo) throw new Error('Conta não encontrada.');
    if (alvo.papel === papel) return;

    if (alvo.papel === 'adm') {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(usuarios)
        .where(and(eq(usuarios.papel, 'adm'), eq(usuarios.estado, 'ativo'), ne(usuarios.id, alvoId)));
      if (total === 0) throw new UltimoAdm();
    }

    await tx.update(usuarios).set({ papel }).where(eq(usuarios.id, alvoId));
    await registrarAuditoria(tx, {
      atorId: ator.id,
      acao: 'mudar_papel',
      alvoId,
      detalhes: { de: alvo.papel, para: papel },
    });
  });
}

export async function darConvites(bd: Bd, ator: Usuario, alvoId: string, quantidade: number): Promise<void> {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_DE_CONVITES_POR_VEZ) {
    throw new Error(`A quantidade precisa ser um número inteiro de 1 a ${MAXIMO_DE_CONVITES_POR_VEZ}.`);
  }
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, ator, 'dar_convites');
    const [alvo] = await tx.select().from(usuarios).where(eq(usuarios.id, alvoId));
    if (!alvo) throw new Error('Conta não encontrada.');
    await tx
      .update(usuarios)
      .set({ convitesRestantes: alvo.convitesRestantes + quantidade })
      .where(eq(usuarios.id, alvoId));
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'dar_convites', alvoId, detalhes: { quantidade } });
  });
}

export async function listarMembros(bd: Bd) {
  const convidador = alias(usuarios, 'convidador');
  return bd
    .select({
      id: usuarios.id,
      apelido: usuarios.apelido,
      papel: usuarios.papel,
      estado: usuarios.estado,
      convitesRestantes: usuarios.convitesRestantes,
      convidadoPorApelido: convidador.apelido,
    })
    .from(usuarios)
    .leftJoin(convidador, eq(usuarios.convidadoPor, convidador.id))
    .orderBy(asc(usuarios.apelido));
}

/** Só a linha de comando chama isto: é como o dono vira o primeiro Adm. */
export async function criarOuPromoverAdm(bd: Bd, steamid64: string): Promise<Usuario> {
  if (!/^7656119[0-9]{10}$/.test(steamid64)) throw new Error(`'${steamid64}' não é um SteamID64.`);
  const [conta] = await bd
    .insert(usuarios)
    .values({ steamid64, apelido: steamid64, papel: 'adm' })
    .onConflictDoUpdate({ target: usuarios.steamid64, set: { papel: 'adm' } })
    .returning();
  await registrarAuditoria(bd, { acao: 'criar_adm', alvoId: conta.id });
  return conta;
}
