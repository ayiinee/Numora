import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDatabaseConnection, getDatabase } from './client.js';

type Mode = 'check' | 'migrate';

function verifyCloudTarget(): { projectRef: string; mode: Mode } {
  const mode = process.argv[2];
  if (mode !== 'check' && mode !== 'migrate') throw new Error('Expected check or migrate.');

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const databaseUrl = process.env.DATABASE_URL;
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef) || !databaseUrl) {
    throw new Error('SUPABASE_PROJECT_REF and DATABASE_URL are required.');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const direct = url.hostname === `db.${projectRef}.supabase.co` && url.username === 'postgres';
  const sessionPooler =
    url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `postgres.${projectRef}`;
  if (
    url.protocol !== 'postgresql:' &&
    url.protocol !== 'postgres:'
  ) throw new Error('DATABASE_URL must use PostgreSQL.');
  if (!direct && !sessionPooler) {
    throw new Error('Database host/user does not match the Supabase project ref.');
  }
  if ((url.port || '5432') !== '5432' || url.pathname !== '/postgres') {
    throw new Error('Use the direct or session pooler connection on port 5432, database postgres.');
  }
  if (url.searchParams.get('sslmode') !== 'require') {
    throw new Error('Append sslmode=require to DATABASE_URL.');
  }

  return { projectRef, mode };
}

async function main() {
  const { projectRef, mode } = verifyCloudTarget();
  const { client, db } = getDatabase();
  try {
    const [target] = await client<
      { database: string; migrationTable: string | null }[]
    >`select current_database() as database, to_regclass('drizzle.__drizzle_migrations')::text as "migrationTable"`;
    if (!target || target.database !== 'postgres') throw new Error('Connected to an unexpected database.');
    const { database, migrationTable } = target;

    const tables = await client<{ tablename: string; rowsecurity: boolean }[]>`
      select tablename, rowsecurity from pg_catalog.pg_tables
      where schemaname = 'public' order by tablename
    `;
    console.log(`Verified Supabase project ${projectRef}; database=${database}; public tables=${tables.length}; migration history=${migrationTable ? 'present' : 'absent'}.`);
    if (tables.length > 0) console.log(`Existing tables: ${tables.map((row) => row.tablename).join(', ')}`);

    if (mode === 'migrate') {
      if (tables.length > 0 && !migrationTable) {
        throw new Error('Cloud already has public tables but no Drizzle migration history. Reconcile schema before migrating.');
      }
      await migrate(db, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
      const verifiedTables = await client<{ tablename: string; rowsecurity: boolean }[]>`
        select tablename, rowsecurity from pg_catalog.pg_tables
        where schemaname = 'public' order by tablename
      `;
      const unprotected = verifiedTables.filter((table) => !table.rowsecurity).map((table) => table.tablename);
      if (verifiedTables.length < 46 || unprotected.length > 0) {
        throw new Error(`Migration verification failed: public tables=${verifiedTables.length}; RLS disabled=${unprotected.join(', ') || 'none'}.`);
      }
      console.log(`Drizzle migrations applied to Supabase project ${projectRef}; ${verifiedTables.length} public tables, all with RLS.`);
    }
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Cloud database operation failed.');
  process.exitCode = 1;
});
