import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Bd } from '@/bd/conexao';
import { banimentos, denuncias, gravacoes, partidaJogadores, partidas, servidoresDiversao, usuarios, xpPartidas, type Partida, type Usuario } from '@/bd/esquema';
import { pode } from '@/auth/permissoes';
import { MODOS_DE_DIVERSAO, nomeDoMapaConhecido } from './diversao';
import { nomeDoMapa } from './textos-da-partida';
import { progressoDe } from './xp';

const ESPERA_DA_GRAVACAO_MS = 10 * 60_000;
const TAMANHO_DO_HISTORICO = 30;
const ULTIMOS_XP = 10;

const MODO_DA_PARTIDA: Record<Partida['tipo'], string> = { desafio: 'Competitivo', mix: 'Mix', cla: 'Clã x clã', treino: 'Treino', teste: 'Teste' };

export type SituacaoDaGravacao = 'disponivel' | 'aguardando' | 'sem' | 'apagada';

/** A gravação chega minutos depois do fim e às vezes não chega, então o tempo decide quando desistir. */
export function situacaoDaGravacao(
  partida: Pick<Partida, 'encerradaEm'>,
  gravacao: { apagadaEm: Date | null } | null,
  agora: Date = new Date(),
): SituacaoDaGravacao {
  if (gravacao) return gravacao.apagadaEm ? 'apagada' : 'disponivel';
  if (!partida.encerradaEm || agora.getTime() - partida.encerradaEm.getTime() < ESPERA_DA_GRAVACAO_MS) return 'aguardando';
  return 'sem';
}

export const umaCasa = (valor: number) => Math.round(valor * 10) / 10;
const duasCasas = (valor: number) => Math.round(valor * 100) / 100;
export const porcentagem = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
export const kdDe = (abates: number, mortes: number) => (mortes > 0 ? duasCasas(abates / mortes) : abates);

async function dadosDaEquipe(bd: Bd, jogador: Usuario) {
  const contraEle = await bd
    .select({
      id: denuncias.id,
      motivo: denuncias.motivo,
      estado: denuncias.estado,
      conclusao: denuncias.conclusao,
      criadoEm: denuncias.criadoEm,
      partidaId: denuncias.partidaId,
      partidaNumero: partidas.numero,
      denunciantePorApelido: usuarios.apelido,
    })
    .from(denuncias)
    .innerJoin(partidas, eq(denuncias.partidaId, partidas.id))
    .innerJoin(usuarios, eq(denuncias.denuncianteId, usuarios.id))
    .where(eq(denuncias.acusadoId, jogador.id))
    .orderBy(desc(denuncias.criadoEm));
  const [padrinho] = jogador.convidadoPor
    ? await bd.select({ id: usuarios.id, apelido: usuarios.apelido }).from(usuarios).where(eq(usuarios.id, jogador.convidadoPor))
    : [];
  const convidados = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido })
    .from(usuarios)
    .where(eq(usuarios.convidadoPor, jogador.id));

  const historicoDeBanimentos = await bd
    .select({
      id: banimentos.id,
      estado: banimentos.estado,
      motivo: banimentos.motivo,
      motivoReversao: banimentos.motivoReversao,
      criadoEm: banimentos.criadoEm,
      propostoPorApelido: sql<string>`coalesce(${usuarios.apelido}, 'Sistema')`,
    })
    .from(banimentos)
    .leftJoin(usuarios, eq(banimentos.propostoPor, usuarios.id))
    .where(eq(banimentos.usuarioId, jogador.id))
    .orderBy(desc(banimentos.criadoEm));

  return {
    estado: jogador.estado,
    steamid64: jogador.steamid64,
    banimentos: historicoDeBanimentos,
    denuncias: contraEle,
    convidadoPor: padrinho ?? null,
    convidados,
  };
}

/** O K/D de várias pessoas de uma vez, para os cartões das salas. Quem nunca terminou partida fica com zero. */
export async function kdDosJogadores(bd: Bd, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const linhas = await bd
    .select({
      usuarioId: partidaJogadores.usuarioId,
      abates: sql<number>`coalesce(sum(${partidaJogadores.kills}), 0)::int`,
      mortes: sql<number>`coalesce(sum(${partidaJogadores.deaths}), 0)::int`,
    })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .where(and(inArray(partidaJogadores.usuarioId, ids), eq(partidas.estado, 'encerrada'), ne(partidas.tipo, 'teste')))
    .groupBy(partidaJogadores.usuarioId);
  const kd = new Map(ids.map((id) => [id, 0]));
  for (const linha of linhas) kd.set(linha.usuarioId, kdDe(linha.abates, linha.mortes));
  return kd;
}

