import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { lemnosEventos, lemnosItens, lemnosSessoes, usuarios } from '@/bd/esquema';
import type { Transacao } from '@/dominio/disponibilidade';
import { lancarGrana } from '@/dominio/grana';
import { ItemInvalido } from '@/dominio/loja';
import { armaPelaClasse, granadaPelaClasse, saqueLemnos } from './catalogo';
import { separarKit, type KitDaEntrada } from './kit';
import { banimentoAtivo, registrarKick } from './punicoes';
import { lancarXpDaSessao } from './xp-lemnos';

/*
 * O que acontece em cada aviso do servidor da Ilha Lemnos (dono, 15/11/2026). O servidor conta o que aconteceu; aqui se
 * decide o que cada um tem. Todo aviso tem referência única: a resposta fica gravada e um reenvio recebe a mesma.
 */

export class SessaoEncerrada extends Error {
  constructor() {
    super('Essa sessão da Ilha Lemnos não está aberta.');
  }
}

export type RespostaDaEntrada = { ok: true; sessao: string; kit: KitDaEntrada; adm: boolean } | { ok: false; motivo: 'nao_membro' | 'banido'; ate: string | null };
export type ArmaNaMao = { linha: string | null; classe: string };
export type MotivoDaSaida = 'saiu' | 'kick_afk' | 'kick_acampar';

type TipoDoEvento = (typeof lemnosEventos.$inferInsert)['tipo'];

/** Faz o aviso uma vez só. A resposta passa por JSON também na primeira vez, para o reenvio receber exatamente igual. */
async function umaVez<T>(bd: Bd, tipo: TipoDoEvento, referencia: string, fazer: (tx: Transacao) => Promise<{ sessaoId: string | null; detalhes?: unknown; resposta: T }>): Promise<T> {
  return bd.transaction(async (tx) => {
    const [feito] = await tx.select({ resposta: lemnosEventos.resposta }).from(lemnosEventos).where(eq(lemnosEventos.referencia, referencia));
    if (feito) return feito.resposta as T;
    const { sessaoId, detalhes, resposta } = await fazer(tx);
    const guardada = JSON.parse(JSON.stringify(resposta ?? null)) as T;
    await tx.insert(lemnosEventos).values({ sessaoId, tipo, referencia, detalhes: detalhes ?? null, resposta: guardada });
    return guardada;
  });
}

async function sessaoAberta(tx: Transacao, sessaoId: string) {
  const [sessao] = await tx.select().from(lemnosSessoes).where(eq(lemnosSessoes.id, sessaoId)).for('update');
  return sessao && sessao.encerradaEm === null ? sessao : null;
}

async function marcarGastas(tx: Transacao, sessaoId: string, gastas: string[], agora: Date) {
  if (gastas.length === 0) return;
  await tx
    .update(lemnosItens)
    .set({ situacao: 'gasto', atualizadoEm: agora })
    .where(and(eq(lemnosItens.sessaoId, sessaoId), eq(lemnosItens.situacao, 'em_campo'), inArray(lemnosItens.id, gastas)));
}

/** Regra da morte: a de Magcoin volta ao baú (mesmo vencida); a de grana e a achada se perdem. */
async function perderComoMorte(tx: Transacao, sessaoId: string, agora: Date) {
  const emCampo = and(eq(lemnosItens.sessaoId, sessaoId), eq(lemnosItens.situacao, 'em_campo'));
  await tx.update(lemnosItens).set({ situacao: 'no_bau', atualizadoEm: agora }).where(and(emCampo, eq(lemnosItens.origem, 'magcoin')));
  await tx.update(lemnosItens).set({ situacao: 'perdido', atualizadoEm: agora }).where(emCampo);
}

/** Queda do servidor: a culpa não é do jogador, então tudo o que estava em campo volta ao baú. */
async function fecharComoQueda(tx: Transacao, sessaoId: string, agora: Date) {
  await tx
    .update(lemnosItens)
    .set({ situacao: 'no_bau', atualizadoEm: agora })
    .where(and(eq(lemnosItens.sessaoId, sessaoId), eq(lemnosItens.situacao, 'em_campo')));
  await tx.update(lemnosSessoes).set({ encerradaEm: agora, fim: 'queda' }).where(eq(lemnosSessoes.id, sessaoId));
  await lancarXpDaSessao(tx, sessaoId);
}

