import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { claMembros, clas, conversaMembros, conversas, denunciasDeMensagem, mensagens, usuarios, type Usuario } from '@/bd/esquema';
import { saoAmigos } from './amigos';
import { avisar } from './ao-vivo';
import { registrarAuditoria } from './equipe';

export const TAMANHO_MAXIMO_DA_MENSAGEM = 1000;
const LIMITE_DA_CONVERSA = 60;

export class SemAcessoAConversa extends Error {
  constructor() {
    super('Você não está nessa conversa.');
  }
}

export class MensagemInvalida extends Error {
  constructor() {
    super(`A mensagem precisa ter de 1 a ${TAMANHO_MAXIMO_DA_MENSAGEM} letras.`);
  }
}

export type TipoDeConversa = 'direta' | 'grupo' | 'cla';
export type ResumoDaConversa = {
  id: string;
  tipo: TipoDeConversa;
  nome: string;
  avatarUrl: string | null;
  /** Na direta, o amigo do outro lado (para o perfil e a bolinha). */
  outroId: string | null;
  ultima: string | null;
  ultimaEm: Date;
  naoLidas: number;
};
export type MensagemNaTela = { id: string; autorId: string; autorApelido: string; autorAvatarUrl: string | null; texto: string; criadoEm: Date };

const chaveDoPar = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

async function garantirMembro(bd: Bd, conversaId: string, usuarioId: string, agora: Date): Promise<void> {
  await bd.insert(conversaMembros).values({ conversaId, usuarioId, lidaAte: agora, entrouEm: agora }).onConflictDoNothing();
}

/**
 * Quem pode ler e escrever: na direta, os dois do par enquanto forem amigos; no grupo, quem foi chamado; na do clã,
 * quem está no clã agora (saiu do clã, perdeu o acesso).
 */
async function exigirAcesso(bd: Bd, usuarioId: string, conversaId: string, agora: Date) {
  const [conversa] = await bd.select().from(conversas).where(eq(conversas.id, conversaId));
  if (!conversa) throw new SemAcessoAConversa();
  if (conversa.tipo === 'cla') {
    const [vinculo] = await bd
      .select({ claId: claMembros.claId })
      .from(claMembros)
      .where(and(eq(claMembros.usuarioId, usuarioId), eq(claMembros.claId, conversa.claId ?? '')));
    if (!vinculo) throw new SemAcessoAConversa();
    await garantirMembro(bd, conversa.id, usuarioId, agora);
    return conversa;
  }
  const [membro] = await bd.select().from(conversaMembros).where(and(eq(conversaMembros.conversaId, conversaId), eq(conversaMembros.usuarioId, usuarioId)));
  if (!membro) throw new SemAcessoAConversa();
  if (conversa.tipo === 'direta') {
    const outroId = (conversa.chave ?? '').split(':').find((id) => id !== usuarioId);
    if (!outroId || !(await saoAmigos(bd, usuarioId, outroId))) throw new SemAcessoAConversa();
  }
  return conversa;
}

/** A conversa direta com um amigo, criada na primeira vez. Uma só por par. */
export async function conversaDiretaCom(bd: Bd, eu: Pick<Usuario, 'id'>, amigoId: string, agora: Date = new Date()): Promise<string> {
  if (eu.id === amigoId || !(await saoAmigos(bd, eu.id, amigoId))) throw new SemAcessoAConversa();
  const chave = chaveDoPar(eu.id, amigoId);
  const [existente] = await bd.select({ id: conversas.id }).from(conversas).where(eq(conversas.chave, chave));
  const id =
    existente?.id ??
    (await bd.insert(conversas).values({ tipo: 'direta', chave, criadoPor: eu.id, criadoEm: agora, ultimaEm: agora }).onConflictDoNothing().returning({ id: conversas.id }))[0]?.id ??
    (await bd.select({ id: conversas.id }).from(conversas).where(eq(conversas.chave, chave)))[0].id;
  await garantirMembro(bd, id, eu.id, agora);
  await garantirMembro(bd, id, amigoId, agora);
  return id;
}

/** Um grupo novo: o nome e os amigos que o criador chamou. Só dá para chamar amigos. */
export async function criarGrupo(bd: Bd, eu: Pick<Usuario, 'id'>, nome: string, amigosIds: string[], agora: Date = new Date()): Promise<string> {
  const limpo = nome.trim();
  if (limpo.length < 2 || limpo.length > 40) throw new MensagemInvalida();
  const unicos = [...new Set(amigosIds.filter((id) => id !== eu.id))];
  for (const amigoId of unicos) if (!(await saoAmigos(bd, eu.id, amigoId))) throw new SemAcessoAConversa();
  const [grupo] = await bd.insert(conversas).values({ tipo: 'grupo', nome: limpo, criadoPor: eu.id, criadoEm: agora, ultimaEm: agora }).returning({ id: conversas.id });
  await bd.insert(conversaMembros).values([eu.id, ...unicos].map((usuarioId) => ({ conversaId: grupo.id, usuarioId, lidaAte: agora, entrouEm: agora })));
  avisar([eu.id, ...unicos], { tipo: 'conversas' });
  return grupo.id;
}

