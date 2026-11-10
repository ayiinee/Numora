import test from 'node:test';
import assert from 'node:assert/strict';
import {
  respondentUuid,
  freezeCalibrationResearch,
  notifyCalibrationResearch,
  inspectCalibrationDelivery,
} from './calibration-research.mjs';

test('pseudonyms are stable and separated by context and key version', () => {
  const secret = 'private-test-only'.repeat(3);
  const base = respondentUuid(secret, 'v1', 'context-a', 'student-a');
  assert.match(base, /^[0-9a-f-]{36}$/);
  assert.equal(base, respondentUuid(secret, 'v1', 'context-a', 'student-a'));
  assert.notEqual(base, respondentUuid(secret, 'v2', 'context-a', 'student-a'));
  assert.notEqual(base, respondentUuid(secret, 'v1', 'context-b', 'student-a'));
  assert.throws(() => respondentUuid('short', 'v1', 'a', 'b'), /NOT_CONFIGURED/);
});

test('preflight uses a read-only transaction and rejects a caller-selected subset', async () => {
  const previous = process.env.NUMORA_IRT_RESEARCH_ENABLED;
  process.env.NUMORA_IRT_RESEARCH_ENABLED = 'true';
  try {
    let query = 0;
    const date = new Date('2026-11-08T00:00:00Z');
    const sql = {
      begin: async (options, fn) => {
        assert.equal(options, 'isolation level repeatable read read only');
        return fn(async (strings) => {
          assert.match(strings.join(''), /^SELECT/);
          return query++ === 0
            ? [
                {
                  ecosystem: 'TRYOUT',
                  tryout_batch_id: 'batch',
                  revision: 1, batch_status:'CLOSED',
                  starts_at: date,
                  cutoff_at: date,
                  result_due_at: date,
                  captured_at: date,
                },
              ]
            : [{ id: 'not-in-caller-list', student_id: 'student', status: 'GRADED' }];
        });
      },
    };
    const report = await inspectCalibrationDelivery(
      sql,
      {
        ecosystem: 'TRYOUT',
        comparisons: [],
        respondents: [],
        context: { batchId: 'batch', revision: 1 },
        window: {
          startsAt: date.toISOString(),
          collectionCutoffAt: date.toISOString(),
          resultDueAt: date.toISOString(),
          gradingCutoffAt: date.toISOString(),
        },
      },
      {},
      {},
      {},
    );
    assert.deepEqual(report.blockers, ['IRT_CANONICAL_COVERAGE_MISMATCH']);
    assert.equal(report.sourceComplete, false);
    assert.equal(report.scientificGate, 'NOT_EVALUATED');
    assert.equal(report.productionApproved, false);
  } finally {
    if (previous === undefined) delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    else process.env.NUMORA_IRT_RESEARCH_ENABLED = previous;
  }
});

test('canonical adapter and HTTP remain disabled by default', async () => {
  const previous = process.env.NUMORA_IRT_RESEARCH_ENABLED;
  delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
  try {
    await assert.rejects(
      freezeCalibrationResearch(null, null, null, null, {}),
      /IRT_RESEARCH_DISABLED/,
    );
    await assert.rejects(notifyCalibrationResearch({}, {}), /IRT_RESEARCH_DISABLED/);
  } finally {
    if (previous === undefined) delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    else process.env.NUMORA_IRT_RESEARCH_ENABLED = previous;
  }
});

test('canonical adapter rejects an unregistered package before reading grades', async () => {
  const previous = process.env.NUMORA_IRT_RESEARCH_ENABLED;
  process.env.NUMORA_IRT_RESEARCH_ENABLED = 'true';
  try {
    let query = 0;
    const date = new Date('2026-11-08T00:00:00Z');
    const sql = {
      begin: async (_options, fn) =>
        fn(async () =>
          query++ === 0
            ? [
                {
                  ecosystem: 'TRYOUT',
                  tryout_batch_id: 'batch',
                  revision: 1, batch_status:'CLOSED',
                  starts_at: date,
                  cutoff_at: date,
                  result_due_at: date,
                  captured_at: date,
                },
              ]
            : [],
        ),
    };
    await assert.rejects(
      freezeCalibrationResearch(
        sql,
        {
          ecosystem: 'TRYOUT',
          comparisons: [],
          respondents: [],
          window: {
            startsAt: date.toISOString(),
            collectionCutoffAt: date.toISOString(),
            gradingCutoffAt: date.toISOString(),
            resultDueAt: date.toISOString(),
          },
          context: { batchId: 'batch', revision: 1 },
          packages: [{ packageId: 'unknown' }],
        },
        null,
        null,
        {},
      ),
      /IRT_CANONICAL_MANIFEST_MISMATCH/,
    );
  } finally {
    if (previous === undefined) delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    else process.env.NUMORA_IRT_RESEARCH_ENABLED = previous;
  }
});
