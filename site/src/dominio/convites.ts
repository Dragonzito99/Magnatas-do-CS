import { randomInt } from 'node:crypto';
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import { pode } from '@/auth/permissoes';
import { convites, presentes, usuarios, xpPartidas, type ConteudoDoPresente, type Convite, type Usuario } from '@/bd/esquema';
import { exigirPermissao } from './equipe';
import { itemDoCatalogo } from './loja';

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

/** Livre: nem usado, nem revogado, nem vencido. */
const livre = (codigo: string, agora: Date) =>
  and(eq(convites.codigo, normalizar(codigo)), isNull(convites.usadoEm), isNull(convites.revogadoEm), or(isNull(convites.venceEm), gt(convites.venceEm, agora)));

export async function conviteValido(bd: Bd, codigo: string, agora: Date = new Date()): Promise<boolean> {
  const [linha] = await bd.select({ id: convites.id }).from(convites).where(livre(codigo, agora));
  return Boolean(linha);
}

export async function consumirConvite(
  bd: Bd,
  codigo: string,
  novo: { steamid64: string; apelido: string; avatarUrl?: string },
  agora: Date = new Date(),
): Promise<Usuario> {
  return bd.transaction(async (tx) => {
    // A condição no próprio UPDATE garante que só um pedido fica com o código.
    const [convite] = await tx.update(convites).set({ usadoEm: agora }).where(livre(codigo, agora)).returning();
    if (!convite) throw new ConviteInvalido();

    const [conta] = await tx
      .insert(usuarios)
      .values({ ...novo, convidadoPor: convite.criadoPor })
      .returning();
    await tx.update(convites).set({ usadoPor: conta.id }).where(eq(convites.id, convite.id));
    // O presente do convite fica fechado no baú da conta nova.
    if (convite.presente) {
      await tx.insert(presentes).values({ usuarioId: conta.id, origem: 'convite', conteudo: convite.presente, recado: convite.presente.recado ?? null, criadoEm: agora });
    }
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

export class PresenteDoConviteInvalido extends Error {
  constructor() {
    super('O presente do convite não está certo.');
  }
}

// Limites do presente de convite: MagCoin vale dinheiro, então tem teto.
export const LIMITES_DO_PRESENTE = { diasPorItem: 90, grana: 5000, magcoin: 300, recado: 200, itens: 10 } as const;

/** Confere e limpa o presente: itens que existem, dias de 1 a 90, Grana e MagCoins dentro do teto, e algo dentro. */
export function presenteDoConvite(pedido: ConteudoDoPresente): ConteudoDoPresente {
  const itens = (pedido.itens ?? []).map((linha) => ({ itemId: linha.itemId, dias: Math.trunc(linha.dias) }));
  const grana = Math.trunc(pedido.grana ?? 0);
  const magcoin = Math.trunc(pedido.magcoin ?? 0);
  const recado = pedido.recado?.trim() ?? '';
  const repetidos = new Set(itens.map((linha) => linha.itemId)).size !== itens.length;
  if (
    repetidos ||
    itens.length > LIMITES_DO_PRESENTE.itens ||
    itens.some((linha) => !itemDoCatalogo(linha.itemId) || !(linha.dias >= 1 && linha.dias <= LIMITES_DO_PRESENTE.diasPorItem)) ||
    !(grana >= 0 && grana <= LIMITES_DO_PRESENTE.grana) ||
    !(magcoin >= 0 && magcoin <= LIMITES_DO_PRESENTE.magcoin) ||
    recado.length > LIMITES_DO_PRESENTE.recado ||
    (itens.length === 0 && grana === 0 && magcoin === 0)
  ) {
    throw new PresenteDoConviteInvalido();
  }
  return { itens, grana, magcoin, ...(recado ? { recado } : {}) };
}

/** Convite com presente: só o Adm cria, sem gastar convite, e pode ter data para vencer. */
export async function gerarConviteComPresente(bd: Bd, ator: Pick<Usuario, 'id'>, pedido: ConteudoDoPresente & { venceEm?: Date | null }): Promise<string> {
  await exigirPermissao(bd, ator, 'convite_com_presente');
  const presente = presenteDoConvite(pedido);
  const codigo = novoCodigo();
  await bd.insert(convites).values({ codigo, criadoPor: ator.id, presente, venceEm: pedido.venceEm ?? null });
  return codigo;
}

export type SituacaoDoConvite = 'livre' | 'usado' | 'revogado' | 'vencido';

export type ConviteDetalhado = {
  id: string;
  codigo: string;
  criadoEm: Date;
  venceEm: Date | null;
  situacao: SituacaoDoConvite;
  criadorApelido: string | null;
  /** Quem criou é quem pode revogar. */
  meu: boolean;
  presente: ConteudoDoPresente | null;
  usadoEm: Date | null;
  usadoPor: { id: string; apelido: string; avatarUrl: string | null; vistoEm: Date | null } | null;
  presenteAberto: boolean;
  partidas: number;
};

/** A lista dos convites com o que aconteceu com cada um. O Adm vê todos; o resto, só os que criou. */
export async function listarConvitesComDetalhes(bd: Bd, ator: Usuario, agora: Date = new Date()): Promise<ConviteDetalhado[]> {
  const criador = alias(usuarios, 'criador');
  const usado = alias(usuarios, 'usado');
  const linhas = await bd
    .select({
      convite: convites,
      criadorApelido: criador.apelido,
      usadoId: usado.id,
      usadoApelido: usado.apelido,
      usadoAvatar: usado.avatarUrl,
      usadoVisto: usado.vistoEm,
    })
    .from(convites)
    .leftJoin(criador, eq(criador.id, convites.criadoPor))
    .leftJoin(usado, eq(usado.id, convites.usadoPor))
    .where(pode(ator, 'convite_com_presente') ? undefined : eq(convites.criadoPor, ator.id))
    .orderBy(desc(convites.criadoEm));
  const contas = linhas.flatMap((linha) => (linha.usadoId ? [linha.usadoId] : []));
  const [partidas, abertos] = contas.length
    ? await Promise.all([
        bd.select({ usuarioId: xpPartidas.usuarioId, total: count() }).from(xpPartidas).where(inArray(xpPartidas.usuarioId, contas)).groupBy(xpPartidas.usuarioId),
        bd.select({ usuarioId: presentes.usuarioId, abertoEm: presentes.abertoEm }).from(presentes).where(and(inArray(presentes.usuarioId, contas), eq(presentes.origem, 'convite'))),
      ])
    : [[], []];
  return linhas.map((linha) => {
    const { convite } = linha;
    const situacao: SituacaoDoConvite = convite.usadoEm
      ? 'usado'
      : convite.revogadoEm
        ? 'revogado'
        : convite.venceEm && convite.venceEm.getTime() <= agora.getTime()
          ? 'vencido'
          : 'livre';
    const conta = linha.usadoId && linha.usadoApelido ? { id: linha.usadoId, apelido: linha.usadoApelido, avatarUrl: linha.usadoAvatar, vistoEm: linha.usadoVisto } : null;
    return {
      id: convite.id,
      codigo: convite.codigo,
      criadoEm: convite.criadoEm,
      venceEm: convite.venceEm,
      situacao,
      criadorApelido: linha.criadorApelido,
      meu: convite.criadoPor === ator.id,
      presente: convite.presente ?? null,
      usadoEm: convite.usadoEm,
      usadoPor: conta,
      presenteAberto: Boolean(conta && abertos.find((aberto) => aberto.usuarioId === conta.id)?.abertoEm),
      partidas: conta ? (partidas.find((partida) => partida.usuarioId === conta.id)?.total ?? 0) : 0,
    };
  });
}