/** Quem está na conversa agora, para os avisos na hora. */
async function membrosDa(bd: Bd, conversaId: string): Promise<string[]> {
  const linhas = await bd.select({ usuarioId: conversaMembros.usuarioId }).from(conversaMembros).where(eq(conversaMembros.conversaId, conversaId));
  return linhas.map((linha) => linha.usuarioId);
}

/** Chama mais um amigo para o grupo (quem está no grupo pode chamar). */
export async function adicionarAoGrupo(bd: Bd, eu: Pick<Usuario, 'id'>, conversaId: string, amigoId: string, agora: Date = new Date()): Promise<void> {
  const conversa = await exigirAcesso(bd, eu.id, conversaId, agora);
  if (conversa.tipo !== 'grupo' || !(await saoAmigos(bd, eu.id, amigoId))) throw new SemAcessoAConversa();
  await garantirMembro(bd, conversaId, amigoId, agora);
  avisar(await membrosDa(bd, conversaId), { tipo: 'conversas' });
}

export async function sairDoGrupo(bd: Bd, eu: Pick<Usuario, 'id'>, conversaId: string): Promise<void> {
  const [conversa] = await bd.select({ tipo: conversas.tipo }).from(conversas).where(eq(conversas.id, conversaId));
  if (conversa?.tipo !== 'grupo') return;
  await bd.delete(conversaMembros).where(and(eq(conversaMembros.conversaId, conversaId), eq(conversaMembros.usuarioId, eu.id)));
}

