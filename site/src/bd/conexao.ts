import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as esquema from './esquema';

// Tipo comum ao PostgreSQL de verdade e ao banco em memória dos testes.
export type Bd = PgDatabase<PgQueryResultHKT, typeof esquema>;

let bd: Bd | undefined;

export function obterBd(): Bd {
  if (!bd) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Defina DATABASE_URL em site/.env.local.');
    bd = drizzle(new Pool({ connectionString: url }), { schema: esquema }) as unknown as Bd;
  }
  return bd;
}
