import { describe, expect, it } from 'vitest';
import {
  assertRuntimeDatabaseState,
  productionTarget,
  startupFailureMessage,
  type RuntimeDatabaseState,
} from './production-runtime.js';

const ref = 'abcdefghijklmnopqrst';
const fixture: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  NUMORA_DEPLOYMENT_PROFILE: 'production-vps',
  DATABASE_URL:
    'postgres://numora_app:TEST_ONLY_PASSWORD@db.example.test:5432/numora_production?sslmode=verify-full',
  DATABASE_EXPECTED_HOST: 'db.example.test',
  DATABASE_EXPECTED_PORT: '5432',
  DATABASE_EXPECTED_NAME: 'numora_production',
  DATABASE_EXPECTED_USER: 'numora_app',
  DB_POOL_MAX: '3',
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY',
  REDIS_URL: 'rediss://default:TEST_ONLY@redis.example.test:6379',
  BULLMQ_PREFIX: 'numora:prod:fixture',
  TEACHER_TOKEN_PEPPER: 'TEST ONLY preserve existing pepper',
  CORS_ORIGINS: 'https://app.example.test',
  ALLOW_SYNTHETIC_CONTENT: 'false',
  PVP_MODE: 'disabled',
  PVP_CONTENT_MODE: 'strict',
};
const target = () => productionTarget('api', fixture)!;
const state: RuntimeDatabaseState = {
  database: 'numora_production',
  login: 'numora_app',
  actor: 'numora_app',
  superuser: false,
  createdb: false,
  createrole: false,
  replication: false,
  bypassrls: false,
  elevated_membership: false,
  main_member: true,
  irt_member: false,
  owns_domain: false,
  owns_database: false,
  can_create: false,
  tls: true,
};