/** O grupo do clã de quem pede, criado na primeira vez. Sem clã, não há. */
export async function conversaDoCla(bd: Bd, eu: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<string | null> {
  const [vinculo] = await bd.select({ claId: claMembros.claId }).from(claMembros).where(eq(claMembros.usuarioId, eu.id));
  if (!vinculo) return null;
  await bd.insert(conversas).values({ tipo: 'cla', claId: vinculo.claId, criadoEm: agora, ultimaEm: agora }).onConflictDoNothing();
  const [conversa] = await bd.select({ id: conversas.id }).from(conversas).where(eq(conversas.claId, vinculo.claId));
  await garantirMembro(bd, conversa.id, eu.id, agora);
  return conversa.id;
}

export async function enviarMensagem(bd: Bd, eu: Pick<Usuario, 'id'>, conversaId: string, texto: string, agora: Date = new Date()): Promise<string> {
  const limpo = texto.trim();
  if (limpo.length === 0 || limpo.length > TAMANHO_MAXIMO_DA_MENSAGEM) throw new MensagemInvalida();
  await exigirAcesso(bd, eu.id, conversaId, agora);
  const [mensagem] = await bd.insert(mensagens).values({ conversaId, autorId: eu.id, texto: limpo, criadoEm: agora }).returning({ id: mensagens.id });
  await bd.update(conversas).set({ ultimaEm: agora }).where(eq(conversas.id, conversaId));
  // Quem escreve já leu tudo até aqui.
  await bd.update(conversaMembros).set({ lidaAte: agora }).where(and(eq(conversaMembros.conversaId, conversaId), eq(conversaMembros.usuarioId, eu.id)));
  avisar(await membrosDa(bd, conversaId), { tipo: 'mensagem', conversaId });
  return mensagem.id;
}

/** As últimas mensagens da conversa, da mais antiga para a mais nova; abrir marca tudo como lido. */
export async function mensagensDe(bd: Bd, eu: Pick<Usuario, 'id'>, conversaId: string, agora: Date = new Date()): Promise<MensagemNaTela[]> {
  await exigirAcesso(bd, eu.id, conversaId, agora);
  const linhas = await bd
    .select({
      id: mensagens.id,
      autorId: mensagens.autorId,
      autorApelido: usuarios.apelido,
      autorAvatarUrl: usuarios.avatarUrl,
      texto: mensagens.texto,
      criadoEm: mensagens.criadoEm,
    })
    .from(mensagens)
    .innerJoin(usuarios, eq(usuarios.id, mensagens.autorId))
    .where(and(eq(mensagens.conversaId, conversaId), isNull(mensagens.apagadaEm)))
    .orderBy(desc(mensagens.criadoEm))
    .limit(LIMITE_DA_CONVERSA);
  await bd.update(conversaMembros).set({ lidaAte: agora }).where(and(eq(conversaMembros.conversaId, conversaId), eq(conversaMembros.usuarioId, eu.id)));
  return linhas.reverse();
}

/** As conversas de quem olha (diretas, grupos e a do clã), com a última mensagem e as não lidas. */
export async function conversasDe(bd: Bd, euId: string, agora: Date = new Date()): Promise<ResumoDaConversa[]> {
  await conversaDoCla(bd, { id: euId }, agora);
  const minhas = await bd
    .select({ conversa: conversas, lidaAte: conversaMembros.lidaAte })
    .from(conversaMembros)
    .innerJoin(conversas, eq(conversas.id, conversaMembros.conversaId))
    .where(eq(conversaMembros.usuarioId, euId))
    .orderBy(desc(conversas.ultimaEm));
  const resumos: ResumoDaConversa[] = [];
  for (const { conversa, lidaAte } of minhas) {
    let nome = conversa.nome ?? 'Grupo';
    let avatarUrl: string | null = null;
    let outroId: string | null = null;
    if (conversa.tipo === 'direta') {
      outroId = (conversa.chave ?? '').split(':').find((id) => id !== euId) ?? null;
      if (!outroId || !(await saoAmigos(bd, euId, outroId))) continue;
      const [outro] = await bd.select({ apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl }).from(usuarios).where(eq(usuarios.id, outroId));
      nome = outro?.apelido ?? 'Amigo';
      avatarUrl = outro?.avatarUrl ?? null;
    }
    if (conversa.tipo === 'cla') {
      const [cla] = await bd.select({ nome: clas.nome, sigla: clas.sigla }).from(clas).where(eq(clas.id, conversa.claId ?? ''));
      const [noCla] = await bd.select({ id: claMembros.usuarioId }).from(claMembros).where(and(eq(claMembros.usuarioId, euId), eq(claMembros.claId, conversa.claId ?? '')));
      if (!cla || !noCla) continue;
      nome = `[${cla.sigla}] ${cla.nome}`;
    }
    const [ultima] = await bd
      .select({ texto: mensagens.texto })
      .from(mensagens)
      .where(and(eq(mensagens.conversaId, conversa.id), isNull(mensagens.apagadaEm)))
      .orderBy(desc(mensagens.criadoEm))
      .limit(1);
    const [{ total }] = await bd
      .select({ total: sql<number>`count(*)::int` })
      .from(mensagens)
      .where(and(eq(mensagens.conversaId, conversa.id), isNull(mensagens.apagadaEm), gt(mensagens.criadoEm, lidaAte), ne(mensagens.autorId, euId)));
    resumos.push({ id: conversa.id, tipo: conversa.tipo, nome, avatarUrl, outroId, ultima: ultima?.texto ?? null, ultimaEm: conversa.ultimaEm, naoLidas: total });
  }
  return resumos;
}

/** O número do balão: mensagens que outros mandaram depois da última leitura, em todas as conversas. */
export async function naoLidasDe(bd: Bd, euId: string, agora: Date = new Date()): Promise<number> {
  return (await conversasDe(bd, euId, agora)).reduce((soma, conversa) => soma + conversa.naoLidas, 0);
}

/** Denúncia de mensagem: vai para o Olho de Águia, onde a equipe apaga a mensagem ou arquiva. Repetir não duplica. */
export async function denunciarMensagem(bd: Bd, eu: Pick<Usuario, 'id'>, mensagemId: string, agora: Date = new Date()): Promise<void> {
  const [mensagem] = await bd.select().from(mensagens).where(eq(mensagens.id, mensagemId));
  if (!mensagem || mensagem.autorId === eu.id) return;
  await exigirAcesso(bd, eu.id, mensagem.conversaId, agora);
  const nova = await bd
    .insert(denunciasDeMensagem)
    .values({ mensagemId, denuncianteId: eu.id, autorId: mensagem.autorId, criadoEm: agora })
    .onConflictDoNothing()
    .returning({ id: denunciasDeMensagem.id });
  if (nova.length === 0) return;
  await registrarAuditoria(bd, { atorId: eu.id, acao: 'mensagem_denunciada', alvoId: mensagem.autorId, detalhes: { mensagemId, texto: mensagem.texto } });
}

/** A equipe apaga a mensagem denunciada: some para todos. */
export async function apagarMensagem(bd: Bd, mensagemId: string, agora: Date = new Date()): Promise<void> {
  await bd.update(mensagens).set({ apagadaEm: agora }).where(eq(mensagens.id, mensagemId));
}
