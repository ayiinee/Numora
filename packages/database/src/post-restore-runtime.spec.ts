import { expect, it } from 'vitest';
import { assertRestoredTarget, restoreEvidence } from './post-restore-runtime.js';
import type { ProductionTarget } from './production-runtime.js';

const sha = 'a'.repeat(64),
  manifest = 'b'.repeat(64);
const target: ProductionTarget = {
  profile: 'production-vps',
  host: 'localhost',
  port: 5432,
  database: 'numora_production',
  login: 'numora_api',
  databaseRole: 'numora_api',
};
const report = {
  format: 'NUMORA_VPS_RESTORE_REPORT_V1',
  result: 'PASS',
  runtimeReady: false,
  connectionFence: 'REMAINS_CLOSED',
  planSha256: sha,
  manifestSha256: manifest,
  target: {
    host: 'localhost',
    port: 5432,
    database: 'numora_production',
    owner: 'numora_owner',
    login: 'numora_migrator',
  },
};
const plan = {
  format: 'NUMORA_VPS_RESTORE_PLAN_V1',
  manifestSha256: manifest,
  access: [{ kind: 'SCHEMA' }],
};
const evidence = () => restoreEvidence(report, plan, { reportSha256: sha, planSha256: sha });

it('binds a successful fenced restore to the exact consumed plan and manifest', () => {
  expect(evidence().manifestSha256).toBe(manifest);
  for (const change of [
    { result: 'FAIL' },
    { runtimeReady: true },
    { connectionFence: 'OPEN' },
    { planSha256: 'c'.repeat(64) },
    { manifestSha256: 'c'.repeat(64) },
    { target: { ...report.target, host: undefined } },
  ])
    expect(() =>
      restoreEvidence({ ...report, ...change }, plan, { reportSha256: sha, planSha256: sha }),
    ).toThrow(/matching PASS/);
  expect(() =>
    restoreEvidence(
      report,
      { ...plan, manifestSha256: 'c'.repeat(64) },
      { reportSha256: sha, planSha256: sha },
    ),
  ).toThrow(/matching PASS/);
});

it('rejects a different endpoint, database, service login or deployment profile', () => {
  assertRestoredTarget('api', target, evidence());
  for (const change of [
    { host: 'other.example.test' },
    { port: 5433 },
    { database: 'other' },
    { login: 'numora_worker' },
    { databaseRole: 'numora_owner' },
    { profile: 'production-supabase' as const },
  ])
    expect(() => assertRestoredTarget('api', { ...target, ...change }, evidence())).toThrow(
      /own VPS login/,
    );
  expect(() => assertRestoredTarget('worker', target, evidence())).toThrow(/own VPS login/);
});
