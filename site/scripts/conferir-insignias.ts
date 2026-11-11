// Estreia das insígnias: confere as partidas antigas de todas as contas ativas e entrega as insígnias com o prêmio
// (decisão do dono: as antigas também dão prêmio). Rodar de novo não paga de novo. Uso: npm run insignias:conferir
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Bd } from '../src/bd/conexao';
import * as esquema from '../src/bd/esquema';
import { divergencias } from '../src/dominio/grana';
import { conferirInsigniasDeTodos } from '../src/dominio/insignias';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bd = drizzle(pool, { schema: esquema }) as unknown as Bd;
  const novas = await conferirInsigniasDeTodos(bd);
  const erradas = await divergencias(bd);
  await pool.end();
  console.log(`${novas} insígnia(s) nova(s) entregue(s).`);
  console.log(erradas.length === 0 ? 'Conferência: todos os saldos batem com o livro-caixa.' : `ATENÇÃO: ${erradas.length} saldo(s) não batem.`);
  if (erradas.length > 0) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
