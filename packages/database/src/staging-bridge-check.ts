import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function run() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
  const target = new URL(testUrl);
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(target.hostname))
    throw new Error('Only an isolated local test database is permitted.');
  const name = `numora_staging_bridge_${randomBytes(4).toString('hex')}`;
  const freshName = `numora_staging_fresh_${randomBytes(4).toString('hex')}`;
  const url = new URL(testUrl);
  url.pathname = `/${name}`;
  const admin = postgres(testUrl, { max: 1 });
  const folder = await mkdtemp(join(tmpdir(), 'numora-staging-baseline-'));
  let client: ReturnType<typeof postgres> | undefined;
  let fresh: ReturnType<typeof postgres> | undefined;
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await admin.unsafe(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
      );
    }
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    client = postgres(url.toString(), { max: 1 });
    const databaseRoot = process.cwd();
    const fixture = resolve(databaseRoot, 'staging', 'fixtures');
    await mkdir(join(folder, 'meta'));
    await copyFile(
      resolve(databaseRoot, 'drizzle', '0000_outgoing_thunderbolts.sql'),
      join(folder, '0000_outgoing_thunderbolts.sql'),
    );
    for (const file of ['0001_lucky_triton.sql', '0002_lock_down_numora_data_api.sql']) {
      await copyFile(join(fixture, file), join(folder, file));
    }
    await copyFile(join(fixture, 'meta', '_journal.json'), join(folder, 'meta', '_journal.json'));
    await migrate(drizzle(client), { migrationsFolder: folder });

    const env = { ...process.env, NODE_ENV: 'test', DATABASE_MIGRATION_URL: url.toString() };
    for (const mode of ['check', 'apply']) {
      execFileSync(process.execPath, ['--import', 'tsx', 'src/staging-bridge.ts', mode], {
        cwd: databaseRoot,
        env,
        stdio: 'inherit',
      });
    }
    const migrationsFolder = resolve(databaseRoot, 'drizzle');
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    await migrate(drizzle(client), { migrationsFolder });
    await admin.unsafe(`CREATE DATABASE "${freshName}"`);
    url.pathname = `/${freshName}`;
    fresh = postgres(url.toString(), { max: 1 });
    await migrate(drizzle(fresh), { migrationsFolder });
    const tablesQuery = `SELECT schemaname, tablename, rowsecurity FROM pg_catalog.pg_tables
      WHERE schemaname IN ('public','irt_compute') ORDER BY schemaname, tablename`;
    const tables = await client.unsafe(tablesQuery);
    assert.deepEqual(tables, await fresh.unsafe(tablesQuery));
    assert.ok(tables.length > 0 && tables.every((table) => table.rowsecurity));
    const [state] = await client<
      { migrations: number }[]
    >`SELECT count(*)::int AS migrations FROM drizzle.__drizzle_migrations`;
    assert.equal(state?.migrations, journal.entries.length);
    const columnsQuery = `SELECT table_schema, table_name, column_name, udt_schema, udt_name, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema IN ('public','irt_compute')
      ORDER BY table_schema, table_name, column_name`;
    const indexesQuery = `SELECT schemaname, tablename, indexname, indexdef FROM pg_catalog.pg_indexes
      WHERE schemaname IN ('public','irt_compute') ORDER BY schemaname, tablename, indexname`;
    assert.deepEqual(await client.unsafe(columnsQuery), await fresh.unsafe(columnsQuery));
    assert.deepEqual(await client.unsafe(indexesQuery), await fresh.unsafe(indexesQuery));
    console.log('Audited Staging baseline bridged; normal migrator skipped duplicate DDL.');
  } finally {
    if (client) await client.end();
    if (fresh) await fresh.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.unsafe(`DROP DATABASE IF EXISTS "${freshName}" WITH (FORCE)`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
