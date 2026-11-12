import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import { banimentos, chamados, denuncias, denunciasDeMensagem, denunciasDiversao, gravacoes, mensagens, partidaJogadores, partidas, usuarios, xpPartidas, type EstadoUsuario, type Partida, type Usuario } from '@/bd/esquema';
import { enderecoDaPartidaDaDiversao } from './avaliar';
import { nomeDoMapaConhecido } from './diversao';
import { ConclusaoInvalida, DenunciaIndisponivel, ESTADOS_COM_CHAMADO, MAXIMO_DO_TEXTO } from './denuncias';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';
import { kdDe, situacaoDaGravacao, umaCasa, type SituacaoDaGravacao } from './ficha';
import type { UsuarioPublico } from './salas';
import { nomeDaPartida } from './textos-da-partida';

const CHAVE_SEM_ACUSADO = 'a-definir';

export type CasoDeDenuncia = {
  chave: string;
  partida: Pick<Partida, 'id' | 'numero' | 'tipo' | 'mapa' | 'criadoEm' | 'encerradaEm'>;
  acusado: (UsuarioPublico & { estado: EstadoUsuario }) | null;
  denuncias: { id: string; motivo: string; criadoEm: Date; denuncianteId: string; denuncianteApelido: string }[];
  numeros: { kills: number; deaths: number; kd: number; hsPct: number; adr: number } | null;
  denunciasContraEle: number;
  temPropostaAberta: boolean;
  gravacao: SituacaoDaGravacao;
  gravacaoId?: string;
  podeEncerrar: boolean;
};

