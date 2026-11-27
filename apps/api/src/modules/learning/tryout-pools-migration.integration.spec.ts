import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;

it.skipIf(!testUrl)(
  'preserves historical Tryout attempts and converts single/pair targets to pools',
  async () => {
    const url = new URL(testUrl!);
    if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
      throw Error('Dedicated localhost test database required.');
    const name = `numora_test_pool_migration_${randomUUID().replaceAll('-', '')}`;
    const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
    let db: ReturnType<typeof postgres> | undefined;
    try {
      await admin.unsafe(`CREATE DATABASE "${name}"`);
      url.pathname = `/${name}`;
      db = postgres(url.toString(), { max: 1, onnotice: () => {} });
      const migrations = readMigrationFiles({
        migrationsFolder: resolve('../../packages/database/drizzle'),
      });
      const final = migrations.at(-1)!;
      expect(final.sql.join('\n')).toContain('CREATE TABLE "tryout_allocation_pools"');
      for (const migration of migrations.slice(0, -1))
        await db.begin(async (tx) => {
          for (const statement of migration.sql) await tx.unsafe(statement);
        });
      const [student] = await db`INSERT INTO users(auth_user_id,role,display_name,email)
      VALUES(${randomUUID()},'STUDENT','TEST migration','migration@example.test') RETURNING id`;
      const [school] =
        await db`INSERT INTO schools(code,name) VALUES('TEST-MIGRATION','TEST migration school') RETURNING id`;
      const packages: string[] = [];
      for (let i = 0; i < 2; i++) {
        const [p] =
          await db`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type)
        VALUES('TEST-MIGRATION',${i + 1},'TEST migration package','TRYOUT') RETURNING id`;
        packages.push(p!.id as string);
      }
      const [wave] = await db`INSERT INTO tryout_waves(title,original_package_id,variant_package_id)
      VALUES('TEST migration',${packages[0]!},${packages[1]!}) RETURNING id`;
      const batchIds: string[] = [];
      for (const mode of ['SINGLE_PACKAGE', 'BALANCED_50_50']) {
        const [batch] =
          await db`INSERT INTO tryout_batches(package_id,wave_id,admin_title,starts_at,closes_at,cutoff_at,result_due_at,mandiri_package_id)
        VALUES(${packages[0]!},${wave!.id},${mode},now(),now()+interval '7 days',now()+interval '7 days',now()+interval '10 days',${packages[0]!}) RETURNING id`;
        batchIds.push(batch!.id as string);
        for (const id of packages)
          await db`INSERT INTO tryout_batch_packages(batch_id,package_id) VALUES(${batch!.id},${id})`;
        await db`INSERT INTO tryout_school_delegations(batch_id,school_id,package_id,allocation_mode,variant_package_id)
        VALUES(${batch!.id},${school!.id},${packages[0]!},${mode},${mode === 'BALANCED_50_50' ? packages[1]! : null})`;
        await db`UPDATE tryout_batches SET admin_published_at=now() WHERE id=${batch!.id}`;
      }
      const [attempt] =
        await db`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,tryout_batch_id,deadline_at)
      VALUES(${student!.id},${packages[0]!},'TRYOUT',${batchIds[0]!},now()+interval '30 minutes') RETURNING *`;
      await db`INSERT INTO tryout_student_assignments(attempt_id,batch_id,student_id,school_id,package_id)
      VALUES(${attempt!.id},${batchIds[0]!},${student!.id},${school!.id},${packages[0]!})`;
      await db`INSERT INTO tryout_wave_claims(attempt_id,wave_id,student_id,school_id,package_id)
      VALUES(${attempt!.id},${wave!.id},${student!.id},${school!.id},${packages[0]!})`;
      const snapshot = async () => ({
        attempts: await db!`SELECT * FROM assessment_attempts ORDER BY id`,
        assignments: await db!`SELECT * FROM tryout_student_assignments ORDER BY attempt_id`,
        claims: await db!`SELECT * FROM tryout_wave_claims ORDER BY attempt_id`,
        batches: await db!`SELECT * FROM tryout_batches ORDER BY id`,
        waves: await db!`SELECT * FROM tryout_waves ORDER BY id`,
      });
      const before = await snapshot();
      await db.begin(async (tx) => {
        for (const statement of final.sql) await tx.unsafe(statement);
      });
      expect(await snapshot()).toEqual(before);
      for (const [index, id] of batchIds.entries()) {
        const pools = await db`SELECT p.school_id,count(*)::int AS n FROM tryout_allocation_pools p
        JOIN tryout_pool_packages l ON l.pool_id=p.id WHERE p.batch_id=${id} GROUP BY p.school_id`;
        expect(pools.find((p) => p.school_id === school!.id)?.n).toBe(index + 1);
        expect(pools.find((p) => p.school_id === null)?.n).toBe(2);
      }
      await expect(
        db`DELETE FROM tryout_pool_packages WHERE batch_id=${batchIds[0]!}`,
      ).rejects.toThrow('immutable');
    } finally {
      await db?.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  },
  60000,
);
