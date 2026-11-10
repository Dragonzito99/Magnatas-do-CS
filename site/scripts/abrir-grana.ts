// Abertura da loja: quem já jogou recebe 1 Grana a cada 10 XP antigos, uma vez só. Rodar de novo não paga de novo.
// Uso: npm run grana:abrir
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Bd } from '../src/bd/conexao';
import * as esquema from '../src/bd/esquema';
import { abrirGrana, divergencias } from '../src/dominio/grana';
import { carregarAmbiente } from './ambiente';

async function principal() {
  carregarAmbiente();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bd = drizzle(pool, { schema: esquema }) as unknown as Bd;
  const contas = await abrirGrana(bd);
  const erradas = await divergencias(bd);
  await pool.end();
  console.log(`Abertura paga para ${contas} conta(s).`);
  console.log(erradas.length === 0 ? 'Conferência: todos os saldos batem com o livro-caixa.' : `ATENÇÃO: ${erradas.length} saldo(s) não batem.`);
  if (erradas.length > 0) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
