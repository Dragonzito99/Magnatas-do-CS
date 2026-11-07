import { and, asc, count, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import { banimentos, cpfsBanidos, filaMix, salaMembros, salas, servidores, sessoes, usuarios, type Banimento, type Usuario } from '@/bd/esquema';
import type { ControladorServidor } from '@/servidor-jogo/controlador';
import type { Transacao } from './disponibilidade';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';
import { removerDaSala } from './salas';

export class MotivoDaPunicaoInvalido extends Error {
  constructor() {
    super(`Escreva o motivo, com até ${MAXIMO_DO_MOTIVO} caracteres.`);
  }
}

export class AlvoIndisponivel extends Error {
  constructor() {
    super('A situação desta conta não permite isso.');
  }
}

export class PropostaJaAberta extends Error {
  constructor() {
    super('Já existe uma proposta de banimento aberta para esta conta.');
  }
}

export class BanimentoIndisponivel extends Error {
  constructor() {
    super('Este banimento já foi decidido.');
  }
}

export class QuemPropoeNaoConfirma extends Error {
  constructor() {
    super('Quem propôs não pode confirmar. Outro Adm precisa decidir.');
  }
}

const MAXIMO_DO_MOTIVO = 500;

function motivoValido(motivo: string): string {
  const texto = motivo.trim();
  if (!texto || texto.length > MAXIMO_DO_MOTIVO) throw new MotivoDaPunicaoInvalido();
  return texto;
}

/** Ninguém age contra si mesmo, e GM não age contra Adm. */
async function travarAlvo(tx: Transacao, ator: Usuario, alvoId: string): Promise<Usuario> {
  if (ator.id === alvoId) throw new SemPermissao();
  const [alvo] = await tx.select().from(usuarios).where(eq(usuarios.id, alvoId)).for('update');
  if (!alvo) throw new AlvoIndisponivel();
  if (alvo.papel === 'adm' && ator.papel !== 'adm') throw new SemPermissao();
  return alvo;
}

async function tirarDaFilaEDaSala(tx: Transacao, usuarioId: string): Promise<void> {
  await tx.delete(filaMix).where(eq(filaMix.usuarioId, usuarioId));
  const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, usuarioId));
  if (!vinculo) return;
  const [sala] = await tx.select().from(salas).where(eq(salas.id, vinculo.salaId)).for('update');
  if (sala) await removerDaSala(tx, sala, usuarioId);
}

/** Roda depois da transação: se o RCON falhar, a punição continua valendo, e a lista de liberados barra a volta. */
async function expulsarDosServidores(bd: Bd, controlador: ControladorServidor, steamid64: string): Promise<void> {
  const ocupados = await bd.select().from(servidores).where(isNotNull(servidores.partidaId));
  const resultados = await Promise.allSettled(ocupados.map((servidor) => controlador.expulsar(servidor, steamid64)));
  resultados.forEach((resultado, indice) => {
    if (resultado.status === 'rejected') {
      console.warn(`Não foi possível expulsar a conta do servidor ${ocupados[indice].nome}:`, resultado.reason);
    }
  });
}

export async function suspender(
  bd: Bd,
  controlador: ControladorServidor,
  gm: Pick<Usuario, 'id'>,
  usuarioId: string,
  motivo: string,
): Promise<void> {
  const texto = motivoValido(motivo);
  const steamid64 = await bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, gm, 'moderar');
    const alvo = await travarAlvo(tx, ator, usuarioId);
    if (alvo.estado !== 'ativo') throw new AlvoIndisponivel();
    await tx.update(usuarios).set({ estado: 'suspenso' }).where(eq(usuarios.id, usuarioId));
    await tirarDaFilaEDaSala(tx, usuarioId);
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'suspender', alvoId: usuarioId, detalhes: { motivo: texto } });
    return alvo.steamid64;
  });
  await expulsarDosServidores(bd, controlador, steamid64);
}

export async function liberarSuspensao(bd: Bd, adm: Pick<Usuario, 'id'>, usuarioId: string, motivo: string): Promise<void> {
  const texto = motivoValido(motivo);
  await bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, adm, 'decidir_banimento');
    const alvo = await travarAlvo(tx, ator, usuarioId);
    if (alvo.estado !== 'suspenso') throw new AlvoIndisponivel();
    await tx.update(usuarios).set({ estado: 'ativo' }).where(eq(usuarios.id, usuarioId));
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'liberar_suspensao', alvoId: usuarioId, detalhes: { motivo: texto } });
  });
}

export async function proporBanimento(bd: Bd, gm: Pick<Usuario, 'id'>, usuarioId: string, motivo: string): Promise<Banimento> {
  const texto = motivoValido(motivo);
  return bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, gm, 'moderar');
    // A trava na conta faz duas propostas juntas passarem uma de cada vez.
    const alvo = await travarAlvo(tx, ator, usuarioId);
    if (alvo.estado === 'banido') throw new AlvoIndisponivel();
    const [aberta] = await tx
      .select({ id: banimentos.id })
      .from(banimentos)
      .where(and(eq(banimentos.usuarioId, usuarioId), eq(banimentos.estado, 'proposto')));
    if (aberta) throw new PropostaJaAberta();
    const [proposta] = await tx
      .insert(banimentos)
      .values({ usuarioId, cpfHmac: alvo.cpfHmac, motivo: texto, propostoPor: ator.id })
      .returning();
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'propor_banimento', alvoId: usuarioId, detalhes: { motivo: texto } });
    return proposta;
  });
}

