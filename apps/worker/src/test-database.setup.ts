import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDatabaseConnection, getDatabase } from '@tka/database';

// Projection and outbox jobs intentionally operate across the whole database.
// Each file needs its own migrated database, even when Vitest runs files in parallel.
const baseUrl = process.env.TEST_DATABASE_URL;
if (baseUrl) {
  const isolatedUrl = new URL(baseUrl);
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(isolatedUrl.hostname))
    throw new Error('Worker integration tests require a local test database.');
  const name = `numora_test_worker_${randomBytes(6).toString('hex')}`;
  isolatedUrl.pathname = `/${name}`;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.TEST_DATABASE_URL = isolatedUrl.toString();
  let created = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = baseUrl;
    await getDatabase().client.unsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await closeDatabaseConnection();
    process.env.DATABASE_URL = isolatedUrl.toString();
    await migrate(getDatabase().db, {
      migrationsFolder: resolve(process.cwd(), '../../packages/database/drizzle'),
    });
  }, 120_000);

  afterAll(async () => {
    await closeDatabaseConnection();
    try {
      if (created) {
        process.env.DATABASE_URL = baseUrl;
        await getDatabase().client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
    } finally {
      await closeDatabaseConnection();
      process.env.TEST_DATABASE_URL = baseUrl;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }, 60_000);
}
