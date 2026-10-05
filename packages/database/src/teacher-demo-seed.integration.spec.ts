import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { verify, fingerprint } from './teacher-demo-seed.js';

const restoredUrl = process.env.TEACHER_DEMO_TEST_DATABASE_URL;
const testUrl = restoredUrl ?? process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)('Teacher DEMO SQL on an isolated restored database', () => {
  it('derives results, reruns without duplicates, refuses conflicting history and rolls back all writes', async () => {
    const target = new URL(testUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      process.env.NODE_ENV !== 'test' ||
      !(restoredUrl
        ? target.pathname.startsWith('/teacher_demo_restore_')
        : target.pathname.startsWith('/numora_test'))
    )
      throw new Error('Seed integration tests require an isolated localhost restore database.');
    const root = resolve(__dirname, '../../..');
    const roster = JSON.parse(
      await readFile(resolve(root, 'packages/database/seeds/teacher-demo-roster.json'), 'utf8'),
    );
    const source = await readFile(
      resolve(root, 'packages/database/seeds/teacher-demo.sql'),
      'utf8',
    );
    const database = `teacher_demo_restore_${randomUUID().replaceAll('-', '')}`;
    const adminConnection = postgres(testUrl!, { max: 1, connect_timeout: 5, onnotice: () => {} });
    const isolatedTarget = new URL(testUrl!);
    if (!restoredUrl) isolatedTarget.pathname = '/' + database;
    const sql = postgres(isolatedTarget.toString(), {
      max: 1,
      connect_timeout: 5,
      onnotice: () => {},
    });
    try {
      let qa: { actors: { admin: string; teacherB: string } };
      if (restoredUrl) {
        qa = JSON.parse(await readFile(resolve(root, '.qa-seed/actors.json'), 'utf8'));
      } else {
        await adminConnection.unsafe(`CREATE DATABASE "${database}"`);
        const migration = postgres(isolatedTarget.toString(), { max: 1, onnotice: () => {} });
        try {
          await migrate(drizzle(migration), {
            migrationsFolder: resolve(root, 'packages/database/drizzle'),
          });
        } finally {
          await migration.end();
        }
        // TEST ONLY Auth transport tables and identities; no shared Cloud credentials or files.
        await sql.unsafe(`CREATE SCHEMA auth;
          CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb);
          CREATE TABLE auth.identities(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), provider text, provider_id text, identity_data jsonb);`);
        qa = { actors: { admin: randomUUID(), teacherB: randomUUID() } };
        await sql`INSERT INTO users(auth_user_id,role,email,display_name)
          VALUES(${qa.actors.admin}::uuid,'ADMIN','seed-admin@example.test','TEST ONLY Seed Admin')`;
        await sql.begin(async (tx) => {
          await tx.unsafe(
            await readFile(resolve(root, 'packages/database/seeds/redesign-learning.sql'), 'utf8'),
          );
        });
      }
      const before = await fingerprint(sql);
      let rolledBack = false;
      try {
        await sql.begin(async (tx) => {
          const actors: Record<string, string> = {};
          // Synthetic email-provider rows are isolated test fixtures, never Google identities.
          for (const actor of roster.actors) {
            const id = randomUUID();
            actors[actor.id] = id;
            await tx`INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES(${id}::uuid,${actor.email},${tx.json({ provider: 'email', numora_qa: true, numora_teacher_demo: 'teacher-demo-2026-v1' })})`;
            await tx`INSERT INTO auth.identities(id,user_id,provider,provider_id,identity_data) VALUES(${randomUUID()}::uuid,${id}::uuid,'email',${id},${tx.json({ sub: id, email: actor.email })})`;
          }
          const [admin] = await tx<
            { id: string }[]
          >`SELECT id FROM users WHERE auth_user_id=${qa.actors.admin}::uuid`;
          const config: Parameters<typeof verify>[1] & {
            roster: unknown;
            adminUserId: string;
            tokenHash: string;
          } = {
            projectRef: 'pkamenfnwmoeisccnrnk',
            scenario: 'teacher-demo-2026-v1',
            asOf: '2026-10-04T12:00:00Z',
            chapterOrderBase: 2,
            rosterDigest: createHash('sha256').update(JSON.stringify(roster)).digest('hex'),
            actors,
            qaActors: qa.actors,
            roster,
            adminUserId: admin!.id,
            tokenHash: createHash('sha256').update('isolated-demo-fixture').digest('hex'),
          };
          await tx`SELECT set_config('numora.teacher_demo',${JSON.stringify(config)},true)`;
          await tx.unsafe(source);
          const first = await verify(tx, config);
          await tx.unsafe(source);
          const repeated = await verify(tx, config);
          expect(repeated).toEqual(first);
          expect(first.feedback?.read_rate).toBe('90.48');
          expect(first.activity?.rate).toBe('82.35');
          await expect(
            tx.savepoint(async (sp) => {
              await sp`SELECT pg_temp.teacher_demo_put('users',jsonb_build_object('id','04000000-0000-4000-8000-000000000001','display_name','Conflicting synthetic history'))`;
            }),
          ).rejects.toThrow(/collision or modified history/);
          expect(await verify(tx, config)).toEqual(first);
          expect(await fingerprint(tx)).toEqual(before);
          throw new Error('INTENTIONAL_TEST_ROLLBACK');
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'INTENTIONAL_TEST_ROLLBACK') throw error;
        rolledBack = true;
      }
      expect(rolledBack).toBe(true);
      expect(await fingerprint(sql)).toEqual(before);
    } finally {
      await sql.end();
      if (!restoredUrl)
        await adminConnection.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await adminConnection.end();
    }
  }, 120000);
});