it('accepts split VPS database and existing Supabase Auth without changing development/test', () => {
  expect(target().profile).toBe('production-vps');
  expect(
    productionTarget('worker', {
      ...fixture,
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      TEACHER_TOKEN_PEPPER: '',
      CORS_ORIGINS: '',
    }),
  ).toBeDefined();
  expect(productionTarget('api', { NODE_ENV: 'development' })).toBeUndefined();
  expect(productionTarget('worker', { NODE_ENV: 'test' })).toBeUndefined();
  expect(
    productionTarget('api', {
      ...fixture,
      CORS_ORIGINS: 'https://app.example.test,https://admin.example.test',
    }),
  ).toBeDefined();
  expect(
    productionTarget('api', { ...fixture, SUPABASE_URL: 'https://auth.example.test' }),
  ).toBeDefined();
});
it('supports explicit Supabase production with restricted direct/session-pooler logins', () => {
  const env = {
    ...fixture,
    NUMORA_DEPLOYMENT_PROFILE: 'production-supabase',
    SUPABASE_PROJECT_REF: ref,
    DATABASE_EXPECTED_HOST: `db.${ref}.supabase.co`,
    DATABASE_EXPECTED_NAME: 'postgres',
    DATABASE_URL: `postgres://numora_app:TEST_ONLY@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,
  };
  expect(productionTarget('api', env)?.databaseRole).toBe('numora_app');
  expect(() =>
    productionTarget('api', { ...env, SUPABASE_URL: 'https://otherproject.supabase.co' }),
  ).toThrow('projects differ');
  const host = 'aws-0-example.pooler.supabase.com',
    login = `numora_app.${ref}`;
  expect(
    productionTarget('api', {
      ...env,
      DATABASE_EXPECTED_HOST: host,
      DATABASE_EXPECTED_USER: login,
      DATABASE_URL: `postgres://${login}:TEST_ONLY@${host}:5432/postgres?sslmode=verify-full`,
    })?.databaseRole,
  ).toBe('numora_app');
});
describe('production target and secret guards', () => {
  const cases: [string, NodeJS.ProcessEnv][] = [
    ['global TLS bypass', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }],
    ['inherited role override', { PGOPTIONS: '-c role=postgres' }],
    ['missing profile', { NUMORA_DEPLOYMENT_PROFILE: '' }],
    ['unknown profile', { NUMORA_DEPLOYMENT_PROFILE: 'prod' }],
    ['non-production profile use', { NODE_ENV: 'development' }],
    ['missing host pin', { DATABASE_EXPECTED_HOST: '' }],
    ['host typo', { DATABASE_EXPECTED_HOST: 'wrong.example.test' }],
    ['port mismatch', { DATABASE_EXPECTED_PORT: '6432' }],
    ['database mismatch', { DATABASE_EXPECTED_NAME: 'other' }],
    ['login mismatch', { DATABASE_EXPECTED_USER: 'other' }],
    [
      'missing password',
      { DATABASE_URL: fixture.DATABASE_URL!.replace(':TEST_ONLY_PASSWORD', '') },
    ],
    [
      'non-postgres protocol',
      { DATABASE_URL: fixture.DATABASE_URL!.replace('postgres:', 'https:') },
    ],
    ['unencrypted URL', { DATABASE_URL: fixture.DATABASE_URL!.replace('verify-full', 'disable') }],
    ['unverified TLS', { DATABASE_URL: fixture.DATABASE_URL!.replace('verify-full', 'require') }],
    ['duplicate TLS override', { DATABASE_URL: fixture.DATABASE_URL! + '&sslmode=disable' }],
    ['query route override', { DATABASE_URL: fixture.DATABASE_URL! + '&host=other.example.test' }],
    ['query SSL override', { DATABASE_URL: fixture.DATABASE_URL! + '&ssl=require' }],
    [
      'IP omits DNS verification',
      {
        DATABASE_EXPECTED_HOST: '127.0.0.1',
        DATABASE_URL: fixture.DATABASE_URL!.replace('db.example.test', '127.0.0.1'),
      },
    ],
    ['test database', { DATABASE_EXPECTED_NAME: 'numora_test' }],
    [
      'administrative account',
      {
        DATABASE_EXPECTED_USER: 'postgres',
        DATABASE_URL: fixture.DATABASE_URL!.replace('numora_app', 'postgres'),
      },
    ],
    ['migration secret in runtime', { DATABASE_MIGRATION_URL: 'NEVER PRINT MIGRATION SECRET' }],
    ['implicit pool size', { DB_POOL_MAX: '' }],
    ['invalid pool', { DB_POOL_MAX: 'NaN' }],
    ['zero pool', { DB_POOL_MAX: '0' }],
    ['synthetic content', { ALLOW_SYNTHETIC_CONTENT: 'true' }],
    ['demo PvP', { PVP_MODE: 'demo' }],
    ['temporary PvP', { PVP_CONTENT_MODE: 'temporary-owner-accepted' }],
    ['development queue', { BULLMQ_PREFIX: 'numora:dev:fixture' }],
    ['wildcard queue', { BULLMQ_PREFIX: 'numora:prod:*' }],
    ['unencrypted Redis', { REDIS_URL: 'redis://default:TEST_ONLY@redis.example.test:6379' }],
    ['unauthenticated Redis', { REDIS_URL: 'rediss://redis.example.test:6379' }],
    ['public secret', { NEXT_PUBLIC_METRICS_TOKEN: 'NEVER PRINT PUBLIC SECRET' }],
    ['secret Auth key', { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_NEVER_PRINT' }],
    ['secret browser Auth key', { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_NEVER_PRINT' }],
    ['wrong web Auth origin', { NEXT_PUBLIC_SUPABASE_URL: 'https://different.example.test' }],
    ['wrong web Auth key', { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_other' }],
    ['wrong Auth transport', { SUPABASE_URL: 'http://auth.example.test' }],
    ['unsafe CORS', { CORS_ORIGINS: '*' }],
    ['non-canonical CORS', { CORS_ORIGINS: 'https://app.example.test/' }],
    ['empty pepper', { TEACHER_TOKEN_PEPPER: '' }],
    ['missing metrics token', { NUMORA_OBSERVABILITY_ENABLED: 'true' }],
    [
      'IRT source still old',
      {
        NUMORA_IRT_DATABASE_URL: fixture.DATABASE_URL!.replace(
          'db.example.test',
          'old.example.test',
        ),
      },
    ],
    [
      'VPS profile points to Supabase',
      {
        DATABASE_EXPECTED_HOST: `db.${ref}.supabase.co`,
        DATABASE_URL: fixture.DATABASE_URL!.replace('db.example.test', `db.${ref}.supabase.co`),
      },
    ],
  ];
  it.each(cases)('rejects %s without logging supplied secrets', (_label, change) => {
    let error: unknown;
    try {
      productionTarget('api', { ...fixture, ...change });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(startupFailureMessage(error)).not.toMatch(
      /TEST_ONLY_PASSWORD|NEVER PRINT|sb_secret_NEVER/,
    );
  });
  it('does not expose underlying connection/provider errors', () => {
    expect(startupFailureMessage(new Error('postgres://secret:password@host/db'))).not.toContain(
      'password',
    );
  });
});
it('requires the actual read-only catalog result to match role, identity and direct VPS TLS', () => {
  expect(() => assertRuntimeDatabaseState(state, target())).not.toThrow();
  for (const key of [
    'superuser',
    'createdb',
    'createrole',
    'replication',
    'bypassrls',
    'elevated_membership',
    'irt_member',
    'owns_domain',
    'owns_database',
    'can_create',
  ] as const)
    expect(() => assertRuntimeDatabaseState({ ...state, [key]: true }, target())).toThrow();
  for (const change of [
    { main_member: false },
    { tls: false },
    { login: 'other' },
    { actor: 'other' },
    { database: 'other' },
  ])
    expect(() => assertRuntimeDatabaseState({ ...state, ...change }, target())).toThrow();
  expect(() => assertRuntimeDatabaseState(undefined, target())).toThrow();
});
