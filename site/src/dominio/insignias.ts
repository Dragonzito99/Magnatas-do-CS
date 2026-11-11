import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { insigniasDoJogador, itensDoJogador, partidaJogadores, servidoresDiversao, usuarios, xpPartidas } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { lancarGrana } from './grana';
import { darItem, itemDoCatalogo, ITENS_A_VENDA } from './loja';

/**
 * Insígnias (dono, 11/11/2026), no jeito das Badges do CrossFire e com desenho nosso: 6 famílias com 5 níveis cada,
 * contadas com o que o site já guarda das partidas. Cada uma conquistada dá prêmio. Desenho e regras em
 * docs/superpowers/specs/2026-11-11-insignias-e-perfil-novo-design.md.
 */

export type Familia = 'mira' | 'ace' | 'estrela' | 'vencedor' | 'mutacao' | 'veterano';
type Metas = readonly [number, number, number, number, number];

export const FAMILIAS: readonly { chave: Familia; nome: string; conta: string; metas: Metas }[] = [
  { chave: 'mira', nome: 'Mira', conta: 'headshots', metas: [50, 250, 1000, 3000, 10000] },
  { chave: 'ace', nome: 'Ace', conta: 'rodadas de 5 abates', metas: [1, 5, 20, 50, 100] },
  { chave: 'estrela', nome: 'Estrela', conta: 'MVPs', metas: [10, 50, 200, 500, 1000] },
  { chave: 'vencedor', nome: 'Vencedor', conta: 'vitórias no competitivo e no mix', metas: [5, 25, 100, 300, 1000] },
  { chave: 'mutacao', nome: 'Mutação', conta: 'partidas ganhas na Mutação', metas: [5, 25, 100, 300, 1000] },
  { chave: 'veterano', nome: 'Veterano', conta: 'partidas jogadas', metas: [10, 50, 200, 500, 1500] },
];

export const NOMES_DOS_NIVEIS = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Lendária'] as const;

/** Prêmio de cada nível. mutanteDias: undefined = sem mutante, null = mutante para sempre. */
export const PREMIOS: readonly { grana: number; xp: number; mutanteDias: number | null | undefined }[] = [
  { grana: 50, xp: 200, mutanteDias: undefined },
  { grana: 100, xp: 500, mutanteDias: 1 },
  { grana: 200, xp: 1000, mutanteDias: 3 },
  { grana: 400, xp: 2000, mutanteDias: 5 },
  { grana: 800, xp: 5000, mutanteDias: null },
];

/** Na Lendária, quem já tem todos os mutantes para sempre ganha esta Grana a mais no lugar do mutante. */
export const GRANA_NO_LUGAR_DO_MUTANTE = 1000;

export type Contagem = Record<Familia, number>;
export type ChaveDaInsignia = { familia: Familia; nivel: number };

/** Todos os níveis cuja meta a conta já atingiu, de todas as famílias. */
export function niveisAlcancados(contagem: Contagem): ChaveDaInsignia[] {
  return FAMILIAS.flatMap((familia) =>
    familia.metas.flatMap((meta, nivel) => (contagem[familia.chave] >= meta ? [{ familia: familia.chave, nivel }] : [])),
  );
}

export function nomeDaInsignia(familia: Familia, nivel: number): string {
  const nome = FAMILIAS.find((item) => item.chave === familia)?.nome ?? familia;
  return `${nome} ${NOMES_DOS_NIVEIS[nivel] ?? ''}`.trim();
}

/** "estrela:2" → { familia: 'estrela', nivel: 2 }. Qualquer outra coisa é null. */
export function lerChaveDaInsignia(chave: string | null): ChaveDaInsignia | null {
  if (!chave) return null;
  const [familia, nivelEmTexto] = chave.split(':');
  const nivel = Number(nivelEmTexto);
  if (!FAMILIAS.some((item) => item.chave === familia)) return null;
  if (!Number.isInteger(nivel) || nivel < 0 || nivel >= NOMES_DOS_NIVEIS.length) return null;
  return { familia: familia as Familia, nivel };
}

const zerada = (): Contagem => ({ mira: 0, ace: 0, estrela: 0, vencedor: 0, mutacao: 0, veterano: 0 });

/**
 * O que cada conta já fez, para as metas. Conta só partida que valeu XP (tem linha em xp_partidas): teste e treino
 * ficam de fora. Competitivo e mix vêm de partida_jogadores; a Mutação é a Diversão cuja porta é de um servidor da
 * Mutação (a referência é "diversao:<porta>:<partida>").
 */
