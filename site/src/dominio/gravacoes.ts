import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as FluxoWeb } from 'node:stream/web';
import { eq } from 'drizzle-orm';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidas } from '@/bd/esquema';

export class GravacaoRecusada extends Error {
  constructor() {
    super('Gravação recusada.');
  }
}

export class GravacaoGrandeDemais extends Error {
  constructor() {
    super('Gravação maior que o limite.');
  }
}

const LIMITE_DE_BYTES = 2 * 1024 * 1024 * 1024;
const MAIOR_NUMERO_DE_PARTIDA = 2_147_483_647;

export async function salvarGravacao(
  bd: Bd,
  pasta: string,
  cabecalhos: Headers,
  corpo: ReadableStream<Uint8Array> | null,
  limiteDeBytes: number = LIMITE_DE_BYTES,
): Promise<void> {
  const numero = cabecalhos.get('matchzy-matchid') ?? '';
  if (!/^\d+$/.test(numero) || Number(numero) > MAIOR_NUMERO_DE_PARTIDA) throw new GravacaoRecusada();
  const [partida] = await bd.select().from(partidas).where(eq(partidas.numero, Number(numero)));
  if (!partida || !corpo) throw new GravacaoRecusada();

  // A primeira fica: gravação é prova, e não pode ser trocada depois.
  const [existente] = await bd.select().from(gravacoes).where(eq(gravacoes.partidaId, partida.id));
  if (existente) return;

  // O nome vem do número no banco, nunca do que o servidor mandou.
  const arquivo = `${partida.numero}.dem`;
  await mkdir(pasta, { recursive: true });
  const temporario = path.join(pasta, `${arquivo}.${randomUUID()}.parcial`);
  let bytes = 0;
  const contador = new Transform({
    transform(pedaco: Buffer, _codificacao, pronto) {
      bytes += pedaco.length;
      if (bytes > limiteDeBytes) pronto(new GravacaoGrandeDemais());
      else pronto(null, pedaco);
    },
  });

  try {
    await pipeline(Readable.fromWeb(corpo as FluxoWeb<Uint8Array>), contador, createWriteStream(temporario));
    if (bytes === 0) throw new GravacaoRecusada();
    await rename(temporario, path.join(pasta, arquivo));
    await bd.insert(gravacoes).values({ partidaId: partida.id, arquivo, bytes }).onConflictDoNothing();
  } catch (erro) {
    await rm(temporario, { force: true });
    throw erro;
  }
}

export async function respostaDaGravacao(
  bd: Bd,
  pasta: string,
  token: string,
  tokenEsperado: string | undefined,
  pedido: Request,
  limiteDeBytes?: number,
): Promise<Response> {
  // O MatchZy não manda cabeçalho de autorização na gravação, então o token vem no caminho.
  if (!tokenConfere(`Bearer ${token}`, tokenEsperado)) return new Response('Não autorizado.', { status: 401 });
  try {
    await salvarGravacao(bd, pasta, pedido.headers, pedido.body, limiteDeBytes);
    return new Response(null, { status: 200 });
  } catch (erro) {
    if (erro instanceof GravacaoRecusada) return new Response(erro.message, { status: 404 });
    if (erro instanceof GravacaoGrandeDemais) return new Response(erro.message, { status: 413 });
    throw erro;
  }
}
