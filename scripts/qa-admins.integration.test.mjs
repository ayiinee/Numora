import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { applyQaAdminProfiles, checkQaAdminActor } from '../apps/api/scripts/qa-admins.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

test(
  'QA Admin provisioning: real PostgreSQL roles, replay, conflicts and atomic audit rollback',
  { timeout: 120000 },
  async () => {
    const target = new URL(process.env.TEST_DATABASE_URL);
    assert.equal(process.env.NODE_ENV, 'test');
    assert.ok(
      ['localhost', '127.0.0.1'].includes(target.hostname),
      'Requires isolated localhost PostgreSQL',
    );
    assert.ok(target.pathname.startsWith('/numora_test'), 'Requires a numora_test database');
    const database = `numora_test_qa_admin_${randomUUID().replaceAll('-', '')}`;
    const operator = postgres(target.toString(), { max: 1, onnotice: () => {} });
    target.pathname = `/${database}`;
    const sql = postgres(target.toString(), { max: 4, onnotice: () => {} });
    const actorAuthId = randomUUID();
    const accounts = {
      admin: { id: actorAuthId, email: 'numora-qa-admin@example.invalid' },
      adminSuper: { id: randomUUID(), email: 'numora-qa-adminsuper@example.invalid' },
      adminOperations: { id: randomUUID(), email: 'numora-qa-adminoperations@example.invalid' },
    };
    const profiles = () =>
      sql`SELECT id, auth_user_id, role, admin_role, status, email, updated_at FROM users ORDER BY id`;
    const audits = () =>
      sql`SELECT actor_user_id, entity_id, metadata FROM audit_logs WHERE action='QA_ADMIN_ROLE_PROVISIONED' ORDER BY entity_id`;
    try {
      await operator.unsafe(`CREATE DATABASE "${database}"`);
      const migration = postgres(target.toString(), { max: 1, onnotice: () => {} });
      try {
        await migrate(drizzle(migration), {
          migrationsFolder: resolve('packages/database/drizzle'),
        });
      } finally {
        await migration.end();
      }
      await sql`INSERT INTO users(auth_user_id,role,status,admin_role,display_name,email)
      VALUES(${actorAuthId}::uuid,'ADMIN','ACTIVE','CONTENT_DATA_MODERATION','TEST ONLY Content Admin','numora-qa-admin@example.invalid')`;
      const original = (await profiles())[0];

      // A profile collision must roll back the whole batch, including the other valid identity.
      await sql`INSERT INTO users(auth_user_id,role,status,display_name,email)
      VALUES(${accounts.adminOperations.id}::uuid,'STUDENT','ACTIVE','TEST ONLY foreign role',${accounts.adminOperations.email})`;
      const collision = await profiles();
      await assert.rejects(applyQaAdminProfiles(sql, actorAuthId, accounts), /profile conflict/);
      assert.deepEqual(await profiles(), collision);
      assert.equal((await audits()).length, 0);
      await sql`DELETE FROM users WHERE auth_user_id=${accounts.adminOperations.id}::uuid`;

      // Failure while recording the second audit must undo both profile inserts and the first audit.
      await sql.unsafe(`CREATE FUNCTION reject_test_qa_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.metadata->>'to'='OPERATIONS' THEN RAISE EXCEPTION 'TEST ONLY audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_qa_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_qa_audit();`);
      await assert.rejects(
        applyQaAdminProfiles(sql, actorAuthId, accounts),
        /TEST ONLY audit failure/,
      );
      assert.deepEqual(Array.from(await profiles()), [original]);
      assert.equal((await audits()).length, 0);
      await sql.unsafe(
        'DROP TRIGGER reject_test_qa_audit ON audit_logs; DROP FUNCTION reject_test_qa_audit()',
      );

      // An existing QA Admin without an assignment receives only its designated subrole.
      await sql`INSERT INTO users(auth_user_id,role,status,display_name,email)
      VALUES(${accounts.adminOperations.id}::uuid,'ADMIN','ACTIVE','TEST ONLY unassigned Admin',${accounts.adminOperations.email})`;

      const [first, concurrent] = await Promise.all([
        applyQaAdminProfiles(sql, actorAuthId, accounts),
        applyQaAdminProfiles(sql, actorAuthId, accounts),
      ]);
      assert.deepEqual(first, concurrent);
      const assigned = await profiles();
      assert.equal(assigned.length, 3);
      assert.deepEqual(
        assigned.find((r) => r.auth_user_id === actorAuthId),
        original,
      );
      for (const [key, role] of [
        ['adminSuper', 'SUPER_ADMIN'],
        ['adminOperations', 'OPERATIONS'],
      ]) {
        const profile = assigned.find((r) => r.auth_user_id === accounts[key].id);
        assert.equal(profile.role, 'ADMIN');
        assert.equal(profile.admin_role, role);
        assert.equal(profile.id, first[key]);
      }
      const recorded = await audits();
      assert.equal(recorded.length, 2);
      assert.ok(recorded.every((a) => a.actor_user_id === original.id));
      assert.deepEqual(await applyQaAdminProfiles(sql, actorAuthId, accounts), first);
      assert.deepEqual(await profiles(), assigned);
      assert.deepEqual(await audits(), recorded);

      // Refuse a wrong/disabled actor, a changed assignment, and a non-owner connection.
      await sql`UPDATE users SET status='DISABLED' WHERE auth_user_id=${actorAuthId}::uuid`;
      await assert.rejects(applyQaAdminProfiles(sql, actorAuthId, accounts), /must be active/);
      await sql`UPDATE users SET status='ACTIVE' WHERE auth_user_id=${actorAuthId}::uuid`;
      await sql`UPDATE users SET admin_role='SUPER_ADMIN' WHERE auth_user_id=${actorAuthId}::uuid`;
      await assert.rejects(applyQaAdminProfiles(sql, actorAuthId, accounts), /explicitly assigned/);
      await sql`UPDATE users SET admin_role='CONTENT_DATA_MODERATION' WHERE auth_user_id=${actorAuthId}::uuid`;
      await sql`UPDATE users SET admin_role='CONTENT_DATA_MODERATION' WHERE auth_user_id=${accounts.adminOperations.id}::uuid`;
      const changed = await profiles();
      await assert.rejects(applyQaAdminProfiles(sql, actorAuthId, accounts), /profile conflict/);
      assert.deepEqual(await profiles(), changed);
      assert.deepEqual(await audits(), recorded);

      const role = `qa_admin_nonowner_${randomUUID().replaceAll('-', '')}`;
      await operator.unsafe(`CREATE ROLE "${role}"`);
      try {
        await assert.rejects(
          sql.begin(async (tx) => {
            await tx.unsafe(`SET LOCAL ROLE "${role}"`);
            await checkQaAdminActor(tx, actorAuthId);
          }),
          /owner operator/,
        );
      } finally {
        await operator.unsafe(`DROP ROLE "${role}"`);
      }
    } finally {
      await sql.end();
      await operator.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await operator.end();
    }
  },
);
