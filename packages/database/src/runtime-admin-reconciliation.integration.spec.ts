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
  'Canonical Admin/runtime migration and historical policy rehearsal',
  { timeout: 120000 },
  () => {
    async function fixture(
      run: (
        db: ReturnType<typeof postgres>,
        folder: string,
        base: string,
        runtime: string,
      ) => Promise<void>,
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
      const runtime = join(temp, 'runtime');
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
        await cp(base, runtime, { recursive: true });
        const archived = resolve('staging/fixtures/runtime-pr102');
        const old = JSON.parse(await readFile(join(archived, 'meta/_journal.json'), 'utf8'));
        for (const e of old.entries)
          await cp(join(archived, e.tag + '.sql'), join(runtime, e.tag + '.sql'));
        await writeFile(
          join(runtime, 'meta/_journal.json'),
          JSON.stringify({
            ...journal,
            entries: [...journal.entries.slice(0, 39), ...old.entries],
          }),
        );
        await run(db, folder, base, runtime);
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

    async function historicalReward(db: ReturnType<typeof postgres>) {
      const [student] =
        await db`INSERT INTO users(auth_user_id,role,display_name,email) VALUES(gen_random_uuid(),'STUDENT','TEST ONLY migration history',gen_random_uuid()::text||'@example.test') RETURNING id`;
      const [pack] =
        await db`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo) VALUES(gen_random_uuid()::text,1,'TEST ONLY legacy reward','TRYOUT',true) RETURNING id`;
      const [family] = await db`INSERT INTO questions(usage_type) VALUES('TRYOUT') RETURNING id`;
      const [variant] =
        await db`INSERT INTO question_variants(question_id,variant_code,kind,origin) VALUES(${family!.id},gen_random_uuid()::text,'ORIGINAL','TEST') RETURNING id`;
      const [rubric] =
        await db`INSERT INTO scoring_rubric_versions(code,version,question_type,maximum_score_category,definition,digest) VALUES(gen_random_uuid()::text,1,'CATEGORY',4,'{"testOnly":true}','TEST ONLY') RETURNING id`;
      const [version] =
        await db`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,scoring_rubric_version_id) VALUES(${variant!.id},1,'CATEGORY','{"text":"TEST ONLY"}','[]','{}','{"text":"TEST ONLY"}',${rubric!.id}) RETURNING id`;
      const [item] =
        await db`INSERT INTO package_items(package_id,question_version_id,display_order,max_points) VALUES(${pack!.id},${version!.id},1,3) RETURNING id`;
      const [attempt] =
        await db`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_xp_policy_version) VALUES(${student!.id},${pack!.id},'TRYOUT',1) RETURNING id`;
      const [pin] =
        await db`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) VALUES(${attempt!.id},${pack!.id},${item!.id},${version!.id},1,3) RETURNING id`;
      await db`INSERT INTO attempt_answers(attempt_item_id,answer,awarded_points,graded_at,score_category,fully_correct,response_state) VALUES(${pin!.id},'{"categoryByStatementId":{}}',0.75,now(),1,false,'RESPONDED')`;
      await db`UPDATE assessment_attempts SET status='GRADED',finished_at=now(),raw_points=0.75,score_0_100=25 WHERE id=${attempt!.id}`;
      await db`INSERT INTO xp_ledger(student_id,source_type,attempt_id,xp_amount,policy_code,policy_version,base_xp,bonus_xp,occurred_at) SELECT student_id,'TRYOUT',id,2.5,'TRYOUT_PRD_V06',1,2.5,0,finished_at FROM assessment_attempts WHERE id=${attempt!.id}`;
      return {
        id: attempt!.id,
        ledger: await db`SELECT * FROM xp_ledger WHERE attempt_id=${attempt!.id}`,
        attempt: await db`SELECT * FROM assessment_attempts WHERE id=${attempt!.id}`,
        answers: await db`SELECT * FROM attempt_answers WHERE attempt_item_id=${pin!.id}`,
        itemId: pin!.id,
      };
    }

    for (const baseline of ['fresh', 'runtime', 'admin', 'main', 'main-runtime'] as const) {
      it(`upgrades ${baseline} history, preserving SQL/history and the policy-specific guard`, async () =>
        fixture(async (db, folder, base, runtime) => {
          if (baseline === 'runtime') await migrate(drizzle(db), { migrationsFolder: runtime });
          if (baseline === 'admin') {
            await migrate(drizzle(db), { migrationsFolder: base });
            await migrate(drizzle(db), {
              migrationsFolder: resolve('staging/fixtures/admin-pr92'),
            });
          }
          if (baseline === 'main' || baseline === 'main-runtime') {
            const accepted = join(base, '..', 'accepted-main');
            await cp(folder, accepted, { recursive: true });
            const journal = JSON.parse(
              await readFile(join(accepted, 'meta/_journal.json'), 'utf8'),
            );
            await writeFile(
              join(accepted, 'meta/_journal.json'),
              JSON.stringify({ ...journal, entries: journal.entries.slice(0, 49) }),
            );
            await migrateIntegratedDatabase(db, accepted);
            if (baseline === 'main-runtime')
              for (const entry of readMigrationFiles({
                migrationsFolder: resolve('staging/fixtures/runtime-pr102'),
              })) {
                for (const statement of entry.sql) if (statement.trim()) await db.unsafe(statement);
                await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
              }
          }
          const preserved =
            baseline === 'runtime' || baseline === 'main-runtime'
              ? await historicalReward(db)
              : null;
          const before =
            baseline === 'fresh'
              ? []
              : await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
          await migrateIntegratedDatabase(db, folder);
          if (preserved) {
            expect(await db`SELECT * FROM xp_ledger WHERE attempt_id=${preserved.id}`).toEqual(
              preserved.ledger,
            );
            expect(await db`SELECT * FROM assessment_attempts WHERE id=${preserved.id}`).toEqual(
              preserved.attempt,
            );
            expect(
              await db`SELECT * FROM attempt_answers WHERE attempt_item_id=${preserved.itemId}`,
            ).toEqual(preserved.answers);
          }
          const after =
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
          expect(after.slice(0, before.length)).toEqual([...before]);
          const [guard] =
            await db`SELECT pg_get_functiondef('public.drill_reward_guard()'::regprocedure) AS body`;
          expect(guard!.body).toContain('TRYOUT_PGK_PARTIAL_V1');
          expect(guard!.body).toContain('round(sum(aa.awarded_points / ai.max_points)*10, 6)');
          expect(guard!.body).toContain('ceil(sum(');
          const [type] =
            await db`SELECT numeric_scale FROM information_schema.columns WHERE table_name='xp_ledger' AND column_name='base_xp'`;
          expect(type!.numeric_scale).toBe(6);
          const source = readMigrationFiles({
            migrationsFolder: resolve('staging/fixtures/runtime-pr102'),
          });
          const candidate = readMigrationFiles({ migrationsFolder: folder });
          expect(candidate[49]!.hash).toBe(source[0]!.hash);
          expect(candidate.some((entry) => entry.hash === source[1]!.hash)).toBe(false);
          await migrateIntegratedDatabase(db, folder);
          expect(
            await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
          ).toEqual(after);
        }));
    }

    it('rejects unknown runtime history without applying Admin DDL or changing history', async () =>
      fixture(async (db, folder, _base, runtime) => {
        await migrate(drizzle(db), { migrationsFolder: runtime });
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
      fixture(async (db, folder, _base, runtime) => {
        await migrate(drizzle(db), { migrationsFolder: runtime });
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
      fixture(async (db, folder, _base, runtime) => {
        await migrate(drizzle(db), { migrationsFolder: runtime });
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

    it('rejects an incomplete runtime prefix without changing history or applying Admin DDL', async () =>
      fixture(async (db, folder, base) => {
        await migrate(drizzle(db), { migrationsFolder: base });
        const entry = readMigrationFiles({
          migrationsFolder: resolve('staging/fixtures/runtime-pr102'),
        })[0]!;
        for (const statement of entry.sql) if (statement.trim()) await db.unsafe(statement);
        await db`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
        const before =
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await expect(migrateIntegratedDatabase(db, folder)).rejects.toThrow('Partial runtime fork');
        expect(
          await db`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(before);
        expect(
          (await db`SELECT to_regclass('public.admin_invitations') AS name`)[0]!.name,
        ).toBeNull();
      }));
  },
);
