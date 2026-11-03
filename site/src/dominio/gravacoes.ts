import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as FluxoWeb } from 'node:stream/web';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { tokenConfere } from '@/auth/token-servidor';
import type { Bd } from '@/bd/conexao';
import { gravacoes, partidas, type Usuario } from '@/bd/esquema';
import { exigirPermissao, registrarAuditoria, SemPermissao } from './equipe';

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

/** Só a equipe baixa gravações, e cada download fica registrado. */
export async function respostaDoDownload(bd: Bd, pasta: string, leitor: Usuario | null, gravacaoId: string): Promise<Response> {
  if (!leitor) return new Response('Não autorizado.', { status: 401 });
  try {
    await exigirPermissao(bd, leitor, 'moderar');
  } catch (erro) {
    if (erro instanceof SemPermissao) return new Response('Não autorizado.', { status: 403 });
    throw erro;
  }
  if (!z.uuid().safeParse(gravacaoId).success) return new Response('Gravação não encontrada.', { status: 404 });
  const [gravacao] = await bd
    .select()
    .from(gravacoes)
    .where(and(eq(gravacoes.id, gravacaoId), isNull(gravacoes.apagadaEm)));
  if (!gravacao) return new Response('Gravação não encontrada.', { status: 404 });

  const caminho = path.join(pasta, gravacao.arquivo);
  if (!existsSync(caminho)) return new Response('Gravação não encontrada.', { status: 404 });
  await registrarAuditoria(bd, { atorId: leitor.id, acao: 'baixar_gravacao', detalhes: { gravacaoId, partidaId: gravacao.partidaId } });
  return new Response(Readable.toWeb(createReadStream(caminho)) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(gravacao.bytes),
      'Content-Disposition': `attachment; filename="${gravacao.arquivo}"`,
      'Cache-Control': 'no-store',
    },
  });
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
