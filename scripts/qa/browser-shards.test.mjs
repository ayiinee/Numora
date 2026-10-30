import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogTests, verifyPartition, verifyExecuted } from './browser-shards.mjs';
const item = (id, status = 'passed') => ({ id, expectedStatus: 'passed', results: [{ status }] });

test('browser partition rejects missing, duplicate and empty selections', () => {
  const all = [item('a'), item('b')];
  assert.equal(verifyPartition(all, [[all[0]], [all[1]]]).total, 2);
  assert.throws(() => verifyPartition(all, [[all[0]], [all[0]]]), /DUPLICATE_SHARD_CASE/);
  assert.throws(() => verifyPartition(all, [[all[0]]]), /MISSING_SHARD_CASE/);
  assert.throws(() => verifyPartition(all, [[all[0]], []]), /EMPTY_BROWSER_SHARD/);
});

test('browser execution requires exact identities and positive passed evidence', () => {
  assert.deepEqual(verifyExecuted(['a'], [item('a')]), { passed: 1, failed: 0, skipped: 0 });
  assert.throws(() => verifyExecuted(['a'], [item('b')]), /EXECUTED_SELECTION_CHANGED/);
  assert.throws(() => verifyExecuted(['a'], [item('a', 'interrupted')]), /BROWSER_CASE_NOT_PASSED/);
  assert.throws(() => verifyExecuted(['a'], [{ ...item('a'), results: [] }]), /MISSING_OR_RETRIED/);
});

test('browser skipped or retried outcomes cannot satisfy required acceptance', () => {
  assert.throws(() => verifyExecuted(['a'], [{ ...item('a'), expectedStatus: 'skipped' }]), /SKIPPED/);
  assert.throws(() => verifyExecuted(['a'], [{ ...item('a'), results: [{ status: 'failed' }, { status: 'passed' }] }]), /MISSING_OR_RETRIED/);
});

test('browser catalog rejects report errors and unidentified cases', () => {
  assert.throws(() => catalogTests({ errors: [{ message: 'global timeout' }] }), /BROWSER_REPORT_ERRORS/);
  assert.throws(() => catalogTests({ suites: [{ specs: [{ tests: [{}] }] }] }), /MISSING_BROWSER_CASE_ID/);
});
