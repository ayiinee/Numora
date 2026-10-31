import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, sanitize } from './core.mjs';
import { pnpmCommand, childEnvironment } from './process.mjs';

export function catalogTests(report) {
  const tests = [];
  const visit = (suite) => {
    for (const spec of suite.specs || [])
      for (const test of spec.tests || []) {
        assert.ok(typeof spec.id === 'string' && spec.id.length > 0, 'MISSING_BROWSER_CASE_ID');
        tests.push({
          id: spec.id + ':' + (test.projectId || test.projectName || ''),
          file: spec.file,
          expectedStatus: test.expectedStatus,
          results: test.results || [],
        });
      }
    for (const child of suite.suites || []) visit(child);
  };
  for (const suite of report.suites || []) visit(suite);
  assert.equal(report.errors?.length || 0, 0, 'BROWSER_REPORT_ERRORS');
  return tests;
}

export function verifyPartition(all, shards) {
  const expected = new Set(all.map((t) => t.id));
  assert.ok(expected.size > 0, 'EMPTY_BROWSER_CATALOG');
  assert.equal(expected.size, all.length, 'DUPLICATE_CATALOG_ID');
  assert.ok(all.every((t) => t.expectedStatus === 'passed'), 'SKIPPED_BROWSER_CASE');
  const seen = new Set();
  for (const shard of shards) {
    assert.ok(shard.length > 0, 'EMPTY_BROWSER_SHARD');
    for (const test of shard) {
      assert.ok(expected.has(test.id), 'UNKNOWN_SHARD_CASE');
      assert.ok(!seen.has(test.id), 'DUPLICATE_SHARD_CASE');
      seen.add(test.id);
    }
  }
  assert.deepEqual([...seen].sort(), [...expected].sort(), 'MISSING_SHARD_CASE');
  return { total: all.length, shards: shards.map((tests) => tests.map((t) => t.id)) };
}

export function verifyExecuted(expected, actual) {
  assert.deepEqual(
    actual.map((t) => t.id).sort(),
    [...expected].sort(),
    'EXECUTED_SELECTION_CHANGED',
  );
  assert.ok(actual.length > 0, 'EMPTY_BROWSER_RESULT');
  for (const test of actual) {
    assert.equal(test.expectedStatus, 'passed', 'SKIPPED_BROWSER_CASE');
    assert.equal(test.results.length, 1, 'MISSING_OR_RETRIED_BROWSER_CASE');
    assert.equal(test.results[0].status, 'passed', 'BROWSER_CASE_NOT_PASSED');
  }
  return { passed: actual.length, failed: 0, skipped: 0 };
}

function main() {
  const root = process.cwd();
  const mode = process.argv[2] || 'plan';
  const planPath = resolve(root, '.tmp/browser-shards.json');
  if (mode === 'plan') {
    const list = (shard) => {
      const args = ['exec', 'playwright', 'test', '--fully-parallel', '--list', '--reporter=json'];
      if (shard) args.push('--shard=' + shard + '/2');
      const [binary, command] = pnpmCommand(root, args);
      const env = childEnvironment();
      delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
      delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
      delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
      const output = execFileSync(binary, command, {
        cwd: resolve(root, 'apps/web'),
        env,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      return catalogTests(JSON.parse(output));
    };
    const plan = verifyPartition(list(), [list(1), list(2)]);
    writeJson(planPath, plan);
    console.log(JSON.stringify({ total: plan.total, shardCounts: plan.shards.map((s) => s.length) }));
  } else if (mode === 'verify') {
    const shard = Number(process.argv[3]);
    assert.ok(shard === 1 || shard === 2, 'INVALID_BROWSER_SHARD');
    const plan = readJson(planPath);
    const output = resolve(root, '.tmp/browser-result-' + shard + '.json');
    try {
      const report = readJson(resolve(root, '.tmp/browser-e2e-' + shard + '.json'));
      const counts = verifyExecuted(plan.shards[shard - 1], catalogTests(report));
      writeJson(output, { shard, status: 'PASS', ...counts, ids: plan.shards[shard - 1] });
      console.log(JSON.stringify({ shard, ...counts }));
    } catch (error) {
      writeJson(output, { shard, status: 'FAIL', reason: sanitize(error.message) });
      throw error;
    }
  } else throw Error('UNKNOWN_BROWSER_SHARD_OPERATION');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
