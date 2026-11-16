import assert from 'node:assert/strict';
import test from 'node:test';
import { stagingProblems } from './check-staging-env.mjs';

const ref = 'abcdefghijklmnopqrst';
const auth = 'https://' + ref + '.supabase.co';
const stagingWeb = 'https://web.staging.example.test';
const stagingApi = 'https://api.staging.example.test';
const database = (role) =>
  'postgresql://' + role + ':fixture@db.' + ref + '.supabase.co:5432/postgres?sslmode=require';
const staging = {
  STAGING_WEB_ORIGIN: stagingWeb,
  STAGING_API_ORIGIN: stagingApi,
  CORS_ORIGINS: stagingWeb,
  ADMIN_AUTH_REDIRECT_ORIGIN: stagingWeb,
  NEXT_PUBLIC_API_URL: stagingApi + '/api/v1',
  API_INTERNAL_URL: stagingApi + '/api/v1',
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: auth,
  NEXT_PUBLIC_SUPABASE_URL: auth,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  SUPABASE_SECRET_KEY: 'sb_secret_fixture',
  DATABASE_URL: database('runtime'),
  DATABASE_MIGRATION_URL: database('migration'),
  QA_CAPACITY_EVIDENCE_URL: database('evidence'),
  STAGING_REDIS_HOST: 'redis.staging.example.test',
  REDIS_URL: 'rediss://default:fixture@redis.staging.example.test:6379',
  BULLMQ_PREFIX: 'numora:staging:capacity',
  STAGING_R2_BUCKET: 'numora-staging',
  R2_BUCKET: 'numora-staging',
  R2_ACCOUNT_ID: 'fixture',
  R2_ACCESS_KEY_ID: 'fixture',
  R2_SECRET_ACCESS_KEY: 'fixture',
  TEACHER_TOKEN_PEPPER: 'a'.repeat(32),
  METRICS_TOKEN: 'b'.repeat(32),
};

test('accepts matching staging origins, project and dedicated resource inventory', () => {
  assert.deepEqual(stagingProblems(staging), []);
});

test('rejects production routes, project and bucket', () => {
  const issues = stagingProblems({
    ...staging,
    STAGING_WEB_ORIGIN: 'https://hellonumora.com',
    SUPABASE_PROJECT_REF: 'bfvbstmkcpanqqehfevr',
    R2_BUCKET: 'numora-prod',
    STAGING_R2_BUCKET: 'numora-prod',
  });
  for (const field of ['STAGING_WEB_ORIGIN', 'SUPABASE_PROJECT_REF', 'R2_BUCKET'])
    assert.ok(issues.some((issue) => issue.startsWith(field)));
});

test('rejects a missing project and an evidence connection that reuses the runtime role', () => {
  const issues = stagingProblems({
    ...staging,
    SUPABASE_PROJECT_REF: '',
    QA_CAPACITY_EVIDENCE_URL: staging.DATABASE_URL,
  });
  assert.ok(issues.some((issue) => issue.includes('dedicated staging project')));
  assert.ok(issues.some((issue) => issue.includes('distinct PostgreSQL roles')));
  assert.ok(issues.every((issue) => !issue.includes('fixture')));
});
