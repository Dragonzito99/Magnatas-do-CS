import { and, asc, count, eq, gt, ilike, inArray, isNull, ne, or } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { amizades, convitesDeSala, partidaJogadores, partidas, salaMembros, salas, usuarios, type Usuario } from '@/bd/esquema';
import { ESTADOS_ATIVOS_DE_PARTIDA, exigirAtivo } from './disponibilidade';
import { entrarNaSala, TAMANHO_DA_SALA } from './salas';

/** Visto há menos que isso conta como online, a mesma regra do "Online agora". */
const TEMPO_ONLINE_MS = 2 * 60_000;
/** O convite para a sala vence sozinho (dono, 11/11/2026). */
export const VALIDADE_DO_CONVITE_DE_SALA_MS = 2 * 60_000;

export class AmizadeInvalida extends Error {
  constructor() {
    super('Não dá para pedir amizade a essa pessoa.');
  }
}

export class NaoSaoAmigos extends Error {
  constructor() {
    super('Só dá para chamar amigos.');
  }
}

export class ConviteInvalido extends Error {
  constructor(public motivo: 'sem-sala' | 'cheia' | 'em-partida' | 'vencido' | 'ocupado') {
    super('Esse convite não vale mais.');
  }
}

export type SituacaoDaAmizade = 'nenhuma' | 'amigos' | 'pedido_enviado' | 'pedido_recebido';
export type Amigo = { id: string; apelido: string; avatarUrl: string | null; situacao: 'jogando' | 'online' | 'offline'; vistoEm: Date | null };

const doPar = (a: string, b: string) => or(and(eq(amizades.deId, a), eq(amizades.paraId, b)), and(eq(amizades.deId, b), eq(amizades.paraId, a)));

async function amizadeEntre(bd: Bd, a: string, b: string) {
  const [linha] = await bd.select().from(amizades).where(doPar(a, b));
  return linha ?? null;
}

export async function situacaoDaAmizade(bd: Bd, euId: string, outroId: string): Promise<SituacaoDaAmizade> {
  const linha = await amizadeEntre(bd, euId, outroId);
  if (!linha) return 'nenhuma';
  if (linha.estado === 'aceita') return 'amigos';
  return linha.deId === euId ? 'pedido_enviado' : 'pedido_recebido';
}

/**
 * Pede amizade. Se o outro já tinha pedido, vira amizade na hora. Só entre contas ativas, e nunca a si mesmo.
 */
export async function pedirAmizade(bd: Bd, eu: Pick<Usuario, 'id'>, outroId: string, agora: Date = new Date()): Promise<'pedido' | 'aceita' | 'ja_pedido' | 'ja_amigos'> {
  if (eu.id === outroId) throw new AmizadeInvalida();
  return bd.transaction(async (tx) => {
    await exigirAtivo(tx, eu);
    const [outro] = await tx.select({ estado: usuarios.estado }).from(usuarios).where(eq(usuarios.id, outroId));
    if (!outro || outro.estado !== 'ativo') throw new AmizadeInvalida();
    const [linha] = await tx.select().from(amizades).where(doPar(eu.id, outroId)).for('update');
    if (linha?.estado === 'aceita') return 'ja_amigos';
    if (linha && linha.deId === eu.id) return 'ja_pedido';
    if (linha) {
      await tx.update(amizades).set({ estado: 'aceita', aceitaEm: agora }).where(eq(amizades.id, linha.id));
      return 'aceita';
    }
    await tx.insert(amizades).values({ deId: eu.id, paraId: outroId, criadoEm: agora }).onConflictDoNothing();
    return 'pedido';
  });
}

/** Aceita ou recusa o pedido que o outro mandou. Recusar apaga o pedido, e ele pode pedir de novo depois. */
export async function responderAmizade(bd: Bd, eu: Pick<Usuario, 'id'>, outroId: string, aceitar: boolean, agora: Date = new Date()): Promise<void> {
  const pendente = and(eq(amizades.deId, outroId), eq(amizades.paraId, eu.id), eq(amizades.estado, 'pendente'));
  if (aceitar) await bd.update(amizades).set({ estado: 'aceita', aceitaEm: agora }).where(pendente);
  else await bd.delete(amizades).where(pendente);
}

