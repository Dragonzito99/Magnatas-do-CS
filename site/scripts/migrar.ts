// Aplica as migrações no banco de DATABASE_URL. Uso: npm run db:migrar
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

function carregarAmbiente() {
  if (process.env.DATABASE_URL) return;
  for (const linha of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const separador = linha.indexOf('=');
    if (separador > 0 && !linha.startsWith('#')) {
      process.env[linha.slice(0, separador).trim()] = linha.slice(separador + 1).trim();
    }
  }
}

async function principal() {
  carregarAmbiente();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  await pool.end();
  console.log('Migrações aplicadas.');
}

principal().catch((erro) => {
  console.error(`Erro: ${erro.message}`);
  process.exit(1);
});
