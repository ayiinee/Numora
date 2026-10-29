/** Rehearsal only: copy the canonical chain without reinterpreting published source SQL. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export async function runtimeAdminCandidate(target: string) {
  const main = resolve('drizzle');
  const journal = JSON.parse(await readFile(join(main, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const canonical = readMigrationFiles({ migrationsFolder: main });
  const runtime = readMigrationFiles({ migrationsFolder: resolve('staging/fixtures/runtime-pr102') });
  const admin = readMigrationFiles({ migrationsFolder: resolve('staging/fixtures/admin-pr92') });
  if (
    journal.entries[48]?.tag !== '0048_tryout_partial_reward_guard' ||
    journal.entries[49]?.tag !== '0049_pvp_transient_queue_guard' ||
    canonical[49]?.hash !== runtime[0]?.hash ||
    !admin.every((entry, i) => canonical[39 + i]?.hash === entry.hash)
  )
    throw new Error(
      'Unexpected canonical chain; review source provenance before rehearsal.',
    );
  await mkdir(join(target, 'meta'), { recursive: true });
  for (const entry of journal.entries)
    await copyFile(join(main, `${entry.tag}.sql`), join(target, `${entry.tag}.sql`));
  await writeFile(join(target, 'meta/_journal.json'), JSON.stringify(journal));
  return journal.entries;
}
