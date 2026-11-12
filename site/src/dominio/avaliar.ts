/**
 * Avaliar a partida (dono, 11/11/2026): o resultado de cada conta numa partida, a partida e a sessão da Diversão, o
 * elogio e a denúncia da Diversão, o que falta avaliar e para onde mandar quem acabou de jogar. Desenho em
 * docs/superpowers/specs/2026-11-11-avaliar-a-partida-design.md.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { denunciasDiversao, elogiosDiversao, estadosDaDiversao, insigniasDoJogador, lancamentosDeGrana, partidaJogadores, partidas, partidasVistas, servidoresDiversao, usuarios, xpPartidas, type Usuario } from '@/bd/esquema';
import type { ControladorServidor, ServidorAlvo } from '@/servidor-jogo/controlador';
import { AcusadoInvalido, DenunciaRepetida, MAXIMO_DO_TEXTO, MotivoInvalido, NaoJogou } from './denuncias';
import { exigirAtivo } from './disponibilidade';
import { alvoDoServidor, fotoDoMapa, MODOS_DE_DIVERSAO, nomeDoMapaConhecido } from './diversao';
import { ElogioIndisponivel, ElogioRepetido, TIPOS_DE_ELOGIO } from './elogios';
import { kdDe } from './ficha';
import type { Familia } from './insignias';

export type Resultado = 'vitoria' | 'empate' | 'derrota';

export type ResultadoDaConta = {
  resultado: Resultado;
  xp: number;
  grana: number;
  abates: number;
  mortes: number | null;
  kd: number | null;
  insignias: { familia: Familia; nivel: number }[];
};

const MINUTO_MS = 60 * 1000;
// As insígnias saem na mesma transação do XP; um minuto de folga cobre o relógio do banco.
const JANELA_DAS_INSIGNIAS_MS = MINUTO_MS;

async function granaDaPartida(bd: Bd, usuarioIds: string[], referencias: string[]): Promise<Map<string, number>> {
  const total = new Map<string, number>();
  if (usuarioIds.length === 0 || referencias.length === 0) return total;
  const linhas = await bd
    .select({ usuarioId: lancamentosDeGrana.usuarioId, referencia: lancamentosDeGrana.referencia, quantidade: lancamentosDeGrana.quantidade })
    .from(lancamentosDeGrana)
    .where(
      and(
        inArray(lancamentosDeGrana.usuarioId, usuarioIds),
        inArray(lancamentosDeGrana.referencia, referencias),
        eq(lancamentosDeGrana.tipo, 'partida'),
        eq(lancamentosDeGrana.moeda, 'grana'),
      ),
    );
  for (const linha of linhas) total.set(`${linha.usuarioId}:${linha.referencia}`, (total.get(`${linha.usuarioId}:${linha.referencia}`) ?? 0) + linha.quantidade);
  return total;
}

/** O que a conta ganhou e fez numa partida (do mix pelo id, da Diversão pela referência). null se ela não jogou. */
export async function resultadoDaConta(bd: Bd, usuarioId: string, referencia: string): Promise<ResultadoDaConta | null> {
  const [linha] = await bd
    .select()
    .from(xpPartidas)
    .where(and(eq(xpPartidas.usuarioId, usuarioId), eq(xpPartidas.referencia, referencia)));
  if (!linha) return null;
  let mortes = linha.mortes;
  if (linha.origem === 'partida') {
    const [dele] = await bd
      .select({ deaths: partidaJogadores.deaths })
      .from(partidaJogadores)
      .where(and(eq(partidaJogadores.usuarioId, usuarioId), sql`${partidaJogadores.partidaId}::text = ${referencia}`));
    mortes = dele?.deaths ?? mortes;
  }
  const grana = (await granaDaPartida(bd, [usuarioId], [referencia])).get(`${usuarioId}:${referencia}`) ?? 0;
  const insignias = await bd
    .select({ familia: insigniasDoJogador.familia, nivel: insigniasDoJogador.nivel })
    .from(insigniasDoJogador)
    .where(
      and(
        eq(insigniasDoJogador.usuarioId, usuarioId),
        gte(insigniasDoJogador.conquistadaEm, linha.criadoEm),
        lte(insigniasDoJogador.conquistadaEm, new Date(linha.criadoEm.getTime() + JANELA_DAS_INSIGNIAS_MS)),
      ),
    )
    .orderBy(desc(insigniasDoJogador.nivel));
  return {
    resultado: linha.resultado,
    xp: linha.xp,
    grana,
    abates: linha.abates,
    mortes,
    kd: mortes === null ? null : kdDe(linha.abates, mortes),
    insignias: insignias.map((item) => ({ familia: item.familia as Familia, nivel: item.nivel })),
  };
}

