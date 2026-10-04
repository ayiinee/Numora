import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { migrateIntegratedDatabase } from './integrated-migrations.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('TEST ONLY redesign seed after curriculum migrations', () => {
  it('seeds five levels with matching families and remains idempotent', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw new Error('Isolated local PostgreSQL required');
    const database = `numora_test_redesign_${randomUUID().replaceAll('-', '')}`;
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = '/' + database;
    const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      await migrateIntegratedDatabase(client, resolve('drizzle'));
      await client`INSERT INTO scoring_policy_versions(policy_code,version,configuration,status)
        VALUES('DRILL_PG_DEMO',1,'{"fixture":true}','PUBLISHED') ON CONFLICT DO NOTHING`;
      const seed = await readFile(resolve('seeds/redesign-learning.sql'), 'utf8');
      await client.begin(async (tx) => {
        await tx.unsafe(seed);
      });
      const before =
        await client`SELECT id,stem,answer_key,explanation FROM question_versions ORDER BY id`;
      expect(before).toHaveLength(100);
      await client.begin(async (tx) => {
        await tx.unsafe(seed);
      });
      expect(
        await client`SELECT id,stem,answer_key,explanation FROM question_versions ORDER BY id`,
      ).toEqual(before);
      expect((await client`SELECT count(*)::int AS count FROM levels`)[0]!.count).toBe(5);
      expect(
        (await client`SELECT count(*)::int AS count FROM assessment_packages WHERE is_demo`)[0]!
          .count,
      ).toBe(10);
      expect((await client`SELECT count(*)::int AS count FROM package_items`)[0]!.count).toBe(100);
      expect(
        await client`SELECT q.id FROM questions q
        JOIN question_variants v ON v.question_id=q.id
        JOIN question_versions ver ON ver.variant_id=v.id
        JOIN package_items pi ON pi.question_version_id=ver.id
        JOIN assessment_packages p ON p.id=pi.package_id
        JOIN levels l ON l.id=p.level_id WHERE q.curriculum_level_number IS DISTINCT FROM l.level_number`,
      ).toEqual([]);
      expect((await client`SELECT count(*)::int AS count FROM users`)[0]!.count).toBe(0);
      expect((await client`SELECT count(*)::int AS count FROM assessment_attempts`)[0]!.count).toBe(
        0,
      );
    } finally {
      await client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);
});
