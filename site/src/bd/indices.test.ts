import { sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { criarBancoDeTeste } from './teste';

test.each([
  ['partidas', 'estado'],
  ['partida_jogadores', 'usuario_id'],
])('%s tem índice em %s, porque toda página consulta por essa coluna', async (tabela, coluna) => {
  const bd = await criarBancoDeTeste();
  const resultado = (await bd.execute(sql`select indexdef from pg_indexes where tablename = ${tabela}`)) as unknown as { rows: { indexdef: string }[] };
  const definicoes = resultado.rows.map((linha) => linha.indexdef);
  expect(definicoes.some((definicao) => new RegExp(`\\(${coluna}\\)`).test(definicao))).toBe(true);
});