const FORMATO_DO_SLUG = /^(\d{2,5})-([A-Za-z0-9_-]{1,64})$/;

/** "diversao:27020:abc" → "27020-abc", para a URL da página da partida da Diversão. */
export function slugDaDiversao(referencia: string): string {
  const [, porta, partida] = referencia.split(':');
  return `${porta}-${partida}`;
}

/** "27020-abc" → "diversao:27020:abc". Qualquer outra coisa é null. */
export function referenciaDaDiversao(slug: string): string | null {
  const achado = FORMATO_DO_SLUG.exec(slug);
  return achado ? `diversao:${achado[1]}:${achado[2]}` : null;
}

async function modosDasPortas(bd: Bd): Promise<Map<number, string>> {
  const servidores = await bd.select({ porta: servidoresDiversao.porta, modo: servidoresDiversao.modo }).from(servidoresDiversao);
  return new Map(servidores.map((servidor) => [servidor.porta, MODOS_DE_DIVERSAO.find((modo) => modo.valor === servidor.modo)?.nome ?? 'Diversão']));
}

const portaDe = (referencia: string) => Number(referencia.split(':')[1]);
const nomeDoMapa = (mapa: string | null) => (mapa ? (nomeDoMapaConhecido(mapa) ?? mapa) : null);

export type JogadorDaDiversao = { id: string; apelido: string; avatarUrl: string | null; abates: number; mortes: number | null; resultado: Resultado; xp: number };

/** A partida da Diversão: modo, mapa e os membros que jogaram, com o que cada um fez. null se não existe. */
export async function partidaDaDiversao(
  bd: Bd,
  referencia: string,
): Promise<{ referencia: string; modo: string; mapa: string | null; foto: string | null; data: Date; jogadores: JogadorDaDiversao[] } | null> {
  const linhas = await bd
    .select({ xp: xpPartidas, id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(xpPartidas)
    .innerJoin(usuarios, eq(xpPartidas.usuarioId, usuarios.id))
    .where(and(eq(xpPartidas.referencia, referencia), eq(xpPartidas.origem, 'diversao')))
    .orderBy(desc(xpPartidas.abates), asc(usuarios.apelido));
  if (linhas.length === 0) return null;
  const modos = await modosDasPortas(bd);
  const mapa = linhas.find((linha) => linha.xp.mapa)?.xp.mapa ?? null;
  return {
    referencia,
    modo: modos.get(portaDe(referencia)) ?? 'Diversão',
    mapa: nomeDoMapa(mapa),
    foto: fotoDoMapa(mapa),
    data: linhas[0].xp.criadoEm,
    jogadores: linhas.map((linha) => ({
      id: linha.id,
      apelido: linha.apelido,
      avatarUrl: linha.avatarUrl,
      abates: linha.xp.abates,
      mortes: linha.xp.mortes,
      resultado: linha.xp.resultado,
      xp: linha.xp.xp,
    })),
  };
}

export type PartidaDaSessao = { referencia: string; modo: string; mapa: string | null; data: Date; resultado: Resultado; xp: number; grana: number; abates: number; mortes: number | null };

const JANELA_DA_SESSAO_MS = 12 * 60 * MINUTO_MS;
const INTERVALO_DA_SESSAO_MS = 30 * MINUTO_MS;
const MAXIMO_DA_SESSAO = 10;

/**
 * As partidas da Diversão "de agora": a mais recente das últimas 12 h e as anteriores com no máximo 30 min entre uma e
 * outra, até 10, da mais antiga para a mais nova.
 */
export async function sessaoDaDiversao(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<PartidaDaSessao[]> {
  const linhas = await bd
    .select()
    .from(xpPartidas)
    .where(and(eq(xpPartidas.usuarioId, usuarioId), eq(xpPartidas.origem, 'diversao'), gte(xpPartidas.criadoEm, new Date(agora.getTime() - JANELA_DA_SESSAO_MS))))
    .orderBy(desc(xpPartidas.criadoEm))
    .limit(50);
  const sessao: typeof linhas = [];
  for (const linha of linhas) {
    const anterior = sessao[sessao.length - 1];
    if (anterior && anterior.criadoEm.getTime() - linha.criadoEm.getTime() > INTERVALO_DA_SESSAO_MS) break;
    sessao.push(linha);
    if (sessao.length === MAXIMO_DA_SESSAO) break;
  }
  if (sessao.length === 0) return [];
  const modos = await modosDasPortas(bd);
  const grana = await granaDaPartida(bd, [usuarioId], sessao.map((linha) => linha.referencia));
  return sessao.reverse().map((linha) => ({
    referencia: linha.referencia,
    modo: modos.get(portaDe(linha.referencia)) ?? 'Diversão',
    mapa: nomeDoMapa(linha.mapa),
    data: linha.criadoEm,
    resultado: linha.resultado,
    xp: linha.xp,
    grana: grana.get(`${usuarioId}:${linha.referencia}`) ?? 0,
    abates: linha.abates,
    mortes: linha.mortes,
  }));
}

async function quemJogou(bd: Bd | Parameters<Parameters<Bd['transaction']>[0]>[0], referencia: string): Promise<string[]> {
  const linhas = await bd
    .select({ id: xpPartidas.usuarioId })
    .from(xpPartidas)
    .where(and(eq(xpPartidas.referencia, referencia), eq(xpPartidas.origem, 'diversao')));
  return linhas.map((linha) => linha.id);
}

/** Elogio na Diversão: só entre quem jogou a mesma partida, uma vez por pessoa, nunca a si mesmo. */
export async function elogiarNaDiversao(bd: Bd, autor: Pick<Usuario, 'id'>, dados: { referencia: string; elogiadoId: string; tipo: string }): Promise<void> {
  const tipo = TIPOS_DE_ELOGIO.find((item) => item.valor === dados.tipo)?.valor;
  if (!tipo || dados.elogiadoId === autor.id) throw new ElogioIndisponivel();
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, autor);
    const jogaram = await quemJogou(tx, dados.referencia);
    if (!jogaram.includes(autor.id) || !jogaram.includes(dados.elogiadoId)) throw new ElogioIndisponivel();
    const [gravado] = await tx
      .insert(elogiosDiversao)
      .values({ referencia: dados.referencia, autorId: autor.id, elogiadoId: dados.elogiadoId, tipo })
      .onConflictDoNothing()
      .returning();
    if (!gravado) throw new ElogioRepetido();
  });
}

