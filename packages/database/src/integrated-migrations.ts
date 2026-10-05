import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type postgres from 'postgres';

/** Preserve published fork hashes while recovering only their known skipped DDL. */
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
      // The generated local file could have Windows line endings before Git enforced LF.
      const notificationSql = await readFile(
        resolve(migrationsFolder, '0022_amusing_quasar.sql'),
        'utf8',
      );
      const notificationLf = notificationSql.replaceAll('\r\n', '\n');
      if (
        [notificationLf, notificationLf.replaceAll('\n', '\r\n')].some((sql) =>
          hashes.has(createHash('sha256').update(sql).digest('hex')),
        )
      )
        hashes.add(migrations[22]!.hash);
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
      const irtFork =
        hashes.has(migrations[3]!.hash) &&
        irtHashes.some((hash) => hashes.has(hash)) &&
        skipped.every((entry) => entry.folderMillis <= migrations[8]!.folderMillis);
      // Local 0018 notifications became 0022; its SQL hash and original cursor are unchanged.
      const notificationFork =
        hashes.has(migrations[22]!.hash) &&
        cursor === migrations[22]!.folderMillis &&
        migrations.slice(0, 18).every((entry) => hashes.has(entry.hash)) &&
        skipped.every((entry) =>
          migrations.slice(18, 22).some((remote) => remote.hash === entry.hash),
        );
      // Incoming main had already applied lockdown/import (formerly 0022/0023),
      // while the UI branch independently added notifications at the same number.
      // The audited bridge also keeps alternate 0000–0002; 0003 onward is shared.
      const contentFork =
        migrations.slice(3, 22).every((entry) => hashes.has(entry.hash)) &&
        [23, 24].some(
          (index) =>
            cursor === migrations[index]!.folderMillis &&
            migrations.slice(23, index + 1).every((entry) => hashes.has(entry.hash)),
        ) &&
        skipped.length === 1 &&
        skipped[0]!.hash === migrations[22]!.hash;
      if (!irtFork && !notificationFork && !contentFork) {
        throw new Error(
          'Migration history would skip unapplied migrations. Reconcile the database before migrating.',
        );
      }
      // Only the known forks may replay their unchanged, skipped migrations.
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
