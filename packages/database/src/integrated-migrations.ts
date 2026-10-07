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
    const branchRecovered = await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout = '5s'");
      await tx.unsafe('LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE');
      const history = await tx<{ hash: string; created_at: string }[]>`
        SELECT hash, created_at::text FROM drizzle.__drizzle_migrations`;
      const hashes = new Set(history.map((row) => row.hash));
      const cursor = Math.max(0, ...history.map((row) => Number(row.created_at)));
      const moved = migrations.filter(
        (entry) => hashes.has(entry.hash) && entry.folderMillis > cursor,
      );
      if (
        moved.length &&
        migrations
          .slice(3)
          .filter((entry) => entry.folderMillis <= moved.at(-1)!.folderMillis)
          .every((entry) => hashes.has(entry.hash))
      ) {
        // An exact applied hash with an earlier branch cursor must never replay its DDL.
        // Only a complete canonical prefix can advance the cursor; retain original rows.
        for (const entry of moved)
          await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)
            VALUES(${entry.hash},${entry.folderMillis})`;
        return;
      }
      // Published Excel branch DDL is archived unchanged; canonical main remains intact.
      const forkFolder = resolve(
        migrationsFolder,
        '..',
        'staging',
        'fixtures',
        'excel-import-branch',
      );
      const fork = readMigrationFiles({ migrationsFolder: forkFolder });
      // The generated notification file initially also had Windows line endings.
      const notificationSql = await readFile(
        resolve(forkFolder, '0022_amusing_quasar.sql'),
        'utf8',
      );
      const notificationLf = notificationSql.replaceAll('\r\n', '\n');
      const notificationHashes = [notificationLf, notificationLf.replaceAll('\n', '\r\n')].map(
        (sql) => createHash('sha256').update(sql).digest('hex'),
      );
      const canonicalHashes = new Set(migrations.map((entry) => entry.hash));
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
      const branchHashes = new Set([
        ...fork.map((entry) => entry.hash),
        ...notificationHashes,
        ...irtHashes,
      ]);
      const excelFork =
        (notificationHashes.some((hash) => hashes.has(hash)) ||
          history.some(
            (row) =>
              row.hash === fork[3]!.hash &&
              Number(row.created_at) !==
                migrations.find((entry) => entry.hash === row.hash)?.folderMillis,
          )) &&
        migrations.slice(3, 18).every((entry) => hashes.has(entry.hash)) &&
        history
          .filter((row) => Number(row.created_at) >= migrations[3]!.folderMillis)
          .every((row) => canonicalHashes.has(row.hash) || branchHashes.has(row.hash));
      if (excelFork) {
        // A later branch cursor must not skip main's rewards/data migrations. Apply only
        // absent hashes, in canonical order, preserving every original history row.
        for (const [index, entry] of migrations.entries()) {
          if (index < 4) continue;
          if (hashes.has(entry.hash)) {
            // A published branch hash can move after newer main migrations. Record
            // its canonical cursor without replaying DDL or rewriting old history.
            if (
              !history.some(
                (row) => row.hash === entry.hash && Number(row.created_at) === entry.folderMillis,
              )
            )
              await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)
                VALUES(${entry.hash},${entry.folderMillis})`;
            continue;
          }
          if (index === 27) {
            // Tables/data are identical; main additionally revokes service_role access.
            const revoke = entry.sql.find((statement) => statement.includes("'service_role'"));
            if (!revoke) throw new Error('Canonical notification permission statement missing.');
            await tx.unsafe(revoke);
          } else {
            for (const statement of entry.sql) if (statement.trim()) await tx.unsafe(statement);
          }
          await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)
            VALUES(${entry.hash},${entry.folderMillis})`;
        }
        return true;
      }
      // The audited Staging bridge retains alternate 0000-0002 history. 0003 is shared.
      const skipped = migrations
        .slice(4)
        .filter((entry) => entry.folderMillis <= cursor && !hashes.has(entry.hash));
      if (!skipped.length) return;
      const irtFork =
        hashes.has(migrations[3]!.hash) &&
        irtHashes.some((hash) => hashes.has(hash)) &&
        skipped.every((entry) => entry.folderMillis <= migrations[8]!.folderMillis);
      if (!irtFork) {
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
    if (branchRecovered) return;
  }
  await migrate(drizzle(client), { migrationsFolder });
}