/** Denúncia na Diversão: vai para a equipe no Olho de Águia, como a do mix (sem gravação). */
export async function denunciarNaDiversao(bd: Bd, ator: Pick<Usuario, 'id'>, dados: { referencia: string; acusadoId: string; motivo: string }): Promise<void> {
  const motivo = dados.motivo.trim();
  if (!motivo || motivo.length > MAXIMO_DO_TEXTO) throw new MotivoInvalido();
  await bd.transaction(async (tx) => {
    await exigirAtivo(tx, ator);
    const jogaram = await quemJogou(tx, dados.referencia);
    if (!jogaram.includes(ator.id)) throw new NaoJogou();
    if (dados.acusadoId === ator.id || !jogaram.includes(dados.acusadoId)) throw new AcusadoInvalido();
    const [gravada] = await tx
      .insert(denunciasDiversao)
      .values({ referencia: dados.referencia, denuncianteId: ator.id, acusadoId: dados.acusadoId, motivo })
      .onConflictDoNothing()
      .returning({ id: denunciasDiversao.id });
    if (!gravada) throw new DenunciaRepetida();
  });
}

export async function elogiosFeitosNaDiversao(bd: Bd, referencia: string, autorId: string): Promise<Set<string>> {
  const linhas = await bd
    .select({ id: elogiosDiversao.elogiadoId })
    .from(elogiosDiversao)
    .where(and(eq(elogiosDiversao.referencia, referencia), eq(elogiosDiversao.autorId, autorId)));
  return new Set(linhas.map((linha) => linha.id));
}

export async function denunciasFeitasNaDiversao(bd: Bd, referencia: string, denuncianteId: string): Promise<Set<string>> {
  const linhas = await bd
    .select({ id: denunciasDiversao.acusadoId })
    .from(denunciasDiversao)
    .where(and(eq(denunciasDiversao.referencia, referencia), eq(denunciasDiversao.denuncianteId, denuncianteId)));
  return new Set(linhas.map((linha) => linha.id));
}

export type Pendentes = { mix: { id: string; numero: number } | null; diversao: { referencias: string[]; modo: string } | null };

/**
 * O que a conta ainda não avaliou: a última partida do mix das últimas 12 h que ela não abriu e, na Diversão, as
 * partidas da sessão de agora que ela não abriu.
 */
