import { randomInt } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { filaMix, partidaJogadores, partidas, salaMembros, salas, usuarios, type Partida, type Usuario } from '@/bd/esquema';
import type { Transacao } from './disponibilidade';
import { registrarFalta } from './faltas';
import { fecharMixSePossivel, travarFila } from './mix';
import { finalizarPartida, MAPAS } from './partidas';
import { removerDaSala } from './salas';
import { PRAZO_DO_VETO_MS } from './vetos';

/** Todo mundo tem 30 segundos para aceitar, como na Gamers Club. */
export const PRAZO_DO_ACEITE_MS = 30_000;

export class AceiteIndisponivel extends Error {
  constructor() {
    super('Esta partida não está mais esperando o seu aceite.');
  }
}

async function travarPartida(tx: Transacao, partidaId: string): Promise<Partida | undefined> {
  const [partida] = await tx.select().from(partidas).where(eq(partidas.id, partidaId)).for('update');
  return partida;
}

export async function aceitarPartida(bd: Bd, ator: Pick<Usuario, 'id'>, partidaId: string, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    const partida = await travarPartida(tx, partidaId);
    if (!partida || partida.estado !== 'aguardando_aceite' || !partida.aceiteAte || partida.aceiteAte <= agora) throw new AceiteIndisponivel();
    const [vaga] = await tx
      .select({ aceitouEm: partidaJogadores.aceitouEm })
      .from(partidaJogadores)
      .where(and(eq(partidaJogadores.partidaId, partidaId), eq(partidaJogadores.usuarioId, ator.id)));
    if (!vaga) throw new AceiteIndisponivel();
    if (vaga.aceitouEm) return;
    await tx
      .update(partidaJogadores)
      .set({ aceitouEm: agora })
      .where(and(eq(partidaJogadores.partidaId, partidaId), eq(partidaJogadores.usuarioId, ator.id)));
    const [faltando] = await tx
      .select({ usuarioId: partidaJogadores.usuarioId })
      .from(partidaJogadores)
      .where(and(eq(partidaJogadores.partidaId, partidaId), isNull(partidaJogadores.aceitouEm)))
      .limit(1);
    if (!faltando) await seguirDepoisDoAceite(tx, partida, agora);
  });
}

/** Desafio, clã x clã e treino vão para os vetos, com o cara ou coroa já tirado. Mix sorteia o mapa e espera servidor. */
async function seguirDepoisDoAceite(tx: Transacao, partida: Partida, agora: Date): Promise<void> {
  if (partida.tipo !== 'mix') {
    await tx
      .update(partidas)
      .set({ estado: 'vetando', primeiroAVetar: randomInt(1, 3), vetoAte: new Date(agora.getTime() + PRAZO_DO_VETO_MS), estadoDesde: agora })
      .where(eq(partidas.id, partida.id));
    return;
  }
  await tx
    .update(partidas)
    .set({ estado: 'aguardando_servidor', mapa: MAPAS[randomInt(MAPAS.length)], estadoDesde: agora })
    .where(eq(partidas.id, partida.id));
}

export async function resolverAceitesVencidos(bd: Bd, agora: Date = new Date()): Promise<void> {
  const vencidas = await bd
    .select({ id: partidas.id })
    .from(partidas)
    .where(and(eq(partidas.estado, 'aguardando_aceite'), lte(partidas.aceiteAte, agora)));
  for (const { id } of vencidas) {
    await bd.transaction(async (tx) => {
      // Confere de novo com a linha travada: o último aceite pode ter chegado no mesmo instante.
      const partida = await travarPartida(tx, id);
      if (!partida || partida.estado !== 'aguardando_aceite' || !partida.aceiteAte || partida.aceiteAte > agora) return;
      await cancelarPorFaltaDeAceite(tx, partida, agora);
    });
  }
}

async function cancelarPorFaltaDeAceite(tx: Transacao, partida: Partida, agora: Date): Promise<void> {
  const jogadores = await tx
    .select({
      usuarioId: partidaJogadores.usuarioId,
      aceitouEm: partidaJogadores.aceitouEm,
      entrouNaFilaEm: partidaJogadores.entrouNaFilaEm,
      estado: usuarios.estado,
    })
    .from(partidaJogadores)
    .innerJoin(usuarios, eq(partidaJogadores.usuarioId, usuarios.id))
    .where(eq(partidaJogadores.partidaId, partida.id));
  await finalizarPartida(tx, partida.id, { estado: 'cancelada', vencedor: null, motivoDoCancelamento: 'aceite' });

  if (partida.tipo === 'mix') {
    // Quem aceitou volta para a fila no lugar de antes; quem não aceitou dá a vaga para outra pessoa.
    await travarFila(tx);
    const aceitaram = jogadores.filter((jogador) => jogador.aceitouEm && jogador.estado === 'ativo');
    if (aceitaram.length > 0) {
      await tx
        .insert(filaMix)
        .values(aceitaram.map((jogador) => ({ usuarioId: jogador.usuarioId, entrouEm: jogador.entrouNaFilaEm ?? agora })))
        .onConflictDoNothing();
    }
    // Se alguém entrou na fila durante o aceite, já dá para fechar outra partida sem esperar o próximo clique.
    await fecharMixSePossivel(tx, agora);
    return;
  }

  // Suspenso ou banido no meio do aceite: a partida caiu por outro motivo, e ninguém leva falta.
  const alguemSemAcesso = jogadores.some((jogador) => jogador.estado !== 'ativo');
  for (const jogador of jogadores) {
    if (jogador.aceitouEm) continue;
    await tirarDaSala(tx, jogador.usuarioId);
    if (!alguemSemAcesso && jogador.estado === 'ativo') await registrarFalta(tx, jogador.usuarioId, partida.id, agora);
  }
}

async function tirarDaSala(tx: Transacao, usuarioId: string): Promise<void> {
  const [vinculo] = await tx.select().from(salaMembros).where(eq(salaMembros.usuarioId, usuarioId));
  if (!vinculo) return;
  const [sala] = await tx.select().from(salas).where(eq(salas.id, vinculo.salaId)).for('update');
  if (sala) await removerDaSala(tx, sala, usuarioId);
}

export async function aceitesDaPartida(bd: Bd, partidaId: string): Promise<{ usuarioId: string; aceitou: boolean }[]> {
  const linhas = await bd
    .select({ usuarioId: partidaJogadores.usuarioId, aceitouEm: partidaJogadores.aceitouEm })
    .from(partidaJogadores)
    .where(eq(partidaJogadores.partidaId, partidaId))
    .orderBy(asc(partidaJogadores.time), asc(partidaJogadores.usuarioId));
  return linhas.map((linha) => ({ usuarioId: linha.usuarioId, aceitou: linha.aceitouEm !== null }));
}

/** A partida que a pessoa ainda precisa aceitar, para o aviso ao vivo. */
export async function avisoPendente(bd: Bd, usuarioId: string, agora: Date = new Date()): Promise<{ partidaId: string; aceiteAte: Date } | null> {
  const [linha] = await bd
    .select({ partidaId: partidas.id, aceiteAte: partidas.aceiteAte })
    .from(partidaJogadores)
    .innerJoin(partidas, eq(partidaJogadores.partidaId, partidas.id))
    .where(
      and(
        eq(partidaJogadores.usuarioId, usuarioId),
        isNull(partidaJogadores.aceitouEm),
        inArray(partidas.estado, ['aguardando_aceite']),
        gt(partidas.aceiteAte, agora),
      ),
    )
    .limit(1);
  return linha?.aceiteAte ? { partidaId: linha.partidaId, aceiteAte: linha.aceiteAte } : null;
}
