import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('Drill distribution migration after merged IRT migrations', () => {
  it('applies the lock on fresh installs and upgrades without rewriting existing history', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Isolated local test PostgreSQL required');
    const database = `numora_test_drill_upgrade_${randomUUID().replaceAll('-', '')}`;
    const folder = await mkdtemp(join(tmpdir(), 'numora-test-drill-upgrade-'));
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = '/' + database;
    const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      const journal = JSON.parse(await readFile(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
        entries: { idx: number; tag: string; when: number }[];
      };
      const entries = journal.entries.filter((entry) => entry.idx < 65);
      expect(entries.at(-1)?.tag).toBe('0064_irt_adoption_evidence_validation');
      expect(journal.entries[65]?.tag).toBe('0065_drill_ab_distribution_lock');
      expect(journal.entries[65]!.when).toBeGreaterThan(entries.at(-1)!.when);
      await mkdir(join(folder, 'meta'));
      await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      for (const entry of entries)
        await copyFile(resolve('drizzle', entry.tag + '.sql'), join(folder, entry.tag + '.sql'));
      await migrate(drizzle(client), { migrationsFolder: folder });
      const history =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      const [student] = await client`INSERT INTO users(auth_user_id,role,display_name,email)
        VALUES(${randomUUID()},'STUDENT','TEST ONLY','upgrade@example.test') RETURNING id`;
      const trigger = () => client`SELECT tgname FROM pg_trigger
        WHERE tgrelid='public.assessment_arm_distribution_events'::regclass
        AND tgname='assessment_v2_drill_distribution_lock' AND NOT tgisinternal`;
      expect(await trigger()).toHaveLength(0);
      await migrate(drizzle(client), { migrationsFolder: resolve('drizzle') });
      expect(await trigger()).toHaveLength(1);
      const upgraded =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      expect(upgraded.slice(0, history.length)).toEqual(history);
      expect(upgraded).toHaveLength(journal.entries.length);
      expect(await client`SELECT id FROM users WHERE id=${student!.id}`).toHaveLength(1);
      await migrate(drizzle(client), { migrationsFolder: resolve('drizzle') });
      expect(
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
      ).toEqual(upgraded);
      // The second database has no migration cursor or pre-existing objects.
      await client.end();
      await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      const fresh = postgres(url.toString(), { max: 1, onnotice: () => {} });
      try {
        await migrate(drizzle(fresh), { migrationsFolder: resolve('drizzle') });
        expect(
          await fresh`SELECT tgname FROM pg_trigger
          WHERE tgrelid='public.assessment_arm_distribution_events'::regclass
          AND tgname='assessment_v2_drill_distribution_lock' AND NOT tgisinternal`,
        ).toHaveLength(1);
        expect(await fresh`SELECT id FROM drizzle.__drizzle_migrations`).toHaveLength(
          journal.entries.length,
        );
      } finally {
        await fresh.end();
      }
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
      await rm(folder, { recursive: true, force: true });
    }
  }, 120_000);
});