export async function avaliacoesPendentes(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<Pendentes> {
  const desde = new Date(agora.getTime() - JANELA_DA_SESSAO_MS);
  const [ultimaDoMix] = await bd
    .select({ id: partidas.id, numero: partidas.numero, criadoEm: xpPartidas.criadoEm })
    .from(xpPartidas)
    .innerJoin(partidas, sql`${partidas.id}::text = ${xpPartidas.referencia}`)
    .where(and(eq(xpPartidas.usuarioId, usuarioId), eq(xpPartidas.origem, 'partida'), eq(partidas.estado, 'encerrada'), gte(xpPartidas.criadoEm, desde)))
    .orderBy(desc(xpPartidas.criadoEm))
    .limit(1);
  const sessao = await sessaoDaDiversao(bd, usuarioId, agora);
  const referencias = [...(ultimaDoMix ? [ultimaDoMix.id] : []), ...sessao.map((partida) => partida.referencia)];
  const vistas =
    referencias.length === 0
      ? new Set<string>()
      : new Set(
          (
            await bd
              .select({ referencia: partidasVistas.referencia })
              .from(partidasVistas)
              .where(and(eq(partidasVistas.usuarioId, usuarioId), inArray(partidasVistas.referencia, referencias)))
          ).map((linha) => linha.referencia),
        );
  const naoVistas = sessao.filter((partida) => !vistas.has(partida.referencia));
  return {
    mix: ultimaDoMix && !vistas.has(ultimaDoMix.id) ? { id: ultimaDoMix.id, numero: ultimaDoMix.numero } : null,
    diversao: naoVistas.length > 0 ? { referencias: naoVistas.map((partida) => partida.referencia), modo: naoVistas[naoVistas.length - 1].modo } : null,
  };
}

/** Abrir a página da partida (ou de qualquer uma da sessão) tira o pedido de avaliação do sino. */
export async function marcarVistas(bd: Bd, usuarioId: string, referencias: string[]): Promise<void> {
  if (referencias.length === 0) return;
  await bd
    .insert(partidasVistas)
    .values(referencias.map((referencia) => ({ usuarioId, referencia })))
    .onConflictDoNothing();
}

export function enderecoDaPartidaDaDiversao(referencia: string): string {
  return `/partidas/diversao/${slugDaDiversao(referencia)}`;
}

const JANELA_DO_MIX_MS = 10 * MINUTO_MS;

/**
 * Para onde mandar a aba de quem acabou de jogar: a partida do mix que terminou há menos de 10 min, ou, na Diversão, a
 * última partida da sessão, mas só quando a conta já saiu de todos os servidores da Diversão ligados. Servidor que não
 * responde: não dá para saber se a pessoa ainda está lá, então ninguém é mandado.
 */
export async function destinoAoSair(
  bd: Bd,
  controlador: ControladorServidor,
  usuario: Pick<Usuario, 'id' | 'steamid64'>,
  servidoresLigados: ServidorAlvo[],
  agora: Date = new Date(),
): Promise<string | null> {
  const pendentes = await avaliacoesPendentes(bd, usuario.id, agora);
  if (pendentes.mix) {
    const [linha] = await bd
      .select({ criadoEm: xpPartidas.criadoEm })
      .from(xpPartidas)
      .where(and(eq(xpPartidas.usuarioId, usuario.id), eq(xpPartidas.referencia, pendentes.mix.id)));
    if (linha && agora.getTime() - linha.criadoEm.getTime() <= JANELA_DO_MIX_MS) return `/partidas/${pendentes.mix.id}#avaliar`;
  }
  if (!pendentes.diversao) return null;
  for (const alvo of servidoresLigados) {
    try {
      const estado = await controlador.estadoDoServidor(alvo);
      if (estado.contas.includes(usuario.steamid64)) return null;
    } catch {
      return null;
    }
  }
  const ultima = pendentes.diversao.referencias[pendentes.diversao.referencias.length - 1];
  return `${enderecoDaPartidaDaDiversao(ultima)}#avaliar`;
}

/** Os servidores da Diversão ligados agora, com o endereço de cada um, para ver se a pessoa ainda está jogando. */
export async function servidoresDaDiversaoLigados(bd: Bd, hostPadrao: string | undefined): Promise<ServidorAlvo[]> {
  const linhas = await bd
    .select({ host: servidoresDiversao.host, porta: servidoresDiversao.porta })
    .from(servidoresDiversao)
    .innerJoin(estadosDaDiversao, eq(estadosDaDiversao.servidorId, servidoresDiversao.id))
    .where(and(eq(servidoresDiversao.ativo, true), eq(estadosDaDiversao.estado, 'ligado')));
  return linhas.flatMap((linha) => alvoDoServidor(linha, hostPadrao) ?? []);
}
