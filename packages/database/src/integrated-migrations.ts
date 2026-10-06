import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type postgres from 'postgres';

/** Preserve the two published IRT fork hashes while recovering skipped Core Learning DDL. */
export async function migrateIntegratedDatabase(
  client: ReturnType<typeof postgres>,
  migrationsFolder: string,
) {
  const migrations = readMigrationFiles({ migrationsFolder });
  const [existing] = await client<{ history: string | null }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations')::text AS history`;
  if (existing?.history) {
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout = '5s'");
      await tx.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE');
      const history = await tx<{ hash: string; created_at: string }[]>`
        SELECT hash, created_at::text FROM drizzle.__drizzle_migrations`;
      const hashes = new Set(history.map((row) => row.hash));
      const cursor = Math.max(0, ...history.map((row) => Number(row.created_at)));
      // The audited Staging bridge retains alternate 0000-0002 history. 0003 is shared.
      const skipped = migrations
        .slice(4)
        .filter((entry) => entry.folderMillis <= cursor && !hashes.has(entry.hash));
      if (!skipped.length) return;
      const irtHashes = await Promise.all(
        ['0004_flimsy_korg', '0005_irt_metadata_cursor_recovery'].map(async (tag) =>
          createHash('sha256')
            .update(
              await readFile(
                resolve(migrationsFolder, '..', 'staging', 'fixtures', 'irt-branch', `${tag}.sql`),
              ),
            )
            .digest('hex'),
        ),
      );
      if (
        !hashes.has(migrations[3]!.hash) ||
        !irtHashes.some((hash) => hashes.has(hash)) ||
        skipped.some((entry) => entry.folderMillis > migrations[8]!.folderMillis)
      ) {
        throw new Error(
          'Migration history would skip unapplied migrations. Reconcile the database before migrating.',
        );
      }
      // Only the known IRT fork may replay the unchanged Core Learning migrations.
      // DDL, backfill and history inserts all roll back if the schema is inconsistent.
      for (const entry of skipped) {
        for (const statement of entry.sql) {
          if (statement.trim()) await tx.unsafe(statement);
        }
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${entry.hash}, ${entry.folderMillis})`;
      }
    });
  }
  await migrate(drizzle(client), { migrationsFolder });
}
