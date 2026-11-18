// Só para desenvolvimento: cria uma sessão de 3 partidas da Mutação para a conta de teste do Adm, para ver a página
// da partida da Diversão como quem jogou. Uso: npx tsx scripts/dev-partida-diversao.ts
import { like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Bd } from '../src/bd/conexao';
import * as esquema from '../src/bd/esquema';
import { lancarGrana } from '../src/dominio/grana';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  if (process.env.NODE_ENV === 'production') throw new Error('Só em desenvolvimento.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bd = drizzle(pool, { schema: esquema }) as unknown as Bd;
  const [eu] = await bd.select().from(esquema.usuarios).where(like(esquema.usuarios.apelido, 'teste_adm%'));
  const outros = (await bd.select().from(esquema.usuarios).limit(4)).filter((conta) => conta.id !== eu.id).slice(0, 2);
  const agora = Date.now();
  const mapas = ['zm_dust2_bf_l', 'zm_biochemical_hotel', 'zm_silent_village'];
  for (let i = 0; i < 3; i += 1) {
    const referencia = `diversao:27020:dev${agora}${i}`;
    const quando = new Date(agora - (3 - i) * 12 * 60 * 1000);
    const linhas = [
      { conta: eu, abates: [9, 4, 12][i], mortes: [4, 6, 3][i], resultado: (['vitoria', 'derrota', 'vitoria'] as const)[i], xp: [320, 180, 410][i] },
      ...outros.map((conta, n) => ({ conta, abates: 5 - n, mortes: 7 + n, resultado: 'derrota' as const, xp: 150 })),
    ];
    for (const linha of linhas) {
      await bd.insert(esquema.xpPartidas).values({ usuarioId: linha.conta.id, origem: 'diversao', referencia, abates: linha.abates, mortes: linha.mortes, resultado: linha.resultado, xp: linha.xp, mapa: mapas[i], criadoEm: quando });
      await bd.transaction((tx) => lancarGrana(tx, { usuarioId: linha.conta.id, tipo: 'partida', quantidade: Math.floor(linha.xp / 10), referencia }));
    }
    console.log(`/partidas/diversao/27020-dev${agora}${i}`);
  }
  await pool.end();
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
