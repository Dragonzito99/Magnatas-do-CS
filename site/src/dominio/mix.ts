import { randomInt } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Bd } from '@/bd/conexao';
import { filaMix, usuarios, type Usuario } from '@/bd/esquema';
import { exigirAtivo, exigirLivre, type Transacao } from './disponibilidade';
import { criarPartida } from './partidas';
import { TEMPO_FORA_DO_SITE_NA_SALA_MS, type UsuarioPublico } from './salas';
import { exigirServidoresNoAr } from './manutencao';

const TOTAL_DO_MIX = 10;
const CHAVE_DA_FILA = 7_204_001;

// A mesma regra das salas: com a aba escondida o site continua marcando presença, então só sai quem fechou o site.
const TEMPO_FORA_DO_SITE_NA_FILA_MS = TEMPO_FORA_DO_SITE_NA_SALA_MS;

const limiteDePresenca = (agora: Date) => new Date(agora.getTime() - TEMPO_FORA_DO_SITE_NA_FILA_MS);
const estaNoSite = (vistoEm: Date | null, agora: Date) => vistoEm !== null && vistoEm >= limiteDePresenca(agora);

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
    await travarFila(tx);
    await exigirAtivo(tx, ator);
    await exigirServidoresNoAr(tx);
    const [jaNaFila] = await tx.select().from(filaMix).where(eq(filaMix.usuarioId, ator.id));
    if (jaNaFila) return {};
    const agora = opcoes.agora ?? new Date();
    await exigirLivre(tx, ator.id, agora);
    // Quem clica em entrar está no site agora.
    await tx.update(usuarios).set({ vistoEm: agora }).where(eq(usuarios.id, ator.id));
    await tx.insert(filaMix).values({ usuarioId: ator.id, entrouEm: agora });

    return fecharMixSePossivel(tx, agora, opcoes.semente);
  });
}

/** Só com a trava da fila: dois pedidos juntos fechariam a mesma partida duas vezes. */
export async function travarFila(tx: Transacao): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${CHAVE_DA_FILA})`);
}

/** Com 10 na fila, tira os 10 primeiros e cria a partida esperando o aceite. */
export async function fecharMixSePossivel(tx: Transacao, agora: Date, semente?: number): Promise<{ partidaId?: string }> {
  const fila = await tx
    .select({ id: usuarios.id, estado: usuarios.estado, vistoEm: usuarios.vistoEm, entrouEm: filaMix.entrouEm })
    .from(filaMix)
    .innerJoin(usuarios, eq(filaMix.usuarioId, usuarios.id))
    .orderBy(asc(filaMix.entrouEm), asc(filaMix.usuarioId));

  // Sem acesso ou fora do site: sai da fila em vez de ser puxado para uma partida que não vai jogar.
  const podeJogar = (linha: (typeof fila)[number]) => linha.estado === 'ativo' && estaNoSite(linha.vistoEm, agora);
  const removidos = fila.filter((linha) => !podeJogar(linha)).map((linha) => linha.id);
  if (removidos.length > 0) await tx.delete(filaMix).where(inArray(filaMix.usuarioId, removidos));

  const ativos = fila.filter(podeJogar).map((linha) => linha.id);
  if (ativos.length < TOTAL_DO_MIX) return {};

  const jogadores = ativos.slice(0, TOTAL_DO_MIX);
  await tx.delete(filaMix).where(inArray(filaMix.usuarioId, jogadores));
  const sorteados = embaralhar(jogadores, semente ?? randomInt(2 ** 31));
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
}

export async function sairDoMix(bd: Bd, ator: Pick<Usuario, 'id'>): Promise<void> {
  await bd.delete(filaMix).where(eq(filaMix.usuarioId, ator.id));
}

/** Roda na varredura: tira da fila quem fechou o site, como nas salas. */
export async function tirarDaFilaQuemSaiuDoSite(bd: Bd, agora: Date = new Date()): Promise<void> {
  await bd.transaction(async (tx) => {
    await travarFila(tx);
    const ausentes = await tx
      .select({ id: filaMix.usuarioId })
      .from(filaMix)
      .innerJoin(usuarios, eq(filaMix.usuarioId, usuarios.id))
      .where(or(isNull(usuarios.vistoEm), lt(usuarios.vistoEm, limiteDePresenca(agora))));
    if (ausentes.length > 0) await tx.delete(filaMix).where(inArray(filaMix.usuarioId, ausentes.map((linha) => linha.id)));
  });
}

export async function verMix(bd: Bd, agora: Date = new Date()): Promise<{ jogadores: UsuarioPublico[]; total: number }> {
  const jogadores = await bd
    .select({ id: usuarios.id, apelido: usuarios.apelido, avatarUrl: usuarios.avatarUrl })
    .from(filaMix)
    .innerJoin(usuarios, eq(filaMix.usuarioId, usuarios.id))
    .where(and(eq(usuarios.estado, 'ativo'), gte(usuarios.vistoEm, limiteDePresenca(agora))))
    .orderBy(asc(filaMix.entrouEm));
  return { jogadores, total: jogadores.length };
}
