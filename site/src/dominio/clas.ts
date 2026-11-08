import { and, asc, count, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { claMembros, claPedidos, clas, usuarios, type Cla, type ClaMembro, type ClaPedido, type Usuario } from '@/bd/esquema';
import { exigirAtivo, type Transacao } from './disponibilidade';
import { exigirPermissao, registrarAuditoria } from './equipe';

export const MAXIMO_DE_MEMBROS = 20;
export const ESPERA_PARA_TROCAR_DE_CLA_MS = 24 * 60 * 60_000;
export const CORES_DO_CLA = ['ouro', 'roxo', 'verde', 'vermelho', 'prata'] as const;
const ENTRADAS = ['aberto', 'convite'] as const;
const MAXIMO_DA_DESCRICAO = 280;

type Motivo = 'nome' | 'sigla' | 'cor' | 'entrada' | 'repetido' | 'cheio' | 'ja-tem-cla' | 'espera' | 'cargo' | 'convite' | 'dono-sai' | 'sem-pedido' | 'sem-cla';

export class ClaInvalido extends Error {
  constructor(readonly motivo: Motivo) {
    super(`Clã inválido: ${motivo}`);
  }
}

export type DadosDoCla = Pick<Cla, 'nome' | 'sigla' | 'cor' | 'entrada' | 'descricao'>;
export type Cargo = ClaMembro['cargo'];
export type ClaResumido = Pick<Cla, 'id' | 'nome' | 'sigla' | 'cor'>;

/** Confere o que veio do formulário. A sigla vira maiúscula para [MGN] e [mgn] serem o mesmo clã. */
export function lerDadosDoCla(dados: { nome: string; sigla: string; cor: string; entrada: string; descricao: string }): DadosDoCla {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  const sigla = dados.sigla.trim().toUpperCase();
  if (nome.length < 3 || nome.length > 32) throw new ClaInvalido('nome');
  if (!/^[A-Z0-9]{2,4}$/.test(sigla)) throw new ClaInvalido('sigla');
  if (!(CORES_DO_CLA as readonly string[]).includes(dados.cor)) throw new ClaInvalido('cor');
  if (!(ENTRADAS as readonly string[]).includes(dados.entrada)) throw new ClaInvalido('entrada');
  return {
    nome,
    sigla,
    cor: dados.cor as Cla['cor'],
    entrada: dados.entrada as Cla['entrada'],
    descricao: dados.descricao.trim().slice(0, MAXIMO_DA_DESCRICAO),
  };
}

async function exigirNomeLivre(tx: Transacao, dados: Pick<DadosDoCla, 'nome' | 'sigla'>, ignorar?: string): Promise<void> {
  const [repetido] = await tx
    .select({ id: clas.id })
    .from(clas)
    .where(
      and(
        isNull(clas.desfeitoEm),
        or(sql`lower(${clas.nome}) = lower(${dados.nome})`, sql`lower(${clas.sigla}) = lower(${dados.sigla})`),
        ignorar ? ne(clas.id, ignorar) : undefined,
      ),
    );
  if (repetido) throw new ClaInvalido('repetido');
}

/** Sem clã e sem a espera de 24 horas: é o que vale para criar, entrar ou ser aceito. */
async function exigirLivreParaCla(tx: Transacao, usuarioId: string, agora: Date): Promise<void> {
  // Trava a pessoa: dois aceites ao mesmo tempo passam um de cada vez.
  const [pessoa] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).for('update');
  if (!pessoa || pessoa.estado !== 'ativo') throw new ClaInvalido('cargo');
  const [vinculo] = await tx.select().from(claMembros).where(eq(claMembros.usuarioId, usuarioId));
  if (vinculo) throw new ClaInvalido('ja-tem-cla');
  if (pessoa.saiuDeClaEm && agora.getTime() - pessoa.saiuDeClaEm.getTime() < ESPERA_PARA_TROCAR_DE_CLA_MS) throw new ClaInvalido('espera');
}

async function travarCla(tx: Transacao, claId: string): Promise<Cla> {
  const [cla] = await tx.select().from(clas).where(eq(clas.id, claId)).for('update');
  if (!cla || cla.desfeitoEm) throw new ClaInvalido('sem-cla');
  return cla;
}

/** Põe a pessoa no clã e apaga todos os pedidos e chamados dela, de qualquer clã. */
async function colocarNoCla(tx: Transacao, claId: string, usuarioId: string, cargo: Cargo, agora: Date): Promise<void> {
  await travarCla(tx, claId);
  await exigirLivreParaCla(tx, usuarioId, agora);
  const [{ total }] = await tx.select({ total: count() }).from(claMembros).where(eq(claMembros.claId, claId));
  if (total >= MAXIMO_DE_MEMBROS) throw new ClaInvalido('cheio');
  await tx.insert(claMembros).values({ usuarioId, claId, cargo, entrouEm: agora });
  await tx.delete(claPedidos).where(eq(claPedidos.usuarioId, usuarioId));
}

