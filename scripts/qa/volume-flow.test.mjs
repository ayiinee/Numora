import assert from 'node:assert/strict';
import test from 'node:test';
import { drainVolumeQueue, runVolumeStages, summarizeChecks } from './volume-flow.mjs';

test('blocked 10k stage prevents any 100k insertion and preserves three planned outcomes', async () => {
  const called = [];
  const checks = await runVolumeStages([1000, 10000, 100000], async ({ count }) => {
    called.push(count);
    return count === 10000 ? { status: 'BLOCKED', reason: 'drain bound' } : { status: 'PASS' };
  });
  assert.deepEqual(called, [1000, 10000]);
  assert.deepEqual(
    checks.map((c) => c.status),
    ['PASS', 'BLOCKED', 'NOT_RUN'],
  );
  assert.match(checks[2].reason, /PREVIOUS_STAGE_BLOCKED/);
  assert.deepEqual(summarizeChecks(checks), {
    passed: 1,
    failed: 0,
    blocked: 1,
    skipped: 1,
    total: 3,
  });
});

test('integrity failure stops escalation while preserving FAIL', async () => {
  let calls = 0;
  const checks = await runVolumeStages([1000, 10000, 100000], async () => {
    calls++;
    return { status: 'FAIL', reason: 'payload mismatch' };
  });
  assert.equal(calls, 1);
  assert.deepEqual(summarizeChecks(checks), {
    passed: 0,
    failed: 1,
    blocked: 0,
    skipped: 2,
    total: 3,
  });
});

test('all stages may run when previous identity/content reconciliation passes', async () => {
  const called = [];
  const checks = await runVolumeStages([1000, 10000, 100000], async ({ count }) => {
    called.push(count);
    return { status: 'PASS' };
  });
  assert.deepEqual(called, [1000, 10000, 100000]);
  assert.equal(summarizeChecks(checks).passed, 3);
});

test('invalid or missing evidence and invalid plans cannot silently pass', async () => {
  for (const sizes of [[], [0], [1000, 1000], [10000, 1000], [1.5]])
    await assert.rejects(
      runVolumeStages(sizes, async () => ({ status: 'PASS' })),
      /INVALID_VOLUME_STAGES/,
    );
  for (const outcome of [undefined, {}, { status: 'NOT_RUN' }, { status: 'UNKNOWN' }])
    await assert.rejects(
      runVolumeStages([1000], async () => outcome),
      /INVALID_VOLUME_STAGE_OUTCOME/,
    );
  await assert.rejects(
    runVolumeStages([1000], async () => {
      throw new Error('runner crashed');
    }),
    /runner crashed/,
  );
  assert.throws(() => summarizeChecks([]), /EMPTY_CHECKS/);
  assert.throws(() => summarizeChecks([{ status: 'UNKNOWN' }]), /UNKNOWN_CHECK_STATUS/);
});

test('NOT_RUN maps to skipped and is never counted as passed', () => {
  assert.deepEqual(summarizeChecks([{ status: 'NOT_RUN' }]), {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 1,
    total: 1,
  });
});

function queueFixture({
  count = 40,
  batchMs = 100,
  budgetMs = 1000,
  sampleIntervalMs = 1000,
} = {}) {
  let time = 0,
    left = count,
    snapshots = 0;
  const batchSizes = [],
    samples = [];
  return {
    args: {
      budgetMs,
      sampleIntervalMs,
      clock: () => time,
      pending: async () => left > 0,
      snapshot: async () => {
        snapshots++;
        return { total: count, pending: left, oldest_seconds: left ? 1 : 0 };
      },
      drainBatch: async (size) => {
        batchSizes.push(size);
        left = Math.max(0, left - size);
        time += batchMs;
      },
      onSnapshot: (state) => samples.push(state),
    },
    batchSizes,
    samples,
    snapshots: () => snapshots,
  };
}

test('fast drain uses probes and final counts without full COUNT per batch', async () => {
  const f = queueFixture();
  const result = await drainVolumeQueue(f.args);
  assert.equal(result.pending, 0);
  assert.deepEqual(f.batchSizes, [10, 10, 10, 10]);
  assert.equal(f.snapshots(), 2);
  assert.equal(f.samples.at(-1).final, true);
});

test('deadline retains backlog evidence and does not start another batch', async () => {
  const f = queueFixture({ count: 100, budgetMs: 200 });
  await assert.rejects(drainVolumeQueue(f.args), (error) => {
    assert.equal(error.code, 'EXPERIMENT_INCOMPLETE');
    assert.equal(error.remaining.pending, 80);
    return true;
  });
  assert.equal(f.batchSizes.length, 2);
  assert.equal(f.samples.at(-1).pending, 80);
  assert.equal(f.samples.at(-1).final, true);
});

test('a slow probe exhausting the budget cannot start a new batch', async () => {
  let time = 0,
    batches = 0;
  await assert.rejects(
    drainVolumeQueue({
      budgetMs: 120000,
      clock: () => time,
      pending: async () => {
        time = 120001;
        return true;
      },
      drainBatch: async () => {
        batches++;
      },
      snapshot: async () => ({ total: 1000, pending: 1000, oldest_seconds: 1 }),
    }),
    { code: 'EXPERIMENT_INCOMPLETE' },
  );
  assert.equal(batches, 0);
});

test('a final in-flight batch finishing late is incomplete even if pending becomes zero', async () => {
  const f = queueFixture({ count: 10, batchMs: 120001, budgetMs: 120000 });
  await assert.rejects(drainVolumeQueue(f.args), (error) => {
    assert.equal(error.code, 'EXPERIMENT_INCOMPLETE');
    assert.equal(error.remaining.pending, 0);
    assert.equal(error.elapsedMs, 120001);
    return true;
  });
  assert.equal(f.batchSizes.length, 1);
});

test('periodic samples include age/count and final evidence is unconditional', async () => {
  const f = queueFixture({ count: 100, batchMs: 250, budgetMs: 3000 });
  await drainVolumeQueue(f.args);
  assert.equal(f.snapshots(), 4); // initial, ~1s, ~2s, final
  assert.deepEqual(
    f.samples.map((s) => s.pending),
    [100, 60, 20, 0],
  );
  assert.equal(f.samples.at(-1).final, true);
});

test('empty probe cannot replace final count evidence or claim drain success', async () => {
  let snapshots = 0;
  await assert.rejects(
    drainVolumeQueue({
      budgetMs: 1000,
      pending: async () => false,
      drainBatch: async () => {
        assert.fail('must not drain after empty probe');
      },
      snapshot: async () => {
        snapshots++;
        return { total: 3, pending: 3, oldest_seconds: 1 };
      },
    }),
    { code: 'EXPERIMENT_INCOMPLETE' },
  );
  assert.equal(snapshots, 2);
});

test('invalid snapshot, probe and sampling bounds cannot produce success', async () => {
  const base = queueFixture().args;
  await assert.rejects(drainVolumeQueue({ ...base, budgetMs: 0 }), /INVALID_VOLUME_DRAIN_BOUND/);
  await assert.rejects(
    drainVolumeQueue({ ...base, sampleIntervalMs: 0 }),
    /INVALID_VOLUME_DRAIN_BOUND/,
  );
  await assert.rejects(
    drainVolumeQueue({
      ...base,
      snapshot: async () => ({ total: 1, pending: 2, oldest_seconds: 1 }),
    }),
    /INVALID_VOLUME_SNAPSHOT/,
  );
  await assert.rejects(
    drainVolumeQueue({ ...base, pending: async () => undefined }),
    /INVALID_VOLUME_PENDING_PROBE/,
  );
});
