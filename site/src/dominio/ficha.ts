import { and, desc, eq } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { banimentos, denuncias, gravacoes, partidaJogadores, partidas, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import { pode } from '@/auth/permissoes';

const ESPERA_DA_GRAVACAO_MS = 10 * 60_000;
const TAMANHO_DO_HISTORICO = 30;

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

const umaCasa = (valor: number) => Math.round(valor * 10) / 10;
const duasCasas = (valor: number) => Math.round(valor * 100) / 100;

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
      propostoPorApelido: usuarios.apelido,
    })
    .from(banimentos)
    .innerJoin(usuarios, eq(banimentos.propostoPor, usuarios.id))
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
    .where(and(eq(partidaJogadores.usuarioId, jogadorId), eq(partidas.estado, 'encerrada')))
    .orderBy(desc(partidas.encerradaEm));

  const soma = (campo: 'kills' | 'deaths' | 'damage' | 'headshotKills' | 'rodadas') => linhas.reduce((total, linha) => total + linha[campo], 0);
  const abates = soma('kills');
  const mortes = soma('deaths');
  const rodadas = soma('rodadas');

  const estatisticas = {
    partidas: linhas.length,
    vitorias: linhas.filter((linha) => linha.partida.vencedor === linha.time).length,
    abates,
    mortes,
    kd: mortes > 0 ? duasCasas(abates / mortes) : abates,
    hsPct: abates > 0 ? umaCasa((soma('headshotKills') / abates) * 100) : 0,
    adr: rodadas > 0 ? umaCasa(soma('damage') / rodadas) : 0,
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
    venceu: linha.partida.vencedor === linha.time,
    kills: linha.kills,
    deaths: linha.deaths,
    assists: linha.assists,
    // Gravação é assunto da equipe: o membro não recebe nem a informação de que ela existe.
    ...(ehEquipe && {
      gravacao: situacaoDaGravacao(linha.partida, linha.gravacao, agora),
      gravacaoId: linha.gravacao?.id,
    }),
  }));

  const equipe = ehEquipe ? await dadosDaEquipe(bd, jogador) : undefined;
  return {
    jogador: {
      id: jogador.id,
      apelido: jogador.apelido,
      avatarUrl: jogador.avatarUrl,
      papel: jogador.papel,
      criadoEm: jogador.criadoEm,
    },
    estatisticas,
    historico,
    ...(equipe && { equipe }),
  };
}

export type Ficha = NonNullable<Awaited<ReturnType<typeof fichaDoJogador>>>;
