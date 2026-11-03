import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from '@/bd/conexao';
import { auditoria, gravacoes, partidas, type Partida } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { GravacaoGrandeDemais, GravacaoRecusada, respostaDaGravacao, respostaDoDownload, salvarGravacao } from './gravacoes';

let bd: Bd;
let pasta: string;
let partida: Partida;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
  pasta = path.join(await mkdtemp(path.join(tmpdir(), 'magnatas-gravacoes-')), 'demos');
  [partida] = await bd.insert(partidas).values({ tipo: 'mix', estado: 'encerrada', mapa: 'de_mirage' }).returning();
});

const cabecalhos = (extras: Record<string, string> = {}) => new Headers({ 'MatchZy-MatchId': String(partida.numero), ...extras });
const corpo = (texto: string) => new Response(texto).body;

test('gravação é salva na pasta configurada e registrada na partida', async () => {
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('demo'));
  const arquivo = `${partida.numero}.dem`;
  expect(await readFile(path.join(pasta, arquivo), 'utf8')).toBe('demo');
  const [linha] = await bd.select().from(gravacoes).where(eq(gravacoes.partidaId, partida.id));
  expect(linha).toMatchObject({ arquivo, bytes: 4, apagadaEm: null });
});

test('nome de arquivo vindo do servidor não escapa da pasta (../../x)', async () => {
  await salvarGravacao(bd, pasta, cabecalhos({ 'MatchZy-FileName': '../../x.dem' }), corpo('demo'));
  expect(await readdir(pasta)).toEqual([`${partida.numero}.dem`]);
  expect(existsSync(path.join(pasta, '..', '..', 'x.dem'))).toBe(false);
});

test.each(['../../x', '1/../../x', '', '12a', '99999999999999'])('número de partida inválido é recusado: %j', async (numero) => {
  await expect(salvarGravacao(bd, pasta, new Headers({ 'MatchZy-MatchId': numero }), corpo('demo'))).rejects.toThrow(GravacaoRecusada);
});

test('gravação de partida desconhecida é recusada', async () => {
  const desconhecida = new Headers({ 'MatchZy-MatchId': String(partida.numero + 100) });
  await expect(salvarGravacao(bd, pasta, desconhecida, corpo('demo'))).rejects.toThrow(GravacaoRecusada);
  expect(await bd.select().from(gravacoes)).toEqual([]);
});

test('corpo maior que o limite é recusado, sem deixar arquivo', async () => {
  await expect(salvarGravacao(bd, pasta, cabecalhos(), corpo('12345'), 4)).rejects.toThrow(GravacaoGrandeDemais);
  expect(await readdir(pasta)).toEqual([]);
  expect(await bd.select().from(gravacoes)).toEqual([]);
});

test('corpo vazio é recusado', async () => {
  await expect(salvarGravacao(bd, pasta, cabecalhos(), null)).rejects.toThrow(GravacaoRecusada);
  await expect(salvarGravacao(bd, pasta, cabecalhos(), corpo(''))).rejects.toThrow(GravacaoRecusada);
  expect(await bd.select().from(gravacoes)).toEqual([]);
});

test('segunda gravação da mesma partida não troca a primeira', async () => {
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('primeira'));
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('segunda'));
  expect(await readFile(path.join(pasta, `${partida.numero}.dem`), 'utf8')).toBe('primeira');
  expect(await bd.select().from(gravacoes)).toHaveLength(1);
});

test('a rota recusa token errado sem gravar nada', async () => {
  const pedido = () => new Request('http://site/x', { method: 'POST', headers: cabecalhos(), body: 'demo' });
  expect((await respostaDaGravacao(bd, pasta, 'errado', 'certo', pedido())).status).toBe(401);
  expect((await respostaDaGravacao(bd, pasta, 'certo', undefined, pedido())).status).toBe(401);
  expect(existsSync(pasta)).toBe(false);
});

test('a rota responde 200 ao salvar, 404 a partida desconhecida e 413 ao que passa do limite', async () => {
  const pedido = (numero: number) =>
    new Request('http://site/x', { method: 'POST', headers: { 'MatchZy-MatchId': String(numero) }, body: '12345' });
  expect((await respostaDaGravacao(bd, pasta, 'certo', 'certo', pedido(partida.numero + 100))).status).toBe(404);
  expect((await respostaDaGravacao(bd, pasta, 'certo', 'certo', pedido(partida.numero), 4)).status).toBe(413);
  expect((await respostaDaGravacao(bd, pasta, 'certo', 'certo', pedido(partida.numero))).status).toBe(200);
});

test('a equipe baixa a gravação, e o download fica registrado', async () => {
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('demo'));
  const [{ id }] = await bd.select().from(gravacoes);
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  const resposta = await respostaDoDownload(bd, pasta, gm, id);
  expect(resposta.status).toBe(200);
  expect(await resposta.text()).toBe('demo');
  expect(resposta.headers.get('content-disposition')).toContain(`${partida.numero}.dem`);
  const [registro] = await bd.select().from(auditoria).where(eq(auditoria.acao, 'baixar_gravacao'));
  expect(registro).toMatchObject({ atorId: gm.id });
});

test('jogador comum e visitante não baixam a gravação', async () => {
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('demo'));
  const [{ id }] = await bd.select().from(gravacoes);
  expect((await respostaDoDownload(bd, pasta, null, id)).status).toBe(401);
  expect((await respostaDoDownload(bd, pasta, await criarUsuario(bd, { estado: 'ativo' }), id)).status).toBe(403);
  expect(await bd.select().from(auditoria)).toEqual([]);
});

test('gravação apagada, inexistente ou com id estranho dá 404', async () => {
  const gm = await criarUsuario(bd, { estado: 'ativo', papel: 'gm' });
  await salvarGravacao(bd, pasta, cabecalhos(), corpo('demo'));
  const [{ id }] = await bd.select().from(gravacoes);
  await bd.update(gravacoes).set({ apagadaEm: new Date() }).where(eq(gravacoes.id, id));
  expect((await respostaDoDownload(bd, pasta, gm, id)).status).toBe(404);
  expect((await respostaDoDownload(bd, pasta, gm, '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  expect((await respostaDoDownload(bd, pasta, gm, '../../x')).status).toBe(404);
});
