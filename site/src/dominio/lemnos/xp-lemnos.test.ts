import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { lancamentosDeGrana, lemnosSessoes, usuarios, xpPartidas } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { lancarXpDaSessao } from './xp-lemnos';

test('sessão fechada com 3 abates lança 60 XP e nenhuma grana, uma vez só', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [sessao] = await bd.insert(lemnosSessoes).values({ usuarioId: conta.id, porta: 27024, abates: 3, mortes: 1 }).returning();
  await bd.transaction((tx) => lancarXpDaSessao(tx, sessao.id));
  await bd.transaction((tx) => lancarXpDaSessao(tx, sessao.id));
  const linhas = await bd.select().from(xpPartidas).where(eq(xpPartidas.usuarioId, conta.id));
  expect(linhas.map((linha) => [linha.referencia, linha.xp, linha.abates, linha.mortes, linha.mapa])).toEqual([[`lemnos:${sessao.id}`, 60, 3, 1, 'lemnos']]);
  expect(await bd.select().from(lancamentosDeGrana).where(eq(lancamentosDeGrana.usuarioId, conta.id))).toEqual([]);
  const [atual] = await bd.select().from(usuarios).where(eq(usuarios.id, conta.id));
  expect(atual.xpTotal).toBe(60);
});

test('sessão sem abates não lança XP', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [sessao] = await bd.insert(lemnosSessoes).values({ usuarioId: conta.id, porta: 27024 }).returning();
  await bd.transaction((tx) => lancarXpDaSessao(tx, sessao.id));
  expect(await bd.select().from(xpPartidas)).toEqual([]);
});
