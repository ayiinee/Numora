import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { describe, expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'Audited mixed Development history adoption (TEST ONLY)',
  { timeout: 120000 },
  () => {
    async function fixture(run: (db: ReturnType<typeof postgres>) => Promise<void>) {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
        throw Error('Local test database required');
      const name = `numora_dev_bridge_${randomBytes(6).toString('hex')}`;
      const admin = postgres(url.href, { max: 1, onnotice: () => {} });
      url.pathname = '/' + name;
      const db = postgres(url.href, { max: 1, onnotice: () => {} });
      const temp = await mkdtemp(join(tmpdir(), 'numora-dev-bridge-'));
      try {
        await admin.unsafe(`CREATE DATABASE "${name}"`);
        const journal = JSON.parse(await readFile(resolve('drizzle/meta/_journal.json'), 'utf8'));
        await mkdir(join(temp, 'meta'));
        await writeFile(
          join(temp, 'meta/_journal.json'),
          JSON.stringify({ ...journal, entries: journal.entries.slice(0, 48) }),
        );
        for (const entry of journal.entries.slice(0, 48))
          await copyFile(resolve('drizzle', entry.tag + '.sql'), join(temp, entry.tag + '.sql'));
        await migrate(drizzle(db), { migrationsFolder: temp });
        const runtime = await readFile(
          resolve('staging/fixtures/runtime-pr102/0040_tryout_reward_decimal_guard.sql'),
          'utf8',
        );
        for (const statement of runtime.split('--> statement-breakpoint'))
          if (statement.trim()) await db.unsafe(statement);
        await db.unsafe(`CREATE FUNCTION public.guard_pvp_transient_cancellation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN IF OLD.status IN ('WAITING','READY','RUNNING') AND NEW.status='CANCELLED' AND NEW.end_reason='SERVICE_INTERRUPTED' THEN RETURN OLD; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER pvp_transient_cancellation_guard BEFORE UPDATE OF status ON public.pvp_matches FOR EACH ROW EXECUTE FUNCTION public.guard_pvp_transient_cancellation()`);
        const manifest = JSON.parse(
          await readFile(resolve('staging/fixtures/development-20261029/provenance.json'), 'utf8'),
        ) as { history: { hash: string; created_at: string }[] };
        // TEST ONLY: reproduce audited metadata on a new synthetic schema, never a shared DB.
        await db`DELETE FROM drizzle.__drizzle_migrations`;
        for (const row of manifest.history)
          await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${row.hash},${row.created_at})`;
        await run(db);
      } finally {
        await db.end();
        if (!/^numora_dev_bridge_[0-9a-f]{12}$/.test(name))
          throw Error('Database ownership mismatch');
        await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
        await admin.end();
        if (!resolve(temp).startsWith(resolve(tmpdir(), 'numora-dev-bridge-')))
          throw Error('Directory ownership mismatch');
        await rm(temp, { recursive: true, force: true });
      }
    }
    it('adopts exact metadata, repairs both functions without recreating the trigger and replays unchanged', async () =>
      fixture(async (db) => {
        const before =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        const [trigger] =
          await db`SELECT oid FROM pg_trigger WHERE tgrelid='public.pvp_matches'::regclass AND tgname='pvp_transient_cancellation_guard'`;
        await migrateIntegratedDatabase(db, resolve('drizzle'));
        const after =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        expect(after.slice(0, before.length)).toEqual([...before]);
        expect(
          (
            await db`SELECT oid FROM pg_trigger WHERE tgrelid='public.pvp_matches'::regclass AND tgname='pvp_transient_cancellation_guard'`
          )[0],
        ).toEqual(trigger);
        const functions = await db<
          { proname: string; prosrc: string }[]
        >`SELECT proname,prosrc FROM pg_proc WHERE oid IN ('public.drill_reward_guard()'::regprocedure,'public.guard_pvp_transient_cancellation()'::regprocedure)`;
        expect(functions.find((r) => r.proname === 'drill_reward_guard')!.prosrc).toContain(
          'TRYOUT_PGK_PARTIAL_V1',
        );
        expect(
          functions.find((r) => r.proname === 'guard_pvp_transient_cancellation')!.prosrc,
        ).toContain('RAISE EXCEPTION');
        await migrateIntegratedDatabase(db, resolve('drizzle'));
        expect(
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(after);
      }));
    for (const mode of [
      'unknown-history',
      'schema-drift',
      'function-drift',
      'trigger-drift',
      'xp-trigger-drift',
      'partial-adoption',
    ] as const)
      it(`rejects ${mode} before changing history or reward function`, async () =>
        fixture(async (db) => {
          if (mode === 'unknown-history')
            await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('unknown-test-only',1793299999999)`;
          if (mode === 'partial-adoption') {
            const manifest = JSON.parse(
              await readFile(
                resolve('staging/fixtures/development-20261029/provenance.json'),
                'utf8',
              ),
            );
            const journal = JSON.parse(
              await readFile(resolve('drizzle/meta/_journal.json'), 'utf8'),
            );
            await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${manifest.canonicalHashes[48]},${journal.entries[48].when})`;
          }
          if (mode === 'schema-drift')
            await db`ALTER TABLE generator_packages ADD COLUMN unexpected_test_only integer`;
          if (mode === 'function-drift')
            await db.unsafe(
              `CREATE OR REPLACE FUNCTION public.drill_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`,
            );
          if (mode === 'trigger-drift')
            await db`ALTER TABLE pvp_matches DISABLE TRIGGER pvp_transient_cancellation_guard`;
          if (mode === 'xp-trigger-drift')
            await db`ALTER TABLE xp_ledger DISABLE TRIGGER drill_reward_immutable`;
          const before =
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
          const functions =
            await db`SELECT oid,prosrc FROM pg_proc WHERE oid IN ('public.drill_reward_guard()'::regprocedure,'public.guard_pvp_transient_cancellation()'::regprocedure) ORDER BY oid`;
          await expect(migrateIntegratedDatabase(db, resolve('drizzle'))).rejects.toThrow();
          expect(
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
          ).toEqual(before);
          expect(
            await db`SELECT oid,prosrc FROM pg_proc WHERE oid IN ('public.drill_reward_guard()'::regprocedure,'public.guard_pvp_transient_cancellation()'::regprocedure) ORDER BY oid`,
          ).toEqual(functions);
        }));
  },
);
