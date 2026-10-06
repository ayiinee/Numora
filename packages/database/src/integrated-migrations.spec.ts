import { createHash, randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('integrated migration histories', { timeout: 120000 }, () => {
  async function fixture(
    baselineCount: number,
    run: (client: ReturnType<typeof postgres>, folder: string) => Promise<void>,
  ) {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('Only an isolated local test database is permitted.');
    const name = `numora_integrated_${randomBytes(6).toString('hex')}`;
    url.pathname = `/${name}`;
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const oldFolder = await mkdtemp(join(tmpdir(), 'numora-integration-baseline-'));
    const folder = resolve('drizzle');
    try {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
      const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8')) as {
        entries: { tag: string }[];
      };
      const entries = journal.entries.slice(0, baselineCount);
      await mkdir(join(oldFolder, 'meta'));
      await writeFile(
        join(oldFolder, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const entry of entries)
        await copyFile(join(folder, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
      await migrate(drizzle(client), { migrationsFolder: oldFolder });
      await run(client, folder);
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
      await rm(oldFolder, { recursive: true, force: true });
    }
  }

  it.each([4, 9])(
    'preserves IRT fork history and snapshots after baseline %i and repeat migration',
    async (baselineCount) => {
      await fixture(baselineCount, async (client, folder) => {
        const archive = resolve('staging/fixtures/irt-branch');
        await migrate(drizzle(client), { migrationsFolder: archive });
        const oldHistory =
          await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        const [batch] = await client`
        INSERT INTO irt_batches (batch_kind, model_version, status, input_snapshot, output_digest, failure_code)
        VALUES ('DAILY', 'TEST-frozen', 'FAILED', '{"fixture":"preserve"}', 'TEST-digest', 'TEST-failure') RETURNING *`;
        await migrateIntegratedDatabase(client, folder);
        const [schema] = await client<{ level: string | null; columns: number }[]>`
        SELECT (SELECT column_name FROM information_schema.columns
          WHERE table_name='assessment_attempts' AND column_name='level_id_at_start') AS level,
          (SELECT count(*)::int FROM information_schema.columns WHERE table_name='irt_batches'
            AND column_name IN ('input_snapshot', 'output_digest', 'failure_code')) AS columns`;
        expect(schema).toEqual({ level: 'level_id_at_start', columns: 3 });
        expect((await client`SELECT * FROM irt_batches WHERE id=${batch!.id}`)[0]).toMatchObject({
          ...batch,
          output_snapshot: null,
        });
        const history =
          await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        expect(history.slice(0, oldHistory.length)).toEqual(oldHistory);
        await migrateIntegratedDatabase(client, folder);
        expect(
          await client`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(history);
      });
    },
  );

  it('upgrades main through 0013, preserving generation IDs, recovery index, correlation and migration history', async () => {
    await fixture(14, async (client, folder) => {
      const oldHistory =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      const [config] =
        await client`INSERT INTO public.generator_configs(template_or_competency_id,config_version,parameters,curriculum_limits) VALUES('TEST-preserved',1,'{"seed":123}','{"fixture":true}') RETURNING *`;
      await migrateIntegratedDatabase(client, folder);
      expect(
        (await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`).slice(
          0,
          14,
        ),
      ).toEqual(oldHistory);
      expect(
        await client`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='assessment_attempts_tryout_recovery_idx'`,
      ).toHaveLength(1);
      expect(
        await client`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='correlation_id'`,
      ).toHaveLength(1);
      expect(
        (await client`SELECT * FROM irt_compute.generator_configs WHERE id=${config!.id}`)[0],
      ).toMatchObject(config!);
      expect(
        (await client`SELECT * FROM public.generator_configs WHERE id=${config!.id}`)[0],
      ).toMatchObject(config!);
    });
  });

  it('rejects an unrecognized cursor before changing schema or history', async () => {
    await fixture(4, async (client, folder) => {
      await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES ('TEST-unknown-history', 1790871930466)`;
      const history = await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
      await expect(migrateIntegratedDatabase(client, folder)).rejects.toThrow(
        'Reconcile the database',
      );
      expect(await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(history);
      expect(
        await client`SELECT column_name FROM information_schema.columns
        WHERE table_name='assessment_attempts' AND column_name='level_id_at_start'`,
      ).toHaveLength(0);
    });
  });

  it.each(['LF', 'CRLF'])(
    'upgrades the notification fork (%s) without skipping remote DDL or changing existing hashes/data',
    async (lineEnding) => {
      await fixture(18, async (client, folder) => {
        const forkFolder = resolve('staging/fixtures/excel-import-branch');
        const notification = readMigrationFiles({ migrationsFolder: forkFolder })[0]!;
        for (const statement of notification.sql)
          if (statement.trim()) await client.unsafe(statement);
        const sql = (
          await readFile(
            resolve('staging/fixtures/excel-import-branch/0022_amusing_quasar.sql'),
            'utf8',
          )
        ).replaceAll('\r\n', '\n');
        const hash = createHash('sha256')
          .update(lineEnding === 'CRLF' ? sql.replaceAll('\n', '\r\n') : sql)
          .digest('hex');
        await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at)
        VALUES(${hash},${notification.folderMillis})`;
        const [chapter] =
          await client`INSERT INTO chapters(code,name,display_order,material_category)
        VALUES('TEST-NOTIFICATION-FORK','Preserved chapter',1,'algebra') RETURNING id`;
        const history =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await migrateIntegratedDatabase(client, folder);
        expect(
          (
            await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`
          ).slice(0, history.length),
        ).toEqual(history);
        expect(
          (await client`SELECT material_category,slug FROM chapters WHERE id=${chapter!.id}`)[0],
        ).toEqual({ material_category: 'algebra', slug: 'preserved-chapter' });
        expect(
          (
            await client`SELECT to_regclass('public.analysis_request_dispatches') AS dispatch, to_regclass('public.content_media_uploads') AS media`
          )[0],
        ).toEqual({ dispatch: 'analysis_request_dispatches', media: 'content_media_uploads' });
        expect(await client`SELECT source_key FROM notification_outbox`).toEqual([
          { source_key: 'SYSTEM_STARTED' },
        ]);
        const upgraded =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await migrateIntegratedDatabase(client, folder);
        expect(
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(upgraded);
      });
    },
  );

  it.each([
    [23, false],
    [24, false],
    [24, true],
  ] as const)(
    'recovers notifications for content through %i (alternate bridge=%s) without rewriting history',
    async (last, alternateBridge) => {
      await fixture(22, async (client, folder) => {
        const migrations = readMigrationFiles({ migrationsFolder: folder });
        if (alternateBridge) {
          // TEST ONLY: the audited bridge retained different hashes for equivalent 0001/0002.
          for (const index of [1, 2])
            await client`UPDATE drizzle.__drizzle_migrations SET hash=${`TEST-bridge-${index}`} WHERE hash=${migrations[index]!.hash}`;
        }
        const fork = readMigrationFiles({
          migrationsFolder: resolve('staging/fixtures/excel-import-branch'),
        });
        for (const entry of fork.slice(1, last - 21)) {
          for (const statement of entry.sql) if (statement.trim()) await client.unsafe(statement);
          await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
        }
        const before =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await migrateIntegratedDatabase(client, folder);
        const after =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        expect(after.slice(0, before.length)).toEqual(before);
        expect(
          (
            await client`SELECT to_regclass('public.notification_outbox') AS notifications, to_regclass('public.content_imports') AS imports`
          )[0],
        ).toEqual({ notifications: 'notification_outbox', imports: 'content_imports' });
        await migrateIntegratedDatabase(client, folder);
        expect(
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(after);
      });
    },
  );

  it('upgrades the already-applied XP chain through data and notifications without rewriting legacy rewards', async () => {
    await fixture(26, async (client, folder) => {
      const [student] = await client`INSERT INTO users(auth_user_id,role,display_name,email)
        VALUES(gen_random_uuid(),'STUDENT','TEST upgrade','upgrade@test.invalid') RETURNING id`;
      const [chapter] =
        await client`INSERT INTO chapters(code,name,slug,display_order) VALUES('TEST-UPGRADE','TEST','test-upgrade',1) RETURNING id`;
      const [sub] =
        await client`INSERT INTO subchapters(chapter_id,code,name,slug,display_order) VALUES(${chapter!.id},'TEST-UPGRADE','TEST','test-upgrade',1) RETURNING id`;
      const [level] =
        await client`INSERT INTO levels(subchapter_id,level_number) VALUES(${sub!.id},1) RETURNING id`;
      const [pack] =
        await client`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo,chapter_id,level_id)
        VALUES('TEST-UPGRADE',1,'TEST upgrade','DRILL',true,${chapter!.id},${level!.id}) RETURNING id`;
      const [attempt] =
        await client`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,chapter_id_at_start,level_id_at_start,status,finished_at,score_0_100,raw_points,stars)
        VALUES(${student!.id},${pack!.id},'DRILL',${chapter!.id},${level!.id},'GRADED',clock_timestamp(),80,8,2) RETURNING *`;
      const [reward] =
        await client`INSERT INTO xp_ledger(student_id,attempt_id,source_type,xp_amount)
        VALUES(${student!.id},${attempt!.id},'DRILL',80) RETURNING *`;
      const oldHistory =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      await migrateIntegratedDatabase(client, folder);
      expect(
        (await client`SELECT * FROM assessment_attempts WHERE id=${attempt!.id}`)[0],
      ).toMatchObject(attempt!);
      const [preserved] = await client`SELECT * FROM xp_ledger WHERE id=${reward!.id}`;
      expect({ ...preserved, xp_amount: Number(preserved!.xp_amount) }).toEqual({
        ...reward,
        xp_amount: 80,
      });
      const history =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      expect(history.slice(0, oldHistory.length)).toEqual(oldHistory);
      const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8')) as {
        entries: unknown[];
      };
      expect(history).toHaveLength(journal.entries.length);
      await expect(
        client`UPDATE xp_ledger SET xp_amount=81 WHERE id=${reward!.id}`,
      ).rejects.toThrow();
      await migrateIntegratedDatabase(client, folder);
      expect(
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
      ).toEqual(history);
    });
  });

  it.each([
    [3, false],
    [4, false],
    [4, true],
  ] as const)(
    'upgrades the published Excel fork through %i entries (retained IRT history=%s) without replaying existing tables or purpose DDL',
    async (count, retainedIrt) => {
      await fixture(22, async (client, folder) => {
        if (retainedIrt) {
          // The shared schema already includes IRT DDL; preserve its original fork
          // history rows, as on the actual development database after recovery.
          const irt = readMigrationFiles({
            migrationsFolder: resolve('staging/fixtures/irt-branch'),
          });
          for (const entry of irt.slice(4))
            await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
        }
        const fork = readMigrationFiles({
          migrationsFolder: resolve('staging/fixtures/excel-import-branch'),
        });
        for (const entry of fork.slice(0, count)) {
          for (const statement of entry.sql) if (statement.trim()) await client.unsafe(statement);
          await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${entry.hash},${entry.folderMillis})`;
        }
        const [pack] =
          await client`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,is_demo)
        VALUES('TEST-EXCEL-FORK',1,'TEST preserved Excel package','TRYOUT',true) RETURNING *`;
        const history =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await migrateIntegratedDatabase(client, folder);
        expect(
          (await client`SELECT * FROM assessment_packages WHERE id=${pack!.id}`)[0],
        ).toMatchObject(pack!);
        expect(
          (
            await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`
          ).slice(0, history.length),
        ).toEqual(history);
        expect(
          (
            await client`SELECT count(*)::int AS count FROM information_schema.columns
        WHERE table_name='questions' AND column_name IN ('usage_type','source_question_id')`
          )[0]!.count,
        ).toBe(2);
        expect(
          (
            await client`SELECT count(*)::int AS count FROM information_schema.columns
        WHERE table_name='xp_ledger' AND column_name='policy_version'`
          )[0]!.count,
        ).toBe(1);
        expect(await client`SELECT source_key FROM notification_outbox`).toEqual([
          { source_key: 'SYSTEM_STARTED' },
        ]);
        const after =
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
        await migrateIntegratedDatabase(client, folder);
        expect(
          await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ).toEqual(after);
      });
    },
  );

  it('upgrades the first merged main with an earlier purpose cursor without replaying its DDL', async () => {
    await fixture(28, async (client, folder) => {
      const purpose = readMigrationFiles({
        migrationsFolder: resolve('staging/fixtures/excel-import-branch'),
      })[3]!;
      for (const statement of purpose.sql) if (statement.trim()) await client.unsafe(statement);
      await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${purpose.hash},${purpose.folderMillis})`;
      const before =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      await migrateIntegratedDatabase(client, folder);
      const after =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      expect(after.slice(0, before.length)).toEqual(before);
      const canonical = readMigrationFiles({ migrationsFolder: folder }).at(-1)!;
      expect(after).toContainEqual({
        hash: canonical.hash,
        created_at: String(canonical.folderMillis),
      });
      await migrateIntegratedDatabase(client, folder);
      expect(
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
      ).toEqual(after);
    });
  });

  it('rolls back replayed DDL and history if the known fork schema has diverged', async () => {
    await fixture(4, async (client, folder) => {
      await migrate(drizzle(client), { migrationsFolder: resolve('staging/fixtures/irt-branch') });
      await client.unsafe('ALTER TABLE assessment_attempts ADD COLUMN unlocked_level_id uuid');
      const history = await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
      await expect(migrateIntegratedDatabase(client, folder)).rejects.toThrow();
      expect(await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(history);
      expect(
        await client`SELECT column_name FROM information_schema.columns
        WHERE table_name='assessment_attempts' AND column_name='level_id_at_start'`,
      ).toHaveLength(0);
    });
  });
});