async function travarBanimento(tx: Transacao, banimentoId: string, estado: Banimento['estado']): Promise<Banimento> {
  const [banimento] = await tx.select().from(banimentos).where(eq(banimentos.id, banimentoId)).for('update');
  if (!banimento || banimento.estado !== estado) throw new BanimentoIndisponivel();
  return banimento;
}

export async function confirmarBanimento(bd: Bd, controlador: ControladorServidor, adm: Pick<Usuario, 'id'>, banimentoId: string): Promise<void> {
  const steamid64 = await bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, adm, 'decidir_banimento');
    const proposta = await travarBanimento(tx, banimentoId, 'proposto');
    const alvo = await travarAlvo(tx, ator, proposta.usuarioId);

    if (proposta.propostoPor === ator.id) {
      const [{ total }] = await tx
        .select({ total: count() })
        .from(usuarios)
        .where(and(eq(usuarios.papel, 'adm'), eq(usuarios.estado, 'ativo')));
      if (total > 1) throw new QuemPropoeNaoConfirma();
    }

    await tx
      .update(banimentos)
      .set({ estado: 'confirmado', confirmadoPor: ator.id, cpfHmac: alvo.cpfHmac, decididoEm: new Date() })
      .where(eq(banimentos.id, banimentoId));
    await tx.update(usuarios).set({ estado: 'banido' }).where(eq(usuarios.id, alvo.id));
    if (alvo.cpfHmac) await tx.insert(cpfsBanidos).values({ cpfHmac: alvo.cpfHmac }).onConflictDoNothing();
    await tx.delete(sessoes).where(eq(sessoes.usuarioId, alvo.id));
    await tirarDaFilaEDaSala(tx, alvo.id);
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'confirmar_banimento', alvoId: alvo.id, detalhes: { banimentoId } });
    return alvo.steamid64;
  });
  await expulsarDosServidores(bd, controlador, steamid64);
}

export async function recusarBanimento(bd: Bd, adm: Pick<Usuario, 'id'>, banimentoId: string, motivo: string): Promise<void> {
  const texto = motivoValido(motivo);
  await bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, adm, 'decidir_banimento');
    const proposta = await travarBanimento(tx, banimentoId, 'proposto');
    await tx.update(banimentos).set({ estado: 'recusado', decididoEm: new Date() }).where(eq(banimentos.id, banimentoId));
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'recusar_banimento', alvoId: proposta.usuarioId, detalhes: { banimentoId, motivo: texto } });
  });
}

/** Só em caso de erro provado. O CPF continua bloqueado se outro banimento confirmado usar o mesmo código. */
export async function reverterBanimento(bd: Bd, adm: Pick<Usuario, 'id'>, banimentoId: string, motivo: string): Promise<void> {
  const texto = motivoValido(motivo);
  await bd.transaction(async (tx) => {
    const ator = await exigirPermissao(tx, adm, 'decidir_banimento');
    const banimento = await travarBanimento(tx, banimentoId, 'confirmado');
    await tx
      .update(banimentos)
      .set({ estado: 'revertido', revertidoPor: ator.id, motivoReversao: texto, decididoEm: new Date() })
      .where(eq(banimentos.id, banimentoId));
    await tx
      .update(usuarios)
      .set({ estado: 'ativo' })
      .where(and(eq(usuarios.id, banimento.usuarioId), eq(usuarios.estado, 'banido')));
    if (banimento.cpfHmac) {
      const [outro] = await tx
        .select({ id: banimentos.id })
        .from(banimentos)
        .where(and(eq(banimentos.cpfHmac, banimento.cpfHmac), eq(banimentos.estado, 'confirmado'), ne(banimentos.id, banimentoId)));
      if (!outro) await tx.delete(cpfsBanidos).where(eq(cpfsBanidos.cpfHmac, banimento.cpfHmac));
    }
    await registrarAuditoria(tx, { atorId: ator.id, acao: 'reverter_banimento', alvoId: banimento.usuarioId, detalhes: { banimentoId, motivo: texto } });
  });
}

export async function listarBanimentosAbertos(bd: Bd, leitor: Pick<Usuario, 'id'>) {
  await exigirPermissao(bd, leitor, 'moderar');
  const alvo = alias(usuarios, 'alvo');
  const proponente = alias(usuarios, 'proponente');
  return bd
    .select({
      id: banimentos.id,
      usuarioId: banimentos.usuarioId,
      motivo: banimentos.motivo,
      criadoEm: banimentos.criadoEm,
      alvoApelido: alvo.apelido,
      propostoPorApelido: sql<string>`coalesce(${proponente.apelido}, 'Sistema')`,
    })
    .from(banimentos)
    .innerJoin(alvo, eq(banimentos.usuarioId, alvo.id))
    .leftJoin(proponente, eq(banimentos.propostoPor, proponente.id))
    .where(eq(banimentos.estado, 'proposto'))
    .orderBy(asc(banimentos.criadoEm));
}
