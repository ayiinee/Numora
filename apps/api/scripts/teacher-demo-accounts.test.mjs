import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireDemoTarget,
  assertDemoAuth,
  serverAdminKey,
  projectRef,
  scenario,
} from './teacher-demo-accounts.mjs';

const target = {
  NODE_ENV: 'development',
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  DATABASE_URL: `postgresql://postgres.${projectRef}:redacted@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`,
};
test('environment guard rejects production, unknown projects, mixed Auth/DB and unsafe TLS/pooler', () => {
  assert.equal(requireDemoTarget(target), target.DATABASE_URL);
  for (const override of [
    { NODE_ENV: 'production' },
    { SUPABASE_PROJECT_REF: 'unknown' },
    { SUPABASE_URL: 'https://production.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://unknown.supabase.co' },
    { DATABASE_URL: target.DATABASE_URL.replace(projectRef, 'unknown') },
    { DATABASE_URL: target.DATABASE_URL.replace('5432', '6543') },
    { DATABASE_URL: target.DATABASE_URL.replace('require', 'disable') },
    { NEXT_PUBLIC_SECRET: 'sb_secret_test' },
    {
      NEXT_PUBLIC_SECRET:
        'header.' +
        Buffer.from(JSON.stringify({ role: 'service_role', ref: projectRef })).toString(
          'base64url',
        ) +
        '.sig',
    },
  ])
    assert.throws(() => requireDemoTarget({ ...target, ...override }), /TEACHER_DEMO/);
});
test('server key guard accepts the configured legacy service role only for this project', () => {
  const key = (ref) =>
    'header.' +
    Buffer.from(JSON.stringify({ role: 'service_role', ref })).toString('base64url') +
    '.sig';
  assert.equal(serverAdminKey({ SUPABASE_SERVICE_ROLE_KEY: key(projectRef) }), key(projectRef));
  assert.throws(() => serverAdminKey({ SUPABASE_SERVICE_ROLE_KEY: key('unknown') }), /Development/);
  assert.throws(
    () => serverAdminKey({ SUPABASE_SECRET_KEY: 'sb_publishable_example' }),
    /Development/,
  );
});
test('Auth reconciliation rejects another owner, provider or pinned UUID', () => {
  const account = { id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@numora.test' };
  const user = {
    ...account,
    app_metadata: { numora_qa: true, numora_teacher_demo: scenario, provider: 'email' },
    identities: [{ provider: 'email' }],
  };
  assert.doesNotThrow(() => assertDemoAuth(user, account));
  for (const override of [
    { id: '00000000-0000-4000-8000-000000000002' },
    { email: 'other@numora.test' },
    { app_metadata: { ...user.app_metadata, numora_teacher_demo: 'other' } },
    { app_metadata: { ...user.app_metadata, provider: 'google' } },
    { identities: [{ provider: 'google' }] },
  ])
    assert.throws(() => assertDemoAuth({ ...user, ...override }, account), /conflict/);
});
