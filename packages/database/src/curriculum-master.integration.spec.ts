import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import {
  loadCurriculumMaster,
  postgresCurriculumDatabase,
  readCurriculumPlan,
  seedCurriculumMaster,
} from './curriculum-master.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('TEST ONLY curriculum master persistence', () => {
  it('preserves demo/history, seeds DRAFT, replays concurrently and rolls back a conflict', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Isolated local test PostgreSQL required.');
    const database = `numora_test_master_${randomUUID().replaceAll('-', '')}`;
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = '/' + database;
    const client = postgres(url.toString(), { max: 2, onnotice: () => {} });
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      await migrateIntegratedDatabase(client, resolve('drizzle'));
      await client`INSERT INTO chapters(code,slug,name,display_order,status)
        VALUES('DEMO','demo','TEST ONLY demo',1,'READY')`;
      const before = await client`SELECT * FROM chapters`;
      const migrations = await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
      const master = await loadCurriculumMaster();
      const db = postgresCurriculumDatabase(client);
      const readOnly = await readCurriculumPlan(db, master);
      expect(readOnly.newChapters).toHaveLength(4);
      expect(await client`SELECT * FROM chapters`).toEqual(before);
      const report = await seedCurriculumMaster(db, master);
      expect(report.createdChapters).toBe(4);
      expect(report.createdSubchapters).toBe(10);
      expect(await client`SELECT * FROM chapters WHERE code='DEMO'`).toEqual(before);
      expect(
        (await client`SELECT display_order FROM chapters WHERE code='CH-BIL'`)[0]!.display_order,
      ).toBe(2);
      const saved = await client`SELECT * FROM chapters ORDER BY code`;
      const savedSubs = await client`SELECT * FROM subchapters ORDER BY code`;
      expect(saved.filter((c) => c.code !== 'DEMO').every((c) => c.status === 'DRAFT')).toBe(true);
      expect(savedSubs.every((s) => s.status === 'DRAFT')).toBe(true);
      const replays = await Promise.all([
        seedCurriculumMaster(db, master),
        seedCurriculumMaster(db, master),
      ]);
      expect(replays.every((r) => r.createdChapters === 0 && r.createdSubchapters === 0)).toBe(
        true,
      );
      expect(await client`SELECT * FROM chapters ORDER BY code`).toEqual(saved);
      expect(await client`SELECT * FROM subchapters ORDER BY code`).toEqual(savedSubs);
      const changed = structuredClone(master);
      changed.subchapters[0]!.name = 'Unexpected taxonomy change';
      await expect(seedCurriculumMaster(db, changed)).rejects.toThrow('SUBCHAPTER_METADATA');
      expect(await client`SELECT * FROM chapters ORDER BY code`).toEqual(saved);
      expect(await client`SELECT * FROM subchapters ORDER BY code`).toEqual(savedSubs);
      expect(await client`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(
        migrations,
      );
      for (const table of [
        'competencies',
        'levels',
        'questions',
        'question_versions',
        'assessment_packages',
        'users',
      ]) {
        expect(
          (await client.unsafe(`SELECT count(*)::int AS count FROM "${table}"`))[0]!.count,
        ).toBe(0);
      }
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }, 120_000);
});
