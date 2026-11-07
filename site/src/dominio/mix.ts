import { randomInt } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { filaMix, usuarios, type Usuario } from '@/bd/esquema';
import { exigirAtivo, exigirLivre } from './disponibilidade';
import { criarPartida } from './partidas';
import type { UsuarioPublico } from './salas';

const TOTAL_DO_MIX = 10;
const CHAVE_DA_FILA = 7_204_001;

/** Embaralha com gerador simples e reproduzível, para os testes poderem fixar o sorteio. */
function embaralhar<T>(lista: T[], semente: number): T[] {
  let estado = semente >>> 0;
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(proximo() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export async function entrarNoMix(
  bd: Bd,
  ator: Pick<Usuario, 'id'>,
  opcoes: { semente?: number; agora?: Date } = {},
): Promise<{ partidaId?: string }> {
  return bd.transaction(async (tx) => {
    // Só um pedido por vez mexe na fila, para o décimo fechar uma partida só.
    await tx.execute(sql`select pg_advisory_xact_lock(${CHAVE_DA_FILA})`);
    await exigirAtivo(tx, ator);
    const [jaNaFila] = await tx.select().from(filaMix).where(eq(filaMix.usuarioId, ator.id));
    if (jaNaFila) return {};
    const agora = opcoes.agora ?? new Date();
    await exigirLivre(tx, ator.id, agora);
    await tx.insert(filaMix).values({ usuarioId: ator.id, entrouEm: agora });

    const fila = await tx
      .select({ id: usuarios.id, estado: usuarios.estado, entrouEm: filaMix.entrouEm })
      .from(filaMix)
      .innerJoin(usuarios, eq(filaMix.usuarioId, usuarios.id))
      .orderBy(asc(filaMix.entrouEm), asc(filaMix.usuarioId));

    const semAcesso = fila.filter((linha) => linha.estado !== 'ativo').map((linha) => linha.id);
    if (semAcesso.length > 0) await tx.delete(filaMix).where(inArray(filaMix.usuarioId, semAcesso));

    const ativos = fila.filter((linha) => linha.estado === 'ativo').map((linha) => linha.id);
    if (ativos.length < TOTAL_DO_MIX) return {};

    const jogadores = ativos.slice(0, TOTAL_DO_MIX);
    await tx.delete(filaMix).where(inArray(filaMix.usuarioId, jogadores));
    const sorteados = embaralhar(jogadores, opcoes.semente ?? randomInt(2 ** 31));
    // Guarda a posição de cada um na fila: se alguém não aceitar, quem aceitou volta para o mesmo lugar.
    const filaDoMix = new Map(fila.filter((linha) => jogadores.includes(linha.id)).map((linha) => [linha.id, linha.entrouEm]));
    const partida = await criarPartida(tx, {
      tipo: 'mix',
      time1: sorteados.slice(0, TOTAL_DO_MIX / 2),
      time2: sorteados.slice(TOTAL_DO_MIX / 2),
      agora,
      filaDoMix,
    });
    return { partidaId: partida.id };
  });
}

export async function sairDoMix(bd: Bd, ator: Pick<Usuario, 'id'>): Promise<void> {
  await bd.delete(filaMix).where(eq(filaMix.usuarioId, ator.id));
}

export async function verMix(bd: Bd): Promise<{ jogadores: UsuarioPublico[]; total: number }> {
  const jogadores = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(filaMix)
    .innerJoin(usuarios, eq(filaMix.usuarioId, usuarios.id))
    .where(eq(usuarios.estado, 'ativo'))
    .orderBy(asc(filaMix.entrouEm));
  return { jogadores, total: jogadores.length };
}
