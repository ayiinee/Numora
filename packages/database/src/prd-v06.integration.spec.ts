import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrateIntegratedDatabase } from './integrated-migrations.js';
import { seedPrdV06Demo } from './prd-v06-demo.js';
import { seedDemoLearning } from './demo-learning.js';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('PRD v0.6 database race and demo replay', () => {
  it('serializes joins at five memberships, blocks banned rejoin and keeps legacy demo policy pins', async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new Error('Isolated local PostgreSQL required.');
    const name = `numora_prdv06_${randomUUID().replaceAll('-', '')}`;
    const admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
    url.pathname = `/${name}`;
    const client = postgres(url.toString(), { max: 4, onnotice: () => {} });
    let created = false;
    try {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
      created = true;
      await migrateIntegratedDatabase(client, resolve('drizzle'));
      const journal =
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      await migrateIntegratedDatabase(client, resolve('drizzle'));
      expect(
        await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
      ).toEqual(journal);
      const [teacher, student] = await client<
        { id: string }[]
      >`INSERT INTO users(auth_user_id,role,display_name,email)
        VALUES(gen_random_uuid(),'TEACHER','Teacher','teacher@race.test'),(gen_random_uuid(),'STUDENT','Student','student@race.test') RETURNING id`;
      const [school] = await client<
        { id: string }[]
      >`INSERT INTO schools(code,name) VALUES('RACE','School') RETURNING id`;
      const classes = await client<{ id: string }[]>`INSERT INTO classes(school_id,name,join_code)
        SELECT ${school!.id}::uuid,'Class '||n,'RACECLASS'||n FROM generate_series(1,6) n RETURNING id`;
      for (const c of classes.slice(0, 4))
        await client`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${c.id}::uuid,${student!.id}::uuid)`;
      const races = await Promise.allSettled(
        classes.slice(4).map((c) =>
          client.begin(async (tx) => {
            await tx`SET LOCAL ROLE numora_main_runtime`;
            await tx`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${c.id}::uuid,${student!.id}::uuid)`;
          }),
        ),
      );
      expect(races.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(races.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: '23514', message: 'CLASS_LIMIT_REACHED' },
      });
      expect(
        (await client`SELECT count(*)::int n FROM class_memberships WHERE left_at IS NULL`)[0]!.n,
      ).toBe(5);
      await client`INSERT INTO class_student_bans(class_id,student_user_id,banned_by_user_id) VALUES(${classes[0]!.id}::uuid,${student!.id}::uuid,${teacher!.id}::uuid)`;
      await expect(
        client`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${classes[0]!.id}::uuid,${student!.id}::uuid)`,
      ).rejects.toMatchObject({ code: '23514', message: 'CLASS_BANNED' });
      const db = drizzle(client);
      await db.transaction(async (tx) => seedDemoLearning(tx));
      const legacy =
        await client`SELECT id,scoring_policy_version_id FROM assessment_packages WHERE family_code LIKE 'DEMO-DRILL-L1-V%' ORDER BY id`;
      await db.transaction(async (tx) => seedPrdV06Demo(tx));
      expect(
        await client`SELECT id,scoring_policy_version_id FROM assessment_packages WHERE family_code LIKE 'DEMO-DRILL-L1-V%' ORDER BY id`,
      ).toEqual(legacy);
      expect(
        (
          await client`SELECT count(*)::int n FROM assessment_packages WHERE family_code LIKE 'DEMO-V06-%'`
        )[0]!.n,
      ).toBe(1);
      expect(
        (
          await client`SELECT count(*)::int n FROM package_items i JOIN assessment_packages p ON p.id=i.package_id WHERE p.family_code LIKE 'DEMO-V06-%'`
        )[0]!.n,
      ).toBe(10);
      expect((await client`SELECT count(*)::int n FROM users`)[0]!.n).toBe(2);
    } finally {
      await client.end();
      if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60_000);
});