export type PartidaDoPerfil = {
  data: Date;
  modo: string;
  mapa: string | null;
  resultado: 'vitoria' | 'empate' | 'derrota';
  placar: string | null;
  abates: number;
  mortes: number | null;
  xp: number;
};

const ULTIMAS_DO_PERFIL = 5;

/** A tabela "Últimas partidas" do perfil: mix e salas pegam mapa, placar e mortes da partida; a Diversão, do que o servidor mandou. */
export async function ultimasPartidasDoPerfil(bd: Bd, jogadorId: string, limite: number = ULTIMAS_DO_PERFIL): Promise<PartidaDoPerfil[]> {
  const minhaLinha = alias(partidaJogadores, 'minha_linha');
  const linhas = await bd
    .select({
      xp: xpPartidas,
      tipo: partidas.tipo,
      mapaDaPartida: partidas.mapa,
      placar1: partidas.placar1,
      placar2: partidas.placar2,
      meuTime: minhaLinha.time,
      mortesNaPartida: minhaLinha.deaths,
    })
    .from(xpPartidas)
    .leftJoin(partidas, and(eq(xpPartidas.origem, 'partida'), sql`${partidas.id}::text = ${xpPartidas.referencia}`))
    .leftJoin(minhaLinha, and(eq(minhaLinha.partidaId, partidas.id), eq(minhaLinha.usuarioId, xpPartidas.usuarioId)))
    .where(eq(xpPartidas.usuarioId, jogadorId))
    .orderBy(desc(xpPartidas.criadoEm), desc(xpPartidas.id))
    .limit(limite);
  const servidores = await bd.select({ porta: servidoresDiversao.porta, modo: servidoresDiversao.modo }).from(servidoresDiversao);
  const modoDaPorta = new Map(servidores.map((servidor) => [servidor.porta, MODOS_DE_DIVERSAO.find((modo) => modo.valor === servidor.modo)?.nome ?? 'Diversão']));

  return linhas.map((linha) => {
    const base = { data: linha.xp.criadoEm, resultado: linha.xp.resultado, abates: linha.xp.abates, xp: linha.xp.xp };
    if (linha.xp.origem === 'partida') {
      const temPlacar = linha.placar1 !== null && linha.placar2 !== null;
      const meu = linha.meuTime === 2 ? linha.placar2 : linha.placar1;
      const deles = linha.meuTime === 2 ? linha.placar1 : linha.placar2;
      return {
        ...base,
        modo: MODO_DA_PARTIDA[linha.tipo ?? 'mix'],
        mapa: linha.mapaDaPartida ? (nomeDoMapaConhecido(linha.mapaDaPartida) ?? nomeDoMapa(linha.mapaDaPartida)) : null,
        placar: temPlacar ? `${meu} x ${deles}` : null,
        mortes: linha.mortesNaPartida ?? linha.xp.mortes,
      };
    }
    const porta = Number(linha.xp.referencia.split(':')[1]);
    return {
      ...base,
      modo: modoDaPorta.get(porta) ?? 'Diversão',
      mapa: linha.xp.mapa ? (nomeDoMapaConhecido(linha.xp.mapa) ?? linha.xp.mapa) : null,
      placar: linha.xp.placar,
      mortes: linha.xp.mortes,
    };
  });
}