/** Desfaz a amizade (ou cancela o pedido enviado), nos dois sentidos. */
export async function desfazerAmizade(bd: Bd, eu: Pick<Usuario, 'id'>, outroId: string): Promise<void> {
  await bd.delete(amizades).where(doPar(eu.id, outroId));
}

export async function pedidosDeAmizadePara(bd: Bd, euId: string): Promise<{ id: string; apelido: string; avatarUrl: string | null }[]> {
  return bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(amizades)
    .innerJoin(usuarios, eq(usuarios.id, amizades.deId))
    .where(and(eq(amizades.paraId, euId), eq(amizades.estado, 'pendente'), eq(usuarios.estado, 'ativo')))
    .orderBy(asc(amizades.criadoEm));
}

const ORDEM: Record<Amigo['situacao'], number> = { jogando: 0, online: 1, offline: 2 };

/** Os amigos de quem olha, com a bolinha: jogando (numa partida), online ou offline. Quem joga vem primeiro. */
export async function amigosDe(bd: Bd, euId: string, agora: Date = new Date()): Promise<Amigo[]> {
  const linhas = await bd
    .select({ deId: amizades.deId, paraId: amizades.paraId })
    .from(amizades)
    .where(and(eq(amizades.estado, 'aceita'), or(eq(amizades.deId, euId), eq(amizades.paraId, euId))));
  const ids = linhas.map((linha) => (linha.deId === euId ? linha.paraId : linha.deId));
  if (ids.length === 0) return [];
  const [pessoas, jogando] = await Promise.all([
    bd
      .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl, vistoEm: usuarios.vistoEm })
      .from(usuarios)
      .where(and(inArray(usuarios.id, ids), eq(usuarios.estado, 'ativo'))),
    bd
      .select({ id: partidaJogadores.usuarioId })
      .from(partidaJogadores)
      .innerJoin(partidas, eq(partidas.id, partidaJogadores.partidaId))
      .where(and(inArray(partidaJogadores.usuarioId, ids), inArray(partidas.estado, [...ESTADOS_ATIVOS_DE_PARTIDA]))),
  ]);
  const emPartida = new Set(jogando.map((linha) => linha.id));
  const limite = agora.getTime() - TEMPO_ONLINE_MS;
  return pessoas
    .map((pessoa) => ({
      ...pessoa,
      situacao: (emPartida.has(pessoa.id) ? 'jogando' : pessoa.vistoEm && pessoa.vistoEm.getTime() >= limite ? 'online' : 'offline') as Amigo['situacao'],
    }))
    .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.apelido.localeCompare(b.apelido, 'pt-BR'));
}

export async function saoAmigos(bd: Bd, a: string, b: string): Promise<boolean> {
  return (await amizadeEntre(bd, a, b))?.estado === 'aceita';
}

/**
 * Chama um amigo para a sua sala. Vence em 2 minutos; chamar de novo renova. A sala precisa ter vaga e estar fora de
 * partida.
 */
export async function convidarParaSala(bd: Bd, eu: Pick<Usuario, 'id'>, amigoId: string, agora: Date = new Date()): Promise<void> {
  if (!(await saoAmigos(bd, eu.id, amigoId))) throw new NaoSaoAmigos();
  const [vinculo] = await bd.select({ salaId: salaMembros.salaId }).from(salaMembros).where(eq(salaMembros.usuarioId, eu.id));
  if (!vinculo) throw new ConviteInvalido('sem-sala');
  const [sala] = await bd.select().from(salas).where(eq(salas.id, vinculo.salaId));
  if (!sala) throw new ConviteInvalido('sem-sala');
  if (sala.partidaId) throw new ConviteInvalido('em-partida');
  const [{ total }] = await bd.select({ total: count() }).from(salaMembros).where(eq(salaMembros.salaId, sala.id));
  if (total >= TAMANHO_DA_SALA) throw new ConviteInvalido('cheia');
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_CONVITE_DE_SALA_MS);
  await bd
    .insert(convitesDeSala)
    .values({ salaId: sala.id, deId: eu.id, paraId: amigoId, expiraEm, criadoEm: agora })
    .onConflictDoUpdate({ target: [convitesDeSala.salaId, convitesDeSala.paraId], set: { deId: eu.id, expiraEm, criadoEm: agora } });
}

