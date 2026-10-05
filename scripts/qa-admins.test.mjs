import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requireQaAdminTarget, runQaAdmins } from '../apps/api/scripts/qa-admins.mjs';
import { projectRef } from '../apps/api/scripts/qa-accounts.mjs';

const env = {
  NODE_ENV: 'development',
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_SECRET_KEY: 'sb_secret_TEST_ONLY',
  DATABASE_MIGRATION_URL: `postgres://postgres.${projectRef}:TEST_ONLY@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`,
};

const vaultIo = (actorId) => ({
  readFile: async (file) => {
    if (!file.includes('admin-roles'))
      throw Object.assign(new Error('TEST ONLY missing participants'), { code: 'ENOENT' });
    return JSON.stringify({
      projectRef,
      accounts: {
        admin: { id: actorId, email: 'numora-qa-admin@example.invalid', password: 'TEST_ONLY' },
      },
    });
  },
});
test('QA Admin target rejects production, runtime, foreign DB, missing operator and exposed secrets', async () => {
  requireQaAdminTarget(env);
  for (const patch of [
    { NODE_ENV: 'production' },
    { SUPABASE_PROJECT_REF: 'foreign' },
    { DATABASE_MIGRATION_URL: undefined },
    { DATABASE_MIGRATION_URL: 'postgres://runtime:TEST_ONLY@localhost/db?sslmode=require' },
    { DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL.replace(projectRef, 'foreign') },
    { NEXT_PUBLIC_PRIVATE: env.SUPABASE_SECRET_KEY },
  ]) {
    let accessed = false;
    await assert.rejects(
      runQaAdmins({
        root: '.',
        env: { ...env, ...patch },
        io: {
          readFile() {
            accessed = true;
          },
        },
      }),
    );
    assert.equal(accessed, false);
  }
});
test('read-only preflight refuses a non-owner without any Auth mutation', async () => {
  let called = false,
    ended = false;
  const actorId = randomUUID();
  const client = {
    begin: (fn) => fn(async () => [{ owner: false }]),
    end: async () => {
      ended = true;
    },
  };
  await assert.rejects(
    runQaAdmins({
      root: '.',
      env,
      connect: () => client,
      io: vaultIo(actorId),
      provisionAuth: async () => {
        called = true;
      },
    }),
    /owner operator/,
  );
  assert.equal(called, false);
  assert.equal(ended, true);
});
test('check mode validates the exact Content actor and does not provision Auth or profiles', async () => {
  const actorId = randomUUID();
  let called = false;
  let queries = 0;
  const tx = async () =>
    ++queries === 1
      ? [{ owner: true }]
      : [
          {
            id: randomUUID(),
            role: 'ADMIN',
            status: 'ACTIVE',
            email: 'numora-qa-admin@example.invalid',
            admin_role: 'CONTENT_DATA_MODERATION',
          },
        ];
  const client = { begin: (fn) => fn(tx), end: async () => {} };
  assert.equal(
    await runQaAdmins({
      root: '.',
      env,
      check: true,
      connect: () => client,
      io: vaultIo(actorId),
      provisionAuth: async () => {
        called = true;
      },
    }),
    'preflight verified',
  );
  assert.equal(called, false);
  assert.equal(queries, 2);
});