export async function listarCasosDeDenuncia(bd: Bd, leitor: Pick<Usuario, 'id'>, agora: Date = new Date()): Promise<CasoDeDenuncia[]> {
  await exigirPermissao(bd, leitor, 'moderar');
  const denunciante = alias(usuarios, 'denunciante');
  const abertas = await bd
    .select({
      id: denuncias.id,
      motivo: denuncias.motivo,
      criadoEm: denuncias.criadoEm,
      acusadoId: denuncias.acusadoId,
      denuncianteId: denuncias.denuncianteId,
      denuncianteApelido: denunciante.apelido,
      partida: partidas,
    })
    .from(denuncias)
    .innerJoin(partidas, eq(denuncias.partidaId, partidas.id))
    .innerJoin(denunciante, eq(denuncias.denuncianteId, denunciante.id))
    .where(ne(denuncias.estado, 'encerrada'))
    .orderBy(asc(denuncias.criadoEm));
  if (abertas.length === 0) return [];

  const partidaIds = [...new Set(abertas.map((linha) => linha.partida.id))];
  const acusadoIds = [...new Set(abertas.flatMap((linha) => (linha.acusadoId ? [linha.acusadoId] : [])))];
  const semAcusados = acusadoIds.length === 0;

  const jogadores = await bd.select().from(partidaJogadores).where(inArray(partidaJogadores.partidaId, partidaIds));
  const listaDeGravacoes = await bd.select().from(gravacoes).where(inArray(gravacoes.partidaId, partidaIds));
  const acusados = semAcusados
    ? []
    : await bd
        .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl, estado: usuarios.estado })
        .from(usuarios)
        .where(inArray(usuarios.id, acusadoIds));
  const contagens = semAcusados
    ? []
    : await bd
        .select({ acusadoId: denuncias.acusadoId, total: count() })
        .from(denuncias)
        .where(inArray(denuncias.acusadoId, acusadoIds))
        .groupBy(denuncias.acusadoId);
  const propostas = semAcusados
    ? []
    : await bd
        .select({ usuarioId: banimentos.usuarioId })
        .from(banimentos)
        .where(and(eq(banimentos.estado, 'proposto'), inArray(banimentos.usuarioId, acusadoIds)));

  const grupos = new Map<string, typeof abertas>();
  for (const linha of abertas) {
    const chave = `${linha.partida.id}:${linha.acusadoId ?? CHAVE_SEM_ACUSADO}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }

  const casos = [...grupos].map(([chave, linhas]): CasoDeDenuncia => {
    const { partida, acusadoId } = linhas[0];
    const jogouNaPartida = (usuarioId: string) => jogadores.some((j) => j.partidaId === partida.id && j.usuarioId === usuarioId);
    const dele = jogadores.find((j) => j.partidaId === partida.id && j.usuarioId === acusadoId);
    const gravacao = listaDeGravacoes.find((g) => g.partidaId === partida.id) ?? null;
    const situacao = situacaoDaGravacao(partida, gravacao, agora);
    const envolvido = acusadoId === leitor.id || linhas.some((linha) => linha.denuncianteId === leitor.id);
    return {
      chave,
      partida: {
        id: partida.id,
        numero: partida.numero,
        tipo: partida.tipo,
        mapa: partida.mapa,
        criadoEm: partida.criadoEm,
        encerradaEm: partida.encerradaEm,
      },
      acusado: acusados.find((conta) => conta.id === acusadoId) ?? null,
      denuncias: linhas.map(({ id, motivo, criadoEm, denuncianteId, denuncianteApelido }) => ({ id, motivo, criadoEm, denuncianteId, denuncianteApelido })),
      numeros: dele
        ? {
            kills: dele.kills,
            deaths: dele.deaths,
            kd: kdDe(dele.kills, dele.deaths),
            hsPct: dele.kills > 0 ? umaCasa((dele.headshotKills / dele.kills) * 100) : 0,
            adr: dele.rodadas > 0 ? umaCasa(dele.damage / dele.rodadas) : 0,
          }
        : null,
      denunciasContraEle: contagens.find((linha) => linha.acusadoId === acusadoId)?.total ?? 0,
      temPropostaAberta: propostas.some((proposta) => proposta.usuarioId === acusadoId),
      gravacao: situacao,
      ...(situacao === 'disponivel' && gravacao ? { gravacaoId: gravacao.id } : {}),
      // Sem acusado definido, o culpado pode ser qualquer um que jogou.
      podeEncerrar: !envolvido && (acusadoId !== null || !jogouNaPartida(leitor.id)),
    };
  });

  return casos.sort(
    (a, b) => b.denuncias.length - a.denuncias.length || a.denuncias[0].criadoEm.getTime() - b.denuncias[0].criadoEm.getTime(),
  );
}

export async function encerrarCaso(
  bd: Bd,
  gm: Pick<Usuario, 'id'>,
  caso: { partidaId: string; acusadoId: string | null },
  conclusao: string,
): Promise<void> {
  const texto = conclusao.trim();
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, gm, 'moderar');
    if (!texto || texto.length > MAXIMO_DO_TEXTO) throw new ConclusaoInvalida();

    const doCaso = and(
      eq(denuncias.partidaId, caso.partidaId),
      ne(denuncias.estado, 'encerrada'),
      caso.acusadoId ? eq(denuncias.acusadoId, caso.acusadoId) : isNull(denuncias.acusadoId),
    );
    const abertas = await tx.select().from(denuncias).where(doCaso).for('update');
    if (abertas.length === 0) throw new DenunciaIndisponivel();
    if (caso.acusadoId === gm.id || abertas.some((denuncia) => denuncia.denuncianteId === gm.id)) throw new SemPermissao();
    if (!caso.acusadoId) {
      const [jogou] = await tx
        .select({ id: partidaJogadores.usuarioId })
        .from(partidaJogadores)
        .where(and(eq(partidaJogadores.partidaId, caso.partidaId), eq(partidaJogadores.usuarioId, gm.id)));
      if (jogou) throw new SemPermissao();
    }

    await tx.update(denuncias).set({ estado: 'encerrada', analistaId: gm.id, conclusao: texto }).where(doCaso);
    await registrarAuditoria(tx, {
      atorId: gm.id,
      acao: 'encerrar_caso',
      alvoId: caso.acusadoId ?? undefined,
      detalhes: { partidaId: caso.partidaId, denuncias: abertas.map((denuncia) => denuncia.id), conclusao: texto },
    });
  });
}

export async function chamadosEmAndamento(bd: Bd, leitor: Pick<Usuario, 'id'>) {
  await exigirPermissao(bd, leitor, 'moderar');
  return bd
    .select({
      id: chamados.id,
      partidaId: partidas.id,
      partidaNumero: partidas.numero,
      partidaTipo: partidas.tipo,
      estado: partidas.estado,
      chamadoPorApelido: usuarios.apelido,
    })
    .from(chamados)
    .innerJoin(partidas, eq(chamados.partidaId, partidas.id))
    .innerJoin(usuarios, eq(chamados.chamadoPor, usuarios.id))
    .where(and(eq(chamados.estado, 'aberto'), inArray(partidas.estado, ESTADOS_COM_CHAMADO)))
    .orderBy(asc(chamados.criadoEm));
}

/**
 * A página se atualiza sozinha, então o caso aberto nunca pode trocar sem a pessoa pedir.
 * Sem isso, a conclusão escrita para um caso encerraria outro.
 */
export function casoEscolhido<T extends { chave: string }>(casos: T[], chave: string | undefined): { aberto: T | null; encerrado: boolean } {
  if (!chave) return { aberto: casos[0] ?? null, encerrado: false };
  const aberto = casos.find((caso) => caso.chave === chave) ?? null;
  return { aberto, encerrado: !aberto };
}

/** O banimento não guarda de qual partida veio, então o motivo leva o nome dela para o Adm. */
export function motivoDaProposta(partida: Pick<Partida, 'tipo' | 'numero'>, conclusao: string): string {
  const texto = conclusao.trim();
  if (!texto) throw new ConclusaoInvalida();
  return `${nomeDaPartida(partida)}: ${texto}`;
}

export type DenunciaDaDiversao = {
  id: string;
  endereco: string;
  mapa: string | null;
  motivo: string;
  criadoEm: Date;
  acusado: UsuarioPublico & { estado: EstadoUsuario };
  denuncianteApelido: string;
  podeEncerrar: boolean;
};

/** As denúncias abertas das partidas da Diversão (dono, 11/11/2026), da mais antiga para a mais nova. */
export async function listarDenunciasDaDiversao(bd: Bd, leitor: Pick<Usuario, 'id'>): Promise<DenunciaDaDiversao[]> {
  await exigirPermissao(bd, leitor, 'moderar');
  const acusado = alias(usuarios, 'acusado');
  const denunciante = alias(usuarios, 'denunciante');
  const abertas = await bd
    .select({
      id: denunciasDiversao.id,
      referencia: denunciasDiversao.referencia,
      motivo: denunciasDiversao.motivo,
      criadoEm: denunciasDiversao.criadoEm,
      denuncianteId: denunciasDiversao.denuncianteId,
      denuncianteApelido: denunciante.apelido,
      acusado: { id: acusado.id, apelido: acusado.apelido, avatarUrl: acusado.avatarUrl, estado: acusado.estado },
    })
    .from(denunciasDiversao)
    .innerJoin(acusado, eq(denunciasDiversao.acusadoId, acusado.id))
    .innerJoin(denunciante, eq(denunciasDiversao.denuncianteId, denunciante.id))
    .where(ne(denunciasDiversao.estado, 'encerrada'))
    .orderBy(asc(denunciasDiversao.criadoEm));
  if (abertas.length === 0) return [];
  const mapas = await bd
    .selectDistinctOn([xpPartidas.referencia], { referencia: xpPartidas.referencia, mapa: xpPartidas.mapa })
    .from(xpPartidas)
    .where(inArray(xpPartidas.referencia, [...new Set(abertas.map((linha) => linha.referencia))]));
  return abertas.map(({ referencia, denuncianteId, ...linha }) => {
    const mapa = mapas.find((item) => item.referencia === referencia)?.mapa ?? null;
    return {
      ...linha,
      endereco: enderecoDaPartidaDaDiversao(referencia),
      mapa: nomeDoMapaConhecido(mapa) ?? mapa,
      podeEncerrar: linha.acusado.id !== leitor.id && denuncianteId !== leitor.id,
    };
  });
}

export async function encerrarDenunciaDaDiversao(bd: Bd, gm: Pick<Usuario, 'id'>, id: string, conclusao: string): Promise<void> {
  const texto = conclusao.trim();
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, gm, 'moderar');
    if (!texto || texto.length > MAXIMO_DO_TEXTO) throw new ConclusaoInvalida();
    const [aberta] = await tx
      .select()
      .from(denunciasDiversao)
      .where(and(eq(denunciasDiversao.id, id), ne(denunciasDiversao.estado, 'encerrada')))
      .for('update');
    if (!aberta) throw new DenunciaIndisponivel();
    if (aberta.acusadoId === gm.id || aberta.denuncianteId === gm.id) throw new SemPermissao();
    await tx.update(denunciasDiversao).set({ estado: 'encerrada', analistaId: gm.id, conclusao: texto }).where(eq(denunciasDiversao.id, id));
    await registrarAuditoria(tx, {
      atorId: gm.id,
      acao: 'encerrar_denuncia_diversao',
      alvoId: aberta.acusadoId,
      detalhes: { referencia: aberta.referencia, denuncia: aberta.id, conclusao: texto },
    });
  });
}

export type DenunciaDeMensagem = {
  id: string;
  texto: string;
  enviadaEm: Date;
  criadoEm: Date;
  autor: UsuarioPublico & { estado: EstadoUsuario };
  denuncianteApelido: string;
  podeResolver: boolean;
};

/** As denúncias abertas de mensagens das conversas (dono, 12/11/2026), da mais antiga para a mais nova. */
export async function listarDenunciasDeMensagem(bd: Bd, leitor: Pick<Usuario, 'id'>): Promise<DenunciaDeMensagem[]> {
  await exigirPermissao(bd, leitor, 'moderar');
  const autor = alias(usuarios, 'autor');
  const denunciante = alias(usuarios, 'denunciante');
  const abertas = await bd
    .select({
      id: denunciasDeMensagem.id,
      texto: mensagens.texto,
      enviadaEm: mensagens.criadoEm,
      criadoEm: denunciasDeMensagem.criadoEm,
      denuncianteId: denunciasDeMensagem.denuncianteId,
      denuncianteApelido: denunciante.apelido,
      autor: { id: autor.id, apelido: autor.apelido, avatarUrl: autor.avatarUrl, estado: autor.estado },
    })
    .from(denunciasDeMensagem)
    .innerJoin(mensagens, eq(mensagens.id, denunciasDeMensagem.mensagemId))
    .innerJoin(autor, eq(autor.id, denunciasDeMensagem.autorId))
    .innerJoin(denunciante, eq(denunciante.id, denunciasDeMensagem.denuncianteId))
    .where(ne(denunciasDeMensagem.estado, 'encerrada'))
    .orderBy(asc(denunciasDeMensagem.criadoEm));
  return abertas.map(({ denuncianteId, ...linha }) => ({ ...linha, podeResolver: linha.autor.id !== leitor.id && denuncianteId !== leitor.id }));
}

const CONCLUSAO_DA_MENSAGEM = { apagar: 'Mensagem apagada', arquivar: 'Arquivada sem apagar' } as const;

/**
 * Apagar some com a mensagem para todos e fecha todas as denúncias dela; arquivar fecha só esta e deixa a mensagem.
 * Quem escreveu ou denunciou não resolve.
 */
export async function resolverDenunciaDeMensagem(bd: Bd, gm: Pick<Usuario, 'id'>, id: string, decisao: keyof typeof CONCLUSAO_DA_MENSAGEM, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await exigirPermissao(tx, gm, 'moderar');
    const [aberta] = await tx
      .select()
      .from(denunciasDeMensagem)
      .where(and(eq(denunciasDeMensagem.id, id), ne(denunciasDeMensagem.estado, 'encerrada')))
      .for('update');
    if (!aberta) throw new DenunciaIndisponivel();
    if (aberta.autorId === gm.id || aberta.denuncianteId === gm.id) throw new SemPermissao();
    const conclusao = CONCLUSAO_DA_MENSAGEM[decisao];
    const fechar = { estado: 'encerrada' as const, analistaId: gm.id, conclusao };
    if (decisao === 'apagar') {
      await tx.update(mensagens).set({ apagadaEm: agora }).where(eq(mensagens.id, aberta.mensagemId));
      await tx.update(denunciasDeMensagem).set(fechar).where(and(eq(denunciasDeMensagem.mensagemId, aberta.mensagemId), ne(denunciasDeMensagem.estado, 'encerrada')));
    } else {
      await tx.update(denunciasDeMensagem).set(fechar).where(eq(denunciasDeMensagem.id, id));
    }
    await registrarAuditoria(tx, {
      atorId: gm.id,
      acao: 'resolver_denuncia_de_mensagem',
      alvoId: aberta.autorId,
      detalhes: { denuncia: aberta.id, mensagemId: aberta.mensagemId, conclusao },
    });
  });
}