export async function contarFamilias(bd: Bd | Transacao, usuarioIds: string[]): Promise<Map<string, Contagem>> {
  const contagens = new Map(usuarioIds.map((id) => [id, zerada()]));
  if (usuarioIds.length === 0) return contagens;

  const competitivo = await bd
    .select({
      usuarioId: xpPartidas.usuarioId,
      mira: sql<number>`coalesce(sum(${partidaJogadores.headshotKills}), 0)::int`,
      ace: sql<number>`coalesce(sum(${partidaJogadores.k5}), 0)::int`,
      estrela: sql<number>`coalesce(sum(${partidaJogadores.mvps}), 0)::int`,
      vencedor: sql<number>`count(*) filter (where ${xpPartidas.resultado} = 'vitoria')::int`,
    })
    .from(xpPartidas)
    .innerJoin(partidaJogadores, and(eq(partidaJogadores.usuarioId, xpPartidas.usuarioId), sql`${partidaJogadores.partidaId}::text = ${xpPartidas.referencia}`))
    .where(and(inArray(xpPartidas.usuarioId, usuarioIds), eq(xpPartidas.origem, 'partida')))
    .groupBy(xpPartidas.usuarioId);
  for (const linha of competitivo) Object.assign(contagens.get(linha.usuarioId)!, { mira: linha.mira, ace: linha.ace, estrela: linha.estrela, vencedor: linha.vencedor });

  const portasDaMutacao = (await bd.select({ porta: servidoresDiversao.porta }).from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'mutacao'))).map(
    (servidor) => String(servidor.porta),
  );
  const todas = await bd
    .select({
      usuarioId: xpPartidas.usuarioId,
      veterano: sql<number>`count(*)::int`,
      mutacao:
        portasDaMutacao.length === 0
          ? sql<number>`0`
          : sql<number>`count(*) filter (where ${xpPartidas.origem} = 'diversao' and ${xpPartidas.resultado} = 'vitoria' and split_part(${xpPartidas.referencia}, ':', 2) in (${sql.join(
              portasDaMutacao.map((porta) => sql`${porta}`),
              sql`, `,
            )}))::int`,
    })
    .from(xpPartidas)
    .where(inArray(xpPartidas.usuarioId, usuarioIds))
    .groupBy(xpPartidas.usuarioId);
  for (const linha of todas) Object.assign(contagens.get(linha.usuarioId)!, { veterano: linha.veterano, mutacao: Number(linha.mutacao) });

  return contagens;
}

/** Mutantes à venda que a conta ainda não tem para sempre: os que o sorteio do prêmio pode dar. */
async function mutantesParaSortear(tx: Transacao, usuarioId: string): Promise<string[]> {
  const paraSempre = new Set(
    (
      await tx
        .select({ itemId: itensDoJogador.itemId })
        .from(itensDoJogador)
        .where(and(eq(itensDoJogador.usuarioId, usuarioId), isNull(itensDoJogador.expiraEm)))
    ).map((linha) => linha.itemId),
  );
  return ITENS_A_VENDA()
    .filter((item) => item.tipo === 'mutante' && !paraSempre.has(item.id))
    .map((item) => item.id);
}

const sortearAoAcaso = (quantos: number) => Math.floor(Math.random() * quantos);
const ordemDaFamilia = (familia: Familia) => FAMILIAS.findIndex((item) => item.chave === familia);

/**
 * Confere as metas das contas e entrega as insígnias novas com o prêmio (Grana, XP e mutante sorteado), na transação de
 * quem chama. A chave da tabela faz a mesma insígnia, e o prêmio dela, sair uma vez só, mesmo com duas conferências
 * juntas. A primeira insígnia vira a principal. Devolve só as novas.
 */