export type ConviteDeSala = { id: string; salaId: string; salaNome: string; membros: number; deApelido: string; expiraEm: Date };

/** Os convites que ainda valem: dentro do prazo, com a sala existindo, com vaga e fora de partida. */
export async function convitesDeSalaPara(bd: Bd, euId: string, agora: Date = new Date()): Promise<ConviteDeSala[]> {
  const linhas = await bd
    .select({ id: convitesDeSala.id, salaId: salas.id, salaNome: salas.nome, deApelido: usuarios.apelido, expiraEm: convitesDeSala.expiraEm })
    .from(convitesDeSala)
    .innerJoin(salas, eq(salas.id, convitesDeSala.salaId))
    .innerJoin(usuarios, eq(usuarios.id, convitesDeSala.deId))
    .where(and(eq(convitesDeSala.paraId, euId), gt(convitesDeSala.expiraEm, agora), isNull(salas.partidaId)))
    .orderBy(asc(convitesDeSala.criadoEm));
  if (linhas.length === 0) return [];
  const contagem = await bd
    .select({ salaId: salaMembros.salaId, total: count() })
    .from(salaMembros)
    .where(inArray(salaMembros.salaId, linhas.map((linha) => linha.salaId)))
    .groupBy(salaMembros.salaId);
  const membros = new Map(contagem.map((linha) => [linha.salaId, linha.total]));
  return linhas.map((linha) => ({ ...linha, membros: membros.get(linha.salaId) ?? 0 })).filter((linha) => linha.membros < TAMANHO_DA_SALA);
}

/** Entra na sala do convite (com as mesmas regras de entrar pelo Jogar) e apaga o convite. */
export async function aceitarConviteDeSala(bd: Bd, eu: Pick<Usuario, 'id'>, conviteId: string, agora: Date = new Date()): Promise<string> {
  const [convite] = await bd.select().from(convitesDeSala).where(and(eq(convitesDeSala.id, conviteId), eq(convitesDeSala.paraId, eu.id)));
  if (!convite || convite.expiraEm.getTime() <= agora.getTime()) throw new ConviteInvalido('vencido');
  await entrarNaSala(bd, eu, convite.salaId, agora);
  await bd.delete(convitesDeSala).where(eq(convitesDeSala.paraId, eu.id));
  return convite.salaId;
}

export async function recusarConviteDeSala(bd: Bd, eu: Pick<Usuario, 'id'>, conviteId: string): Promise<void> {
  await bd.delete(convitesDeSala).where(and(eq(convitesDeSala.id, conviteId), eq(convitesDeSala.paraId, eu.id)));
}

/** O % e o _ digitados valem como letra, não como curinga da busca. */
const semCuringas = (texto: string) => texto.replace(/[\\%_]/g, (letra) => `\\${letra}`);

export type MembroAchado ={ id: string; apelido: string; avatarUrl: string | null; situacao: SituacaoDaAmizade };

/** Procura membros ativos pelo apelido, para pedir amizade. Fora quem procura; até 20, em ordem de apelido. */
export async function procurarMembros(bd: Bd, euId: string, texto: string): Promise<MembroAchado[]> {
  const busca = texto.trim();
  if (busca.length < 2) return [];
  const achados = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(usuarios)
    .where(and(eq(usuarios.estado, 'ativo'), ne(usuarios.id, euId), ilike(usuarios.apelido, `%${semCuringas(busca)}%`)))
    .orderBy(asc(usuarios.apelido))
    .limit(20);
  return Promise.all(achados.map(async (membro) => ({ ...membro, situacao: await situacaoDaAmizade(bd, euId, membro.id) })));
}
