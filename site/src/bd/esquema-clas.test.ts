import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Bd } from './conexao';
import { claMembros, clas } from './esquema';
import { criarBancoDeTeste, criarUsuario } from './teste';

let bd: Bd;

beforeEach(async () => {
  bd = await criarBancoDeTeste();
});

test('clã guarda sigla única sem diferenciar maiúscula', async () => {
  await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' });
  await expect(bd.insert(clas).values({ nome: 'Outro', sigla: 'mgn', cor: 'roxo', entrada: 'aberto' })).rejects.toThrow();
});

test('nome do clã é único sem diferenciar maiúscula', async () => {
  await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' });
  await expect(bd.insert(clas).values({ nome: 'MAGNATAS', sigla: 'XYZ', cor: 'roxo', entrada: 'aberto' })).rejects.toThrow();
});

test('cada pessoa fica em um clã só', async () => {
  const [a] = await bd.insert(clas).values({ nome: 'Alfa', sigla: 'ALF', cor: 'ouro', entrada: 'aberto' }).returning();
  const [b] = await bd.insert(clas).values({ nome: 'Bravo', sigla: 'BRV', cor: 'roxo', entrada: 'convite' }).returning();
  const conta = await criarUsuario(bd);
  await bd.insert(claMembros).values({ usuarioId: conta.id, claId: a.id, cargo: 'dono' });
  await expect(bd.insert(claMembros).values({ usuarioId: conta.id, claId: b.id, cargo: 'membro' })).rejects.toThrow();
});

test('clã desfeito libera nome e sigla', async () => {
  const [antigo] = await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'ouro', entrada: 'aberto' }).returning();
  await bd.update(clas).set({ desfeitoEm: new Date() }).where(eq(clas.id, antigo.id));
  const [novo] = await bd.insert(clas).values({ nome: 'Magnatas', sigla: 'MGN', cor: 'verde', entrada: 'aberto' }).returning();
  expect(novo.id).not.toBe(antigo.id);
});