export async function conferirInsignias(
  tx: Transacao,
  usuarioIds: string[],
  agora: Date = new Date(),
  sortear: (quantos: number) => number = sortearAoAcaso,
): Promise<(ChaveDaInsignia & { usuarioId: string })[]> {
  const contagens = await contarFamilias(tx, usuarioIds);
  const novas: (ChaveDaInsignia & { usuarioId: string })[] = [];
  for (const usuarioId of usuarioIds) {
    const alcancados = niveisAlcancados(contagens.get(usuarioId)!);
    if (alcancados.length === 0) continue;
    const jaTem = new Set(
      (await tx.select({ familia: insigniasDoJogador.familia, nivel: insigniasDoJogador.nivel }).from(insigniasDoJogador).where(eq(insigniasDoJogador.usuarioId, usuarioId))).map(
        (linha) => `${linha.familia}:${linha.nivel}`,
      ),
    );
    const faltam = alcancados.filter((chave) => !jaTem.has(`${chave.familia}:${chave.nivel}`));
    if (faltam.length === 0) continue;
    // Trava a conta: outra conferência da mesma conta espera esta terminar.
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, usuarioId)).for('update');

    const daConta: ChaveDaInsignia[] = [];
    for (const { familia, nivel } of faltam) {
      const premio = PREMIOS[nivel];
      let grana = premio.grana;
      let mutanteId: string | null = null;
      let mutanteDias: number | null = null;
      if (premio.mutanteDias !== undefined) {
        const candidatos = await mutantesParaSortear(tx, usuarioId);
        if (candidatos.length > 0) {
          mutanteId = candidatos[Math.min(sortear(candidatos.length), candidatos.length - 1)];
          mutanteDias = premio.mutanteDias;
        } else if (premio.mutanteDias === null) {
          grana += GRANA_NO_LUGAR_DO_MUTANTE;
        }
      }
      const [nova] = await tx
        .insert(insigniasDoJogador)
        .values({ usuarioId, familia, nivel, conquistadaEm: agora, grana, xp: premio.xp, mutanteId, mutanteDias })
        .onConflictDoNothing()
        .returning({ nivel: insigniasDoJogador.nivel });
      if (!nova) continue;
      if (mutanteId) await darItem(tx, usuarioId, mutanteId, mutanteDias, agora);
      await lancarGrana(tx, { usuarioId, tipo: 'insignia', quantidade: grana, referencia: `insignia:${familia}:${nivel}`, detalhes: { nome: nomeDaInsignia(familia, nivel) } });
      await tx
        .update(usuarios)
        .set({ xpTotal: sql`${usuarios.xpTotal} + ${premio.xp}` })
        .where(eq(usuarios.id, usuarioId));
      daConta.push({ familia, nivel });
    }
    if (daConta.length === 0) continue;
    const melhor = [...daConta].sort((a, b) => b.nivel - a.nivel || ordemDaFamilia(a.familia) - ordemDaFamilia(b.familia))[0];
    await tx
      .update(usuarios)
      .set({ insigniaPrincipal: `${melhor.familia}:${melhor.nivel}` })
      .where(and(eq(usuarios.id, usuarioId), isNull(usuarios.insigniaPrincipal)));
    novas.push(...daConta.map((chave) => ({ ...chave, usuarioId })));
  }
  return novas;
}

/** A estreia: confere todas as contas ativas, em lotes. Rodar de novo não paga nada. Devolve quantas insígnias saíram. */
// Uma conta por transação: em lotes, a trava das contas podia cruzar com a de uma partida terminando junto, e o Postgres
// derrubava uma das duas (revisão de 11/11/2026).
export async function conferirInsigniasDeTodos(bd: Bd, lote = 1, agora: Date = new Date()): Promise<number> {
  const ids = (await bd.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.estado, 'ativo')).orderBy(usuarios.id)).map((conta) => conta.id);
  let total = 0;
  for (let inicio = 0; inicio < ids.length; inicio += lote) {
    const novas = await bd.transaction((tx) => conferirInsignias(tx, ids.slice(inicio, inicio + lote), agora));
    total += novas.length;
  }
  return total;
}

export class InsigniaQueNaoTem extends Error {
  constructor() {
    super('Você ainda não tem essa insígnia.');
  }
}

export type InsigniaConquistada = { nivel: number; conquistadaEm: Date; vistaEm: Date | null; grana: number; xp: number; mutanteId: string | null; mutanteDias: number | null };
export type InsigniaDaFamilia = {
  familia: Familia;
  nome: string;
  conta: string;
  metas: Metas;
  contagem: number;
  /** O nível mais alto conquistado; -1 = nenhum. */
  nivel: number;
  proximaMeta: number | null;
  conquistadas: InsigniaConquistada[];
};

async function conquistadasDe(bd: Bd, usuarioIds: string[]) {
  if (usuarioIds.length === 0) return [];
  return bd.select().from(insigniasDoJogador).where(inArray(insigniasDoJogador.usuarioId, usuarioIds));
}

/** Tudo o que a aba Insígnias mostra: cada família com a contagem, o nível e o que já foi conquistado. */
export async function insigniasDe(bd: Bd, usuarioId: string): Promise<{ familias: InsigniaDaFamilia[]; principal: ChaveDaInsignia | null; total: number }> {
  const [contagens, linhas, principais] = await Promise.all([contarFamilias(bd, [usuarioId]), conquistadasDe(bd, [usuarioId]), principaisDe(bd, [usuarioId])]);
  const contagem = contagens.get(usuarioId)!;
  const familias = FAMILIAS.map((familia) => {
    const conquistadas = linhas
      .filter((linha) => linha.familia === familia.chave)
      .sort((a, b) => a.nivel - b.nivel)
      .map(({ nivel, conquistadaEm, vistaEm, grana, xp, mutanteId, mutanteDias }) => ({ nivel, conquistadaEm, vistaEm, grana, xp, mutanteId, mutanteDias }));
    const nivel = conquistadas.length === 0 ? -1 : Math.max(...conquistadas.map((item) => item.nivel));
    return {
      familia: familia.chave,
      nome: familia.nome,
      conta: familia.conta,
      metas: familia.metas,
      contagem: contagem[familia.chave],
      nivel,
      proximaMeta: familia.metas[nivel + 1] ?? null,
      conquistadas,
    };
  });
  return { familias, principal: principais.get(usuarioId) ?? null, total: linhas.length };
}

