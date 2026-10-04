import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadMaster,
  validateMaster,
  requireSeedTarget,
  stagingProjectRef,
  buildMasterSeedSql,
  seedMaster,
} from './seed-curriculum-master.mjs';
import { loadSampleBundle, prepareSampleImport } from './prepare-draft-sample-import.mjs';

const master = await loadMaster();
test('full primary-table fixture and ten-sample scope remain compatible', async () => {
  validateMaster(master);
  const sample = await loadSampleBundle();
  for (const table of ['chapters', 'subchapters', 'competencies', 'levels']) {
    for (const row of sample.master[table]) {
      const actual = master[table].find((m) =>
        Object.entries(row).every(([key, value]) => m[key] === value),
      );
      assert.ok(actual, `${table}: ${JSON.stringify(row)}`);
    }
  }
});
test('invalid parent scopes, duplicate identities and invented level criteria are rejected', () => {
  for (const mutate of [
    (m) => {
      m.subchapters[0].chapterCode = 'UNKNOWN';
    },
    (m) => {
      m.competencies[0].subchapterCode = 'SC-DATA';
    },
    (m) => {
      m.competencies[1].code = m.competencies[0].code;
    },
    (m) => {
      m.levels[0].difficultyCriteria = { difficulty: 'EASY' };
    },
    (m) => {
      m.competencies.find((c) => c.code === 'IND-022').reviewRequired = false;
    },
  ]) {
    const changed = structuredClone(master);
    mutate(changed);
    assert.throws(() => validateMaster(changed));
  }
});
test('operator target rejects Production, runtime pooler, insecure transport and absent apply flag', () => {
  const env = {
    SUPABASE_PROJECT_REF: stagingProjectRef,
    DATABASE_MIGRATION_URL: `postgresql://postgres:not-a-real-password@db.${stagingProjectRef}.supabase.co:5432/postgres?sslmode=require`,
  };
  assert.equal(requireSeedTarget(env), env.DATABASE_MIGRATION_URL);
  assert.throws(() => requireSeedTarget(env, true), /Apply requires/);
  assert.equal(
    requireSeedTarget({ ...env, ALLOW_CURRICULUM_MASTER_SEED: 'true' }, true),
    env.DATABASE_MIGRATION_URL,
  );
  for (const changed of [
    { ...env, SUPABASE_PROJECT_REF: 'production' },
    { ...env, DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL.replace(':5432', ':6543') },
    { ...env, DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL.replace('?sslmode=require', '') },
    {
      ...env,
      DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL.replace(
        stagingProjectRef,
        'anotherproject',
      ),
    },
    { ...env, DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL + '&host=other-db.example' },
    { ...env, DATABASE_MIGRATION_URL: 'not-a-url' },
  ])
    assert.throws(() => requireSeedTarget(changed));
  const pooler = {
    ...env,
    DATABASE_MIGRATION_URL: `postgres://postgres.${stagingProjectRef}:dummy@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  };
  assert.equal(requireSeedTarget(pooler), pooler.DATABASE_MIGRATION_URL);
});

// Optional real PostgreSQL engine supplied externally; never reads DATABASE_URL or Cloud credentials.
test(
  'PostgreSQL rehearsal: rollback, 87 masters, repeat, preserved legacy/Auth, atomic conflict, samples',
  { skip: !process.env.CURRICULUM_TEST_PGLITE_MODULE },
  async () => {
    const { PGlite } = await import(
      pathToFileURL(resolve(process.env.CURRICULUM_TEST_PGLITE_MODULE)).href
    );
    const db = new PGlite();
    const run = async (body, commit = true) => {
      await db.exec('BEGIN');
      try {
        await db.exec(body);
        await db.exec(commit ? 'COMMIT' : 'ROLLBACK');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    };
    const rows = async (table) => (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
    try {
      await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
      const folder = new URL('../packages/database/drizzle/', import.meta.url);
      const journal = JSON.parse(await readFile(new URL('meta/_journal.json', folder), 'utf8'));
      for (const entry of journal.entries)
        await run(await readFile(new URL(`${entry.tag}.sql`, folder), 'utf8'));
      await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
        INSERT INTO auth.users SELECT gen_random_uuid() FROM generate_series(1,26);
        INSERT INTO chapters(code,slug,name,display_order,status) VALUES('LEGACY','legacy','Existing demo',1,'READY');`);
      const legacy = await rows('chapters'),
        auth = await rows('auth.users');
      // Exercise the same begin/rollback branch used by the postgres.js CLI, with PGlite as engine.
      const client = {
        begin: async (fn) => {
          await db.exec('BEGIN');
          const tx = async (strings, ...values) =>
            (
              await db.query(
                strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''),
                values,
              )
            ).rows;
          tx.unsafe = (body) => db.exec(body);
          try {
            const result = await fn(tx);
            await db.exec('COMMIT');
            return result;
          } catch (error) {
            await db.exec('ROLLBACK');
            throw error;
          }
        },
      };
      const preview = await seedMaster(client, master);
      assert.equal(preview.mode, 'ROLLED_BACK_DRY_RUN');
      assert.equal(
        preview.created.reduce((n, row) => n + row.count, 0),
        87,
      );
      assert.deepEqual(await rows('chapters'), legacy);
      assert.equal((await rows('audit_logs')).length, 0);
      const applied = await seedMaster(client, master, { apply: true });
      assert.equal(applied.mode, 'APPLIED');
      assert.equal((await rows('chapters')).length, 5);
      assert.equal((await rows('subchapters')).length, 10);
      assert.equal((await rows('competencies')).length, 23);
      assert.equal((await rows('levels')).length, 50);
      assert.equal((await rows('audit_logs')).length, 87);
      const snapshot = {};
      for (const table of ['chapters', 'subchapters', 'competencies', 'levels', 'audit_logs'])
        snapshot[table] = await rows(table);
      assert.equal(
        snapshot.chapters.filter((r) => r.code !== 'LEGACY' && r.status === 'DRAFT').length,
        4,
      );
      assert.equal(
        snapshot.levels.filter((r) => r.status === 'DRAFT' && r.difficulty_criteria === null)
          .length,
        50,
      );
      const indicator22 = snapshot.audit_logs.find((r) => r.metadata.sourceItem.code === 'IND-022');
      assert.equal(indicator22.metadata.sourceItem.reviewRequired, true);
      assert.deepEqual((await seedMaster(client, master, { apply: true })).created, []);
      for (const table of Object.keys(snapshot))
        assert.deepEqual(await rows(table), snapshot[table]);
      assert.deepEqual(await rows('auth.users'), auth);
      assert.deepEqual(
        (await rows('chapters')).filter((r) => r.code === 'LEGACY'),
        legacy,
      );
      // A fresh missing chapter would be created BEFORE a later conflict; rollback must remove it again.
      const changed = structuredClone(master);
      changed.chapters[0].code = 'CH-NEW';
      changed.chapters[0].slug = 'new';
      changed.chapters[0].name = 'New';
      changed.chapters[0].sourceName = 'New';
      for (const row of [...changed.subchapters, ...changed.competencies, ...changed.levels])
        if (row.chapterCode === 'CH-BIL') row.chapterCode = 'CH-NEW';
      await assert.rejects(
        run(buildMasterSeedSql(changed)),
        /Subchapter parent\/alias\/slug conflict/,
      );
      for (const table of Object.keys(snapshot))
        assert.deepEqual(await rows(table), snapshot[table]);
      const descriptionConflict = structuredClone(master);
      descriptionConflict.competencies[22].description += ' Changed';
      await assert.rejects(
        run(buildMasterSeedSql(descriptionConflict)),
        /Indicator mapping conflict/,
      );
      const sampleSql = await prepareSampleImport(await loadSampleBundle());
      await db.exec(sampleSql);
      assert.equal((await rows('questions')).length, 10);
      assert.equal((await rows('question_versions')).length, 10);
      assert.equal((await rows('chapters')).length, 5);
      assert.equal((await rows('levels')).length, 50);
      // Both operators can be repeated after the full master + sample import.
      await db.exec(sampleSql);
      await run(buildMasterSeedSql(master));
      assert.equal((await rows('audit_logs')).length, 97);
    } finally {
      await db.close();
    }
  },
);