export async function entrarNaIlha(bd: Bd, pedido: { porta: number; steamid64: string; referencia: string }, agora: Date = new Date()): Promise<RespostaDaEntrada> {
  return umaVez<RespostaDaEntrada>(bd, 'entrada', pedido.referencia, async (tx) => {
    const [conta] = await tx.select().from(usuarios).where(eq(usuarios.steamid64, pedido.steamid64));
    if (!conta || conta.estado !== 'ativo') return { sessaoId: null, resposta: { ok: false, motivo: 'nao_membro', ate: null } };
    const banimento = await banimentoAtivo(tx, conta.id, agora);
    if (banimento) return { sessaoId: null, resposta: { ok: false, motivo: 'banido', ate: banimento.ate?.toISOString() ?? null } };
    // Trava a conta: duas entradas juntas passam uma de cada vez.
    await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.id, conta.id)).for('update');
    const abertas = await tx.select({ id: lemnosSessoes.id }).from(lemnosSessoes).where(and(eq(lemnosSessoes.usuarioId, conta.id), isNull(lemnosSessoes.encerradaEm)));
    for (const aberta of abertas) await fecharComoQueda(tx, aberta.id, agora);
    const [sessao] = await tx.insert(lemnosSessoes).values({ usuarioId: conta.id, porta: pedido.porta, iniciadaEm: agora }).returning();
    const kit = await separarKit(tx, conta.id, sessao.id, agora);
    await tx.update(lemnosSessoes).set({ espacos: kit.espacos }).where(eq(lemnosSessoes.id, sessao.id));
    // adm: o servidor abre o !marcar (marcar postos, saídas e caixas andando pelo mapa) só para o Adm.
    return { sessaoId: sessao.id, resposta: { ok: true, sessao: sessao.id, kit, adm: conta.papel === 'adm' } };
  });
}

export async function renascer(bd: Bd, pedido: { sessao: string; referencia: string }, agora: Date = new Date()): Promise<{ kit: KitDaEntrada }> {
  return umaVez(bd, 'renascer', pedido.referencia, async (tx) => {
    const sessao = await sessaoAberta(tx, pedido.sessao);
    if (!sessao) throw new SessaoEncerrada();
    const kit = await separarKit(tx, sessao.usuarioId, sessao.id, agora);
    await tx.update(lemnosSessoes).set({ espacos: kit.espacos }).where(eq(lemnosSessoes.id, sessao.id));
    return { sessaoId: sessao.id, resposta: { kit } };
  });
}

/**
 * Extração: o saque vai para o baú, o maço de notas vira grana, a arma achada passa a ser do jogador (continua em campo,
 * na mão dele) e a granada lançada se gasta. Arma fora do catálogo não entra no baú.
 */
export async function extrair(
  bd: Bd,
  pedido: { sessao: string; referencia: string; saque: string[]; armas: ArmaNaMao[]; gastas: string[] },
  agora: Date = new Date(),
): Promise<{ linhasNovas: { classe: string; linha: string }[]; grana: number }> {
  return umaVez(bd, 'extracao', pedido.referencia, async (tx) => {
    const sessao = await sessaoAberta(tx, pedido.sessao);
    if (!sessao) throw new SessaoEncerrada();
    if (pedido.saque.length > sessao.espacos || pedido.saque.some((id) => !saqueLemnos(id))) throw new ItemInvalido();

    const grana = pedido.saque.filter((id) => saqueLemnos(id)?.raridade === 'dinheiro').reduce((soma, id) => soma + (saqueLemnos(id)?.valor ?? 0), 0);
    const guardar = pedido.saque.filter((id) => saqueLemnos(id)?.raridade !== 'dinheiro');
    if (guardar.length > 0) {
      await tx.insert(lemnosItens).values(guardar.map((itemId) => ({ usuarioId: sessao.usuarioId, tipo: 'saque' as const, itemId, origem: 'achado' as const, sessaoId: sessao.id, criadoEm: agora, atualizadoEm: agora })));
    }
    if (grana > 0) await lancarGrana(tx, { usuarioId: sessao.usuarioId, tipo: 'lemnos', quantidade: grana, referencia: pedido.referencia, detalhes: { sessao: sessao.id } });

    const linhasNovas: { classe: string; linha: string }[] = [];
    for (const arma of pedido.armas) {
      if (arma.linha !== null) continue;
      const item = armaPelaClasse(arma.classe) ?? granadaPelaClasse(arma.classe);
      if (!item) continue;
      const [nova] = await tx
        .insert(lemnosItens)
        .values({ usuarioId: sessao.usuarioId, tipo: armaPelaClasse(arma.classe) ? 'arma' : 'granada', itemId: item.id, origem: 'achado', situacao: 'em_campo', sessaoId: sessao.id, criadoEm: agora, atualizadoEm: agora })
        .returning({ id: lemnosItens.id });
      linhasNovas.push({ classe: arma.classe, linha: nova.id });
    }
    await marcarGastas(tx, sessao.id, pedido.gastas, agora);
    await tx
      .update(lemnosSessoes)
      .set({ extracoes: sql`${lemnosSessoes.extracoes} + 1`, granaGanha: sql`${lemnosSessoes.granaGanha} + ${grana}` })
      .where(eq(lemnosSessoes.id, sessao.id));
    return { sessaoId: sessao.id, detalhes: { saque: pedido.saque }, resposta: { linhasNovas, grana } };
  });
}

