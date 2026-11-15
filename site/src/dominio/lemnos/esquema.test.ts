import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { lemnosEventos, lemnosItens, lemnosSessoes, servidoresDiversao } from '@/bd/esquema';
import { criarBancoDeTeste, criarUsuario } from '@/bd/teste';
import { garantirServidorDaLemnos } from './servidor';

test('a migração cria as tabelas da Ilha Lemnos e o servidor desligado', async () => {
  const bd = await criarBancoDeTeste();
  expect(await garantirServidorDaLemnos(bd)).toBe('criado');
  expect(await garantirServidorDaLemnos(bd)).toBe('ja_existia');
  const [servidor] = await bd.select().from(servidoresDiversao).where(eq(servidoresDiversao.modo, 'lemnos'));
  expect(servidor).toMatchObject({ porta: 27024, vagas: 20, ativo: false, sobDemanda: false, nomeNoServidor: 'ilha-lemnos', mapa: 'Sirocco', armas: 'Extração' });
  expect(await bd.select().from(lemnosItens)).toEqual([]);
});

test('a mesma referência de evento não entra duas vezes', async () => {
  const bd = await criarBancoDeTeste();
  const conta = await criarUsuario(bd, { estado: 'ativo' });
  const [sessao] = await bd.insert(lemnosSessoes).values({ usuarioId: conta.id, porta: 27024 }).returning();
  await bd.insert(lemnosEventos).values({ sessaoId: sessao.id, tipo: 'entrada', referencia: 'lemnos:27024:a' });
  await expect(bd.insert(lemnosEventos).values({ sessaoId: sessao.id, tipo: 'morte', referencia: 'lemnos:27024:a' })).rejects.toThrow();
});
