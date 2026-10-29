import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { runtimeAdminCandidate } from './runtime-admin-candidate.js';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PR92/PR102 joint migration rehearsal',
  { timeout: 120000 },
  () => {
    async function fixture(
      run: (db: ReturnType<typeof postgres>, folder: string, base: string) => Promise<void>,
    ) {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Local test database required');
      const name = 'numora_reconcile_' + randomBytes(6).toString('hex');
      const admin = postgres(url.href, { max: 1, onnotice: () => {} });
      url.pathname = '/' + name;
      const db = postgres(url.href, { max: 1, onnotice: () => {} });
      const temp = await mkdtemp(join(tmpdir(), 'numora-runtime-admin-'));
      const folder = join(temp, 'drizzle'),
        base = join(temp, 'baseline');
      try {
        await admin.unsafe(`CREATE DATABASE "${name}"`);
        await cp(resolve('staging/fixtures'), join(temp, 'staging/fixtures'), { recursive: true });
        const entries = await runtimeAdminCandidate(folder);
        expect(entries).toHaveLength(50);
        entries.forEach((e, i) => {
          expect(e.idx).toBe(i);
          expect(e.tag.slice(0, 4)).toBe(String(i).padStart(4, '0'));
          if (i) expect(e.when).toBeGreaterThan(entries[i - 1]!.when);
        });
        const journal = JSON.parse(await readFile(resolve('drizzle/meta/_journal.json'), 'utf8'));
        await mkdir(join(base, 'meta'), { recursive: true });
        await writeFile(
          join(base, 'meta/_journal.json'),
          JSON.stringify({ ...journal, entries: journal.entries.slice(0, 39) }),
        );
        for (const e of journal.entries.slice(0, 39))
          await cp(resolve('drizzle', e.tag + '.sql'), join(base, e.tag + '.sql'));
        await run(db, folder, base);
      } finally {
        await db.end();
        if (!/^numora_reconcile_[0-9a-f]{12}$/.test(name))
          throw new Error('Cleanup database ownership mismatch');
        await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
        if (!resolve(temp).startsWith(resolve(tmpdir(), 'numora-runtime-admin-')))
          throw new Error('Cleanup directory ownership mismatch');
        await rm(temp, { recursive: true, force: true });
      }
    }

    for (const baseline of ['fresh', 'runtime', 'admin'] as const) {
      it(`upgrades ${baseline} history, preserves published SQL/history and leaves the decimal guard last`, async () =>
        fixture(async (db, folder, base) => {
          if (baseline === 'runtime') await migrateIntegratedDatabase(db, resolve('drizzle'));
          if (baseline === 'admin') {
            await migrate(drizzle(db), { migrationsFolder: base });
            await migrate(drizzle(db), {
              migrationsFolder: resolve('staging/fixtures/admin-pr92'),
            });
          }
          const before =
            baseline === 'fresh'
              ? []
              : await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
          await migrateIntegratedDatabase(db, folder);
          const after =
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
          expect(after.slice(0, before.length)).toEqual([...before]);
          const [guard] =
            await db`SELECT pg_get_functiondef('public.drill_reward_guard()'::regprocedure) AS body`;
          expect(guard!.body).toContain('round(equivalent*10,6)');
          expect(guard!.body).not.toContain('ceil(equivalent*10)');
          const [type] =
            await db`SELECT numeric_scale FROM information_schema.columns WHERE table_name='xp_ledger' AND column_name='base_xp'`;
          expect(type!.numeric_scale).toBe(6);
          const source = readMigrationFiles({ migrationsFolder: resolve('drizzle') });
          const candidate = readMigrationFiles({ migrationsFolder: folder });
          expect(candidate[48]!.hash).toBe(source[39]!.hash);
          expect(candidate[49]!.hash).toBe(source[40]!.hash);
          await migrateIntegratedDatabase(db, folder);
          expect(
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
          ).toEqual(after);
        }));
    }

    it('rejects unknown runtime history without applying Admin DDL or changing history', async () =>
      fixture(async (db, folder) => {
        await migrateIntegratedDatabase(db, resolve('drizzle'));
        await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('unknown-test-only',1791324846967)`;
        const before =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await expect(migrateIntegratedDatabase(db, folder)).rejects.toThrow(
          'Unknown runtime/Admin history',
        );
        expect(
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(before);
        expect(
          (await db`SELECT to_regclass('public.admin_invitations') AS name`)[0]!.name,
        ).toBeNull();
      }));

    it('rejects a partial Admin fork without completing unreviewed DDL', async () =>
      fixture(async (db, folder) => {
        await migrateIntegratedDatabase(db, resolve('drizzle'));
        const first = readMigrationFiles({
          migrationsFolder: resolve('staging/fixtures/admin-pr92'),
        })[0]!;
        for (const statement of first.sql) if (statement.trim()) await db.unsafe(statement);
        await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${first.hash},${first.folderMillis})`;
        const before =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await expect(migrateIntegratedDatabase(db, folder)).rejects.toThrow('Partial Admin fork');
        expect(
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(before);
        expect(
          (await db`SELECT to_regclass('public.admin_recovery_operations') AS name`)[0]!.name,
        ).toBeNull();
      }));

    it('rolls back Admin DDL/history when a known runtime schema has drifted', async () =>
      fixture(async (db, folder) => {
        await migrateIntegratedDatabase(db, resolve('drizzle'));
        await db`CREATE TABLE public.admin_recovery_operations(test_only boolean)`;
        const before =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await expect(migrateIntegratedDatabase(db, folder)).rejects.toThrow();
        expect(
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(before);
        expect(
          (await db`SELECT to_regclass('public.admin_invitations') AS name`)[0]!.name,
        ).toBeNull();
      }));
  },
);