export async function fichaDoJogador(bd: Bd, leitor: Pick<Usuario, 'id'>, jogadorId: string, agora: Date = new Date()) {
  const [jogador] = await bd.select().from(usuarios).where(eq(usuarios.id, jogadorId));
  if (!jogador) return null;
  const [leitorAtual] = await bd.select().from(usuarios).where(eq(usuarios.id, leitor.id));
  const ehEquipe = !!leitorAtual && pode(leitorAtual, 'moderar');

  const linhas = await bd
    .select({
      partida: partidas,
      time: partidaJogadores.time,
      kills: partidaJogadores.kills,
      deaths: partidaJogadores.deaths,
      assists: partidaJogadores.assists,
      damage: partidaJogadores.damage,
      headshotKills: partidaJogadores.headshotKills,
      rodadas: partidaJogadores.rodadas,
      gravacao: gravacoes,
    })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .leftJoin(gravacoes, eq(gravacoes.partidaId, partidas.id))
    .where(and(eq(partidaJogadores.usuarioId, jogadorId), eq(partidas.estado, 'encerrada'), ne(partidas.tipo, 'teste')))
    .orderBy(desc(partidas.encerradaEm));

  const soma = (campo: 'kills' | 'deaths' | 'assists' | 'damage' | 'headshotKills' | 'rodadas') => linhas.reduce((total, linha) => total + linha[campo], 0);
  const venceu = (linha: (typeof linhas)[number]) => linha.partida.vencedor === linha.time;
  const abates = soma('kills');
  const mortes = soma('deaths');
  const rodadas = soma('rodadas');
  const vitorias = linhas.filter(venceu).length;

  const estatisticas = {
    partidas: linhas.length,
    vitorias,
    vitoriasPct: porcentagem(vitorias, linhas.length),
    abates,
    mortes,
    assistencias: soma('assists'),
    abatesPorPartida: linhas.length > 0 ? umaCasa(abates / linhas.length) : 0,
    kd: kdDe(abates, mortes),
    hsPct: abates > 0 ? umaCasa((soma('headshotKills') / abates) * 100) : 0,
    adr: rodadas > 0 ? umaCasa(soma('damage') / rodadas) : 0,
  };

  const mapas = new Map<string, { partidas: number; vitorias: number; abates: number; mortes: number }>();
  for (const linha of linhas) {
    // Partida encerrada sempre tem mapa; o tipo só não sabe disso.
    if (!linha.partida.mapa) continue;
    const mapa = mapas.get(linha.partida.mapa) ?? { partidas: 0, vitorias: 0, abates: 0, mortes: 0 };
    mapa.partidas += 1;
    mapa.vitorias += venceu(linha) ? 1 : 0;
    mapa.abates += linha.kills;
    mapa.mortes += linha.deaths;
    mapas.set(linha.partida.mapa, mapa);
  }
  const porMapa = [...mapas]
    .map(([mapa, valores]) => ({
      mapa,
      partidas: valores.partidas,
      vitoriasPct: porcentagem(valores.vitorias, valores.partidas),
      kd: kdDe(valores.abates, valores.mortes),
    }))
    .sort((a, b) => b.partidas - a.partidas || a.mapa.localeCompare(b.mapa));

  // As linhas vêm da mais nova para a mais antiga, então a primeira com mais abates é a mais recente.
  const melhor = linhas.reduce<(typeof linhas)[number] | null>((atual, linha) => (!atual || linha.kills > atual.kills ? linha : atual), null);
  const melhorPartida = melhor && {
    id: melhor.partida.id,
    numero: melhor.partida.numero,
    tipo: melhor.partida.tipo,
    mapa: melhor.partida.mapa,
    kills: melhor.kills,
    kd: kdDe(melhor.kills, melhor.deaths),
  };

  const historico = linhas.slice(0, TAMANHO_DO_HISTORICO).map((linha) => ({
    id: linha.partida.id,
    numero: linha.partida.numero,
    tipo: linha.partida.tipo,
    mapa: linha.partida.mapa,
    placar1: linha.partida.placar1,
    placar2: linha.partida.placar2,
    encerradaEm: linha.partida.encerradaEm,
    time: linha.time,
    venceu: venceu(linha),
    kills: linha.kills,
    deaths: linha.deaths,
    assists: linha.assists,
    adr: linha.rodadas > 0 ? umaCasa(linha.damage / linha.rodadas) : 0,
    // Gravação é assunto da equipe: o membro não recebe nem a informação de que ela existe.
    ...(ehEquipe && {
      gravacao: situacaoDaGravacao(linha.partida, linha.gravacao, agora),
      gravacaoId: linha.gravacao?.id,
    }),
  }));

  const equipe = ehEquipe ? await dadosDaEquipe(bd, jogador) : undefined;
  const ultimosXp = await bd
    .select({ origem: xpPartidas.origem, abates: xpPartidas.abates, resultado: xpPartidas.resultado, xp: xpPartidas.xp, criadoEm: xpPartidas.criadoEm })
    .from(xpPartidas)
    .where(eq(xpPartidas.usuarioId, jogador.id))
    .orderBy(desc(xpPartidas.criadoEm), desc(xpPartidas.id))
    .limit(ULTIMOS_XP);
  return {
    xpTotal: jogador.xpTotal,
    progresso: progressoDe(jogador.xpTotal),
    ultimosXp,
    jogador: {
      id: jogador.id,
      apelido: jogador.apelido,
      avatarUrl: jogador.avatarUrl,
      papel: jogador.papel,
      criadoEm: jogador.criadoEm,
    },
    estatisticas,
    historico,
    porMapa,
    melhorPartida,
    // O SteamID identifica a pessoa fora do site, então outro membro não recebe.
    ...((ehEquipe || leitor.id === jogador.id) && { steamid64: jogador.steamid64 }),
    ...(equipe && { equipe }),
  };
}

export type Ficha = NonNullable<Awaited<ReturnType<typeof fichaDoJogador>>>;