async function vinculoDe(tx: Bd | Transacao, usuarioId: string): Promise<ClaMembro | null> {
  const [vinculo] = await tx.select().from(claMembros).where(eq(claMembros.usuarioId, usuarioId));
  return vinculo ?? null;
}

/** Dono ou Capitão do clã: quem cuida de pedidos, chama gente e desafia. */
async function exigirComando(tx: Transacao, ator: Pick<Usuario, 'id'>, claId: string): Promise<ClaMembro> {
  await exigirAtivo(tx, ator);
  const vinculo = await vinculoDe(tx, ator.id);
  if (!vinculo || vinculo.claId !== claId || vinculo.cargo === 'membro') throw new ClaInvalido('cargo');
  return vinculo;
}

async function exigirDono(tx: Transacao, ator: Pick<Usuario, 'id'>): Promise<ClaMembro> {
  await exigirAtivo(tx, ator);
  const vinculo = await vinculoDe(tx, ator.id);
  if (!vinculo || vinculo.cargo !== 'dono') throw new ClaInvalido('cargo');
  return vinculo;
}

async function exigirMesmoCla(tx: Transacao, claId: string, usuarioId: string): Promise<ClaMembro> {
  const alvo = await vinculoDe(tx, usuarioId);
  if (!alvo || alvo.claId !== claId) throw new ClaInvalido('cargo');
  return alvo;
}

export async function criarCla(bd: Bd, dono: Pick<Usuario, 'id'>, dados: Parameters<typeof lerDadosDoCla>[0], agora: Date = new Date()): Promise<Cla> {
  const lidos = lerDadosDoCla(dados);
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, dono);
    await exigirLivreParaCla(tx, dono.id, agora);
    await exigirNomeLivre(tx, lidos);
    const [cla] = await tx
      .insert(clas)
      .values({ ...lidos, criadoEm: agora })
      .returning();
    await colocarNoCla(tx, cla.id, dono.id, 'dono', agora);
    return cla;
  });
}

export async function entrarNoCla(bd: Bd, ator: Pick<Usuario, 'id'>, claId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const cla = await travarCla(tx, claId);
    if (cla.entrada !== 'aberto') throw new ClaInvalido('convite');
    await colocarNoCla(tx, claId, ator.id, 'membro', agora);
  });
}

/** Em clã aberto já entra. Em clã de convite, fica esperando; se o clã já tinha chamado a pessoa, ela entra. */
export async function pedirParaEntrar(bd: Bd, ator: Pick<Usuario, 'id'>, claId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const cla = await travarCla(tx, claId);
    await exigirLivreParaCla(tx, ator.id, agora);
    const [existente] = await tx
      .select()
      .from(claPedidos)
      .where(and(eq(claPedidos.claId, claId), eq(claPedidos.usuarioId, ator.id)));
    if (cla.entrada === 'aberto' || existente?.tipo === 'chamado') {
      await colocarNoCla(tx, claId, ator.id, 'membro', agora);
      return;
    }
    await tx.insert(claPedidos).values({ claId, usuarioId: ator.id, tipo: 'pedido', criadoEm: agora }).onConflictDoNothing();
  });
}

/** Dono ou Capitão chama alguém. Se a pessoa já tinha pedido, os dois querem: ela entra na hora. */
export async function chamarParaCla(bd: Bd, ator: Pick<Usuario, 'id'>, claId: string, usuarioId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await travarCla(tx, claId);
    await exigirComando(tx, ator, claId);
    await exigirLivreParaCla(tx, usuarioId, agora);
    const [existente] = await tx
      .select()
      .from(claPedidos)
      .where(and(eq(claPedidos.claId, claId), eq(claPedidos.usuarioId, usuarioId)));
    if (existente?.tipo === 'pedido') {
      await colocarNoCla(tx, claId, usuarioId, 'membro', agora);
      return;
    }
    await tx.insert(claPedidos).values({ claId, usuarioId, tipo: 'chamado', criadoEm: agora }).onConflictDoNothing();
  });
}

/** Pedido é respondido pelo Dono ou por um Capitão; chamado, pela própria pessoa chamada. */
export async function responderPedido(bd: Bd, ator: Pick<Usuario, 'id'>, pedidoId: string, aceitar: boolean, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const [pedido] = await tx.select().from(claPedidos).where(eq(claPedidos.id, pedidoId));
    if (!pedido) throw new ClaInvalido('sem-pedido');
    if (pedido.tipo === 'pedido') await exigirComando(tx, ator, pedido.claId);
    else if (pedido.usuarioId !== ator.id) throw new ClaInvalido('cargo');
    if (!aceitar) {
      await tx.delete(claPedidos).where(eq(claPedidos.id, pedidoId));
      return;
    }
    await colocarNoCla(tx, pedido.claId, pedido.usuarioId, 'membro', agora);
  });
}