/** A insígnia principal de cada conta, só se a conta tem mesmo aquela insígnia. */
export async function principaisDe(bd: Bd, usuarioIds: string[]): Promise<Map<string, ChaveDaInsignia>> {
  const principais = new Map<string, ChaveDaInsignia>();
  if (usuarioIds.length === 0) return principais;
  const contas = await bd
    .select({ id: usuarios.id, principal: usuarios.insigniaPrincipal })
    .from(usuarios)
    .where(inArray(usuarios.id, usuarioIds));
  const escolhidas = contas.flatMap((conta) => {
    const chave = lerChaveDaInsignia(conta.principal);
    return chave ? [{ id: conta.id, ...chave }] : [];
  });
  if (escolhidas.length === 0) return principais;
  const tem = new Set((await conquistadasDe(bd, escolhidas.map((item) => item.id))).map((linha) => `${linha.usuarioId}:${linha.familia}:${linha.nivel}`));
  for (const escolhida of escolhidas) {
    if (tem.has(`${escolhida.id}:${escolhida.familia}:${escolhida.nivel}`)) principais.set(escolhida.id, { familia: escolhida.familia, nivel: escolhida.nivel });
  }
  return principais;
}

export async function escolherPrincipal(bd: Bd, usuarioId: string, familia: Familia, nivel: number): Promise<void> {
  const [tem] = await bd
    .select({ nivel: insigniasDoJogador.nivel })
    .from(insigniasDoJogador)
    .where(and(eq(insigniasDoJogador.usuarioId, usuarioId), eq(insigniasDoJogador.familia, familia), eq(insigniasDoJogador.nivel, nivel)));
  if (!tem) throw new InsigniaQueNaoTem();
  await bd.update(usuarios).set({ insigniaPrincipal: `${familia}:${nivel}` }).where(eq(usuarios.id, usuarioId));
}

/** As conquistadas que a pessoa ainda não viu na aba Insígnias, com o prêmio, para o sino. */
export async function insigniasNaoVistas(bd: Bd, usuarioId: string): Promise<{ nome: string; grana: number; xp: number; mutanteId: string | null; mutanteDias: number | null }[]> {
  const linhas = await bd
    .select()
    .from(insigniasDoJogador)
    .where(and(eq(insigniasDoJogador.usuarioId, usuarioId), isNull(insigniasDoJogador.vistaEm)));
  return linhas.map((linha) => ({ nome: nomeDaInsignia(linha.familia as Familia, linha.nivel), grana: linha.grana, xp: linha.xp, mutanteId: linha.mutanteId, mutanteDias: linha.mutanteDias }));
}

export async function marcarInsigniasVistas(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<void> {
  await bd
    .update(insigniasDoJogador)
    .set({ vistaEm: agora })
    .where(and(eq(insigniasDoJogador.usuarioId, usuarioId), isNull(insigniasDoJogador.vistaEm)));
}

const numeroEmTexto = new Intl.NumberFormat('pt-BR');

/** O prêmio entregue com a insígnia, em texto: "+200 Grana, +1.000 XP e Senhor do Vazio por 3 dias". */
export function textoDoPremio(premio: { grana: number; xp: number; mutanteId: string | null; mutanteDias: number | null }): string {
  const partes = [`+${numeroEmTexto.format(premio.grana)} Grana`, `+${numeroEmTexto.format(premio.xp)} XP`];
  const mutante = premio.mutanteId ? itemDoCatalogo(premio.mutanteId) : undefined;
  if (mutante) partes.push(`${mutante.nome} ${premio.mutanteDias === null ? 'para sempre' : premio.mutanteDias === 1 ? 'por 1 dia' : `por ${premio.mutanteDias} dias`}`);
  return partes.length === 2 ? partes.join(' e ') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/**
 * Quanto falta para o próximo nível. Nunca negativo: entre o resultado e a conferência a contagem pode já ter passado
 * da meta (revisão de 11/11/2026). null = família completa.
 */
export function faltamParaAProxima(familia: { contagem: number; nivel: number; proximaMeta: number | null }): number | null {
  if (familia.proximaMeta === null) return null;
  return Math.max(0, familia.proximaMeta - familia.contagem);
}
