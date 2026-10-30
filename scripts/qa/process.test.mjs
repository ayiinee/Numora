import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { testEnvironment, runProcess, supportedQaNode } from './process.mjs';
import { parsePlaywright, parseVitest } from './adapters.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('QA runtime enforces the patched Node 24 floor', () => {
  for (const version of ['24.22.1', '24.22.2', '24.23.0'])
    assert.equal(supportedQaNode(version), true);
  for (const version of ['24.14.1', '24.22.0', '22.22.2', '25.0.0', 'invalid'])
    assert.equal(supportedQaNode(version), false);
});
const safe = {
  NODE_ENV: 'test',
  TEST_DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:5432/numora_test?sslmode=disable',
  TEST_REDIS_URL: 'redis://127.0.0.1:6379',
  BULLMQ_PREFIX: 'numora:test:fixture',
  DATABASE_URL: '',
  REDIS_URL: '',
  DATABASE_MIGRATION_URL: '',
};
test('test environment accepts dedicated local targets and rejects runtime/cloud fallback', () => {
  assert.deepEqual(testEnvironment(root, safe).problems, []);
  for (const mutation of [
    { NODE_ENV: 'development' },
    { TEST_DATABASE_URL: 'postgres://fixture@db.example/numora_test' },
    { TEST_DATABASE_URL: 'postgres://fixture@localhost/production' },
    { TEST_REDIS_URL: 'redis://localhost.example:6379' },
    { BULLMQ_PREFIX: 'numora:dev:fixture' },
    { DATABASE_URL: 'postgres://cloud/real' },
    { DATABASE_MIGRATION_URL: 'postgres://fixture@localhost/other' },
  ])
    assert.ok(testEnvironment(root, { ...safe, ...mutation }).problems.length > 0);
});
test('machine parsers preserve skipped/flaky and verify every selected Vitest file', () => {
  assert.deepEqual(
    parsePlaywright({ stats: { expected: 2, unexpected: 1, skipped: 1, flaky: 1 } }),
    { passed: 2, failed: 2, skipped: 1, total: 5 },
  );
  const data = { testResults: [{ name: 'C:\\repo\\one.test.ts' }] };
  assert.equal(parseVitest(data, ['one.test.ts']), data);
  assert.equal(parseVitest(data, ['one.test.ts', 'missing.test.ts']), null);
});
test('owned subprocess timeout stops work and is explicitly recorded', async () => {
  const result = await runProcess(root, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeoutMs: 250,
  });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
});
test('subprocess failure is not converted into success', async () => {
  const result = await runProcess(
    root,
    process.execPath,
    ['-e', 'console.error("fixture failure"); process.exit(3)'],
    { timeoutMs: 3000 },
  );
  assert.equal(result.code, 3);
  assert.ok(result.output.includes('fixture failure'));
});

test('pre-aborted work never starts a child or produces false evidence', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runProcess(
    root,
    process.execPath,
    ['-e', 'throw new Error("must not run")'],
    { signal: controller.signal },
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.code, null);
  assert.equal(result.output, '');
});