async function marcarSaida(tx: Transacao, usuarioId: string, agora: Date): Promise<void> {
  await tx.delete(claMembros).where(eq(claMembros.usuarioId, usuarioId));
  await tx.update(usuarios).set({ saiuDeClaEm: agora }).where(eq(usuarios.id, usuarioId));
}

async function desfazer(tx: Transacao, claId: string, agora: Date): Promise<void> {
  await tx.update(clas).set({ desfeitoEm: agora }).where(eq(clas.id, claId));
  await tx.delete(claMembros).where(eq(claMembros.claId, claId));
  await tx.delete(claPedidos).where(eq(claPedidos.claId, claId));
}

/** O Dono só sai depois de passar o cargo. Se for o último, sair desfaz o clã. */
export async function sairDoCla(bd: Bd, ator: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    const vinculo = await vinculoDe(tx, ator.id);
    if (!vinculo) throw new ClaInvalido('sem-cla');
    await travarCla(tx, vinculo.claId);
    if (vinculo.cargo === 'dono') {
      const [{ total }] = await tx.select({ total: count() }).from(claMembros).where(eq(claMembros.claId, vinculo.claId));
      if (total > 1) throw new ClaInvalido('dono-sai');
      await marcarSaida(tx, ator.id, agora);
      await desfazer(tx, vinculo.claId, agora);
      return;
    }
    await marcarSaida(tx, ator.id, agora);
  });
}

/** O Dono expulsa qualquer um; o Capitão, só Membro. Quem sai expulso também espera as 24 horas. */
export async function expulsarDoCla(bd: Bd, ator: Pick<Usuario, 'id'>, usuarioId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    const meu = await vinculoDe(tx, ator.id);
    if (!meu) throw new ClaInvalido('cargo');
    const comando = await exigirComando(tx, ator, meu.claId);
    const alvo = await exigirMesmoCla(tx, comando.claId, usuarioId);
    if (alvo.cargo === 'dono' || (comando.cargo === 'capitao' && alvo.cargo !== 'membro')) throw new ClaInvalido('cargo');
    await marcarSaida(tx, usuarioId, agora);
  });
}

export async function mudarCargo(bd: Bd, ator: Pick<Usuario, 'id'>, usuarioId: string, cargo: 'capitao' | 'membro'): Promise<void> {
  await bd.transaction(async (tx) => {
    const dono = await exigirDono(tx, ator);
    const alvo = await exigirMesmoCla(tx, dono.claId, usuarioId);
    if (alvo.cargo === 'dono') throw new ClaInvalido('cargo');
    await tx.update(claMembros).set({ cargo }).where(eq(claMembros.usuarioId, usuarioId));
  });
}

/** O Dono passa o cargo e vira Capitão. */
export async function passarDono(bd: Bd, ator: Pick<Usuario, 'id'>, usuarioId: string): Promise<void> {
  await bd.transaction(async (tx) => {
    const dono = await exigirDono(tx, ator);
    const alvo = await exigirMesmoCla(tx, dono.claId, usuarioId);
    if (alvo.usuarioId === ator.id) throw new ClaInvalido('cargo');
    await tx.update(claMembros).set({ cargo: 'capitao' }).where(eq(claMembros.usuarioId, ator.id));
    await tx.update(claMembros).set({ cargo: 'dono' }).where(eq(claMembros.usuarioId, usuarioId));
  });
}

export async function editarCla(bd: Bd, ator: Pick<Usuario, 'id'>, dados: Parameters<typeof lerDadosDoCla>[0]): Promise<void> {
  const lidos = lerDadosDoCla(dados);
  await bd.transaction(async (tx) => {
    const dono = await exigirDono(tx, ator);
    await travarCla(tx, dono.claId);
    await exigirNomeLivre(tx, lidos, dono.claId);
    await tx.update(clas).set(lidos).where(eq(clas.id, dono.claId));
  });
}

/** Só Adm: para clã com nome ofensivo ou abandonado. Fica na auditoria. */
export async function desfazerCla(bd: Bd, adm: Pick<Usuario, 'id'>, claId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, adm, 'mudar_papel');
    const cla = await travarCla(tx, claId);
    await desfazer(tx, claId, agora);
    await registrarAuditoria(tx, { atorId: adm.id, acao: 'desfazer_cla', detalhes: { claId, nome: cla.nome, sigla: cla.sigla } });
  });
}