export async function morrer(bd: Bd, pedido: { sessao: string; referencia: string; matador: string | null; gastas: string[] }, agora: Date = new Date()): Promise<void> {
  await umaVez(bd, 'morte', pedido.referencia, async (tx) => {
    const sessao = await sessaoAberta(tx, pedido.sessao);
    // Morte depois da saída (fora de ordem ou repetida): não muda nada.
    if (!sessao) return { sessaoId: pedido.sessao, resposta: null };
    const [morto] = await tx.select({ steamid64: usuarios.steamid64 }).from(usuarios).where(eq(usuarios.id, sessao.usuarioId));
    await marcarGastas(tx, sessao.id, pedido.gastas, agora);
    await perderComoMorte(tx, sessao.id, agora);
    await tx.update(lemnosSessoes).set({ mortes: sql`${lemnosSessoes.mortes} + 1` }).where(eq(lemnosSessoes.id, sessao.id));
    if (pedido.matador && pedido.matador !== morto?.steamid64) {
      const [matador] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.steamid64, pedido.matador));
      if (matador) {
        await tx
          .update(lemnosSessoes)
          .set({ abates: sql`${lemnosSessoes.abates} + 1` })
          .where(and(eq(lemnosSessoes.usuarioId, matador.id), isNull(lemnosSessoes.encerradaEm)));
      }
    }
    return { sessaoId: sessao.id, detalhes: { matador: pedido.matador, morto: morto?.steamid64 ?? null }, resposta: null };
  });
}

/**
 * Saída do servidor. Na safe zone, o que está na mão volta ao baú (o que ficou no chão se perde). Fora dela, e em
 * qualquer kick, perde como na morte. Kick conta na escada de punições.
 */
export async function sair(
  bd: Bd,
  pedido: { sessao: string; referencia: string; motivo: MotivoDaSaida; naSafeZone: boolean; gastas: string[]; armas: ArmaNaMao[] },
  agora: Date = new Date(),
): Promise<void> {
  await umaVez(bd, 'saida', pedido.referencia, async (tx) => {
    const sessao = await sessaoAberta(tx, pedido.sessao);
    if (!sessao) return { sessaoId: pedido.sessao, resposta: null };
    await marcarGastas(tx, sessao.id, pedido.gastas, agora);
    const salva = pedido.motivo === 'saiu' && pedido.naSafeZone;
    if (salva) {
      const naMao = pedido.armas.map((arma) => arma.linha).filter((linha): linha is string => linha !== null);
      if (naMao.length > 0) {
        await tx
          .update(lemnosItens)
          .set({ situacao: 'no_bau', atualizadoEm: agora })
          .where(and(eq(lemnosItens.sessaoId, sessao.id), eq(lemnosItens.situacao, 'em_campo'), inArray(lemnosItens.id, naMao)));
      }
    }
    await perderComoMorte(tx, sessao.id, agora);
    const fim = salva ? 'saiu' : pedido.motivo === 'saiu' ? 'morreu_saindo' : pedido.motivo;
    await tx.update(lemnosSessoes).set({ encerradaEm: agora, fim }).where(eq(lemnosSessoes.id, sessao.id));
    if (pedido.motivo !== 'saiu') await registrarKick(tx, sessao.usuarioId, pedido.motivo === 'kick_afk' ? 'afk' : 'acampar', agora);
    await lancarXpDaSessao(tx, sessao.id);
    return { sessaoId: sessao.id, detalhes: { motivo: pedido.motivo, naSafeZone: pedido.naSafeZone }, resposta: null };
  });
}

/** O servidor (re)ligou: quem estava lá caiu junto. Fecha as sessões abertas da porta como queda. */
export async function fecharSessoesDaPorta(bd: Bd, pedido: { porta: number; referencia: string }, agora: Date = new Date()): Promise<number> {
  return umaVez(bd, 'inicio', pedido.referencia, async (tx) => {
    const abertas = await tx.select({ id: lemnosSessoes.id }).from(lemnosSessoes).where(and(eq(lemnosSessoes.porta, pedido.porta), isNull(lemnosSessoes.encerradaEm)));
    for (const aberta of abertas) await fecharComoQueda(tx, aberta.id, agora);
    return { sessaoId: null, detalhes: { porta: pedido.porta }, resposta: abertas.length };
  });
}