export async function claDoUsuario(bd: Bd, usuarioId: string): Promise<(Cla & { cargo: Cargo }) | null> {
  const [linha] = await bd
    .select({ cla: clas, cargo: claMembros.cargo })
    .from(claMembros)
    .innerJoin(clas, eq(claMembros.claId, clas.id))
    .where(eq(claMembros.usuarioId, usuarioId));
  return linha ? { ...linha.cla, cargo: linha.cargo } : null;
}

export async function claPorId(bd: Bd, claId: string): Promise<Cla | null> {
  const [cla] = await bd.select().from(clas).where(eq(clas.id, claId));
  return cla ?? null;
}

/** O clã de cada pessoa da lista, para mostrar a sigla ao lado do nome. Quem não tem clã fica de fora. */
export async function clasDosUsuarios(bd: Bd | Transacao, ids: string[]): Promise<Map<string, ClaResumido>> {
  if (ids.length === 0) return new Map();
  const linhas = await bd
    .select({ usuarioId: claMembros.usuarioId, id: clas.id, nome: clas.nome, sigla: clas.sigla, cor: clas.cor })
    .from(claMembros)
    .innerJoin(clas, eq(claMembros.claId, clas.id))
    .where(inArray(claMembros.usuarioId, ids));
  return new Map(linhas.map(({ usuarioId, ...cla }) => [usuarioId, cla]));
}

const ORDEM_DO_CARGO: Record<Cargo, number> = { dono: 0, capitao: 1, membro: 2 };

export async function membrosDoCla(bd: Bd, claId: string): Promise<{ id: string; apelido: string; avatarUrl: string | null; cargo: Cargo; xpTotal: number }[]> {
  const linhas = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl, cargo: claMembros.cargo, xpTotal: usuarios.xpTotal })
    .from(claMembros)
    .innerJoin(usuarios, eq(claMembros.usuarioId, usuarios.id))
    .where(eq(claMembros.claId, claId))
    .orderBy(asc(usuarios.apelido));
  return linhas.sort((a, b) => ORDEM_DO_CARGO[a.cargo] - ORDEM_DO_CARGO[b.cargo]);
}

export type PedidoDoCla = Pick<ClaPedido, 'id' | 'usuarioId' | 'criadoEm'> & { apelido: string; avatarUrl: string | null; xpTotal: number };

/** Os pedidos de quem quer entrar, para o Dono e os Capitães aceitarem ou recusarem. */
export async function pedidosDoCla(bd: Bd, claId: string): Promise<PedidoDoCla[]> {
  return bd
    .select({ id: claPedidos.id, usuarioId: claPedidos.usuarioId, criadoEm: claPedidos.criadoEm, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl, xpTotal: usuarios.xpTotal })
    .from(claPedidos)
    .innerJoin(usuarios, eq(claPedidos.usuarioId, usuarios.id))
    .where(and(eq(claPedidos.claId, claId), eq(claPedidos.tipo, 'pedido')))
    .orderBy(asc(claPedidos.criadoEm));
}

/** Os clãs que chamaram a pessoa. */
export async function chamadosDe(bd: Bd, usuarioId: string): Promise<{ id: string; cla: ClaResumido }[]> {
  const linhas = await bd
    .select({ id: claPedidos.id, claId: clas.id, nome: clas.nome, sigla: clas.sigla, cor: clas.cor })
    .from(claPedidos)
    .innerJoin(clas, eq(claPedidos.claId, clas.id))
    .where(and(eq(claPedidos.usuarioId, usuarioId), eq(claPedidos.tipo, 'chamado'), isNull(clas.desfeitoEm)))
    .orderBy(asc(claPedidos.criadoEm));
  return linhas.map(({ id, claId, ...cla }) => ({ id, cla: { id: claId, ...cla } }));
}

/** Os pedidos que a pessoa fez e ainda esperam resposta, para o botão virar "Pedido enviado". */
export async function pedidosFeitosPor(bd: Bd, usuarioId: string): Promise<Set<string>> {
  const linhas = await bd
    .select({ claId: claPedidos.claId })
    .from(claPedidos)
    .where(and(eq(claPedidos.usuarioId, usuarioId), eq(claPedidos.tipo, 'pedido')));
  return new Set(linhas.map((linha) => linha.claId));
}

/** A aba Procurar: os clãs ativos, filtrados por nome ou sigla. */
export async function procurarClas(bd: Bd, texto?: string): Promise<{ cla: Cla; membros: number }[]> {
  const busca = texto?.trim();
  const linhas = await bd
    .select({ cla: clas, membros: count(claMembros.usuarioId) })
    .from(clas)
    .leftJoin(claMembros, eq(claMembros.claId, clas.id))
    .where(and(isNull(clas.desfeitoEm), busca ? or(ilike(clas.nome, `%${busca}%`), ilike(clas.sigla, `%${busca}%`)) : undefined))
    .groupBy(clas.id)
    .orderBy(asc(clas.nome));
  return linhas;
}
