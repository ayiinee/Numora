import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLoadReceipts, reconcileLoadReceipts } from './load-receipts.mjs';
const student = '00000000-0000-4000-8000-000000000001',
  attempt = '00000000-0000-4000-8000-000000000002';
const row = () => ({
  id: attempt,
  studentId: student,
  status: 'GRADED',
  score: '80',
  ledger: [{ studentId: student, sourceType: 'DRILL', xp: '125' }],
  events: [
    { actorId: student, correlationId: attempt, payload: { score: 80, reward: { totalXp: 125 } } },
  ],
});
const op = (events = {}) => ({
  operationId: 'load:vus_10:1:0',
  actorId: student,
  attemptId: attempt,
  events: { start_requested: {}, start_response: { status: 201 }, submit_requested: {}, ...events },
});
const ack = () => op({ submit_response: { status: 201, valid: true, score: 80, xp: 125 } });
const check = (operations, rows, counter = 1, errors = []) =>
  reconcileLoadReceipts({ operations, errors }, rows, counter);
test('receipt identities and values agree with one immutable ledger/event', () =>
  assert.equal(check([ack()], [row()]).status, 'PASS'));
test('same counts cannot hide a foreign acknowledged attempt', () => {
  const a = ack();
  a.attemptId = '00000000-0000-4000-8000-000000000003';
  const r = check([a], [row()]);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.failures.some((x) => x.code === 'ACKNOWLEDGED_RESULT_NOT_COMMITTED'));
});
test('interrupted submit is attributed without inventing a successful response', () => {
  const r = check([op()], [row()], 0);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.counts.missingSubmitResponses, 1);
  assert.equal(
    r.unacknowledgedGraded[0].classification,
    'SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED',
  );
});
test('timeout response followed by commit remains unacknowledged', () => {
  const r = check(
    [op({ submit_response: { status: 0, valid: false, errorCode: '1050' } })],
    [row()],
    0,
  );
  assert.equal(r.status, 'FAIL');
  assert.equal(r.unacknowledgedGraded[0].classification, 'RESPONSE_FAILED_AFTER_COMMIT');
});
test('pending submit at snapshot is incomplete, not acceptance', () => {
  const r = row();
  r.status = 'IN_PROGRESS';
  r.ledger = [];
  r.events = [];
  assert.equal(check([op()], [r], 0).status, 'BLOCKED');
});
test('legacy counter disagreement still fails even when a receipt exists', () =>
  assert.equal(check([ack()], [row()], 0).status, 'FAIL'));
test('duplicate effects and payload/ownership drift are rejected', () => {
  for (const mutate of [
    (r) => r.ledger.push({ ...r.ledger[0] }),
    (r) => (r.events[0].payload.reward.totalXp = 124),
    (r) => (r.studentId = attempt),
  ]) {
    const r = row();
    mutate(r);
    assert.equal(check([ack()], [r]).status, 'FAIL');
  }
});
test('acknowledged response must follow a request; missing and malformed evidence cannot pass', () => {
  const a = ack();
  delete a.events.submit_requested;
  assert.equal(check([a], [row()]).status, 'FAIL');
  assert.equal(check([], [], 0).status, 'BLOCKED');
  assert.equal(check([ack()], [row()], 1, [{ code: 'INVALID_JSON_LINE' }]).status, 'FAIL');
});
test('stream reader keeps only controlled tags and rejects conflicting identities', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'numora-receipts-')),
    file = join(dir, 'stream.jsonl');
  const point = (kind, extra = {}) => ({
    type: 'Point',
    metric: 'qa_client_event',
    data: {
      time: '2026-10-28T00:00:00Z',
      tags: {
        phase: 'load',
        op_id: 'vus_10:1:0',
        actor_id: student,
        attempt_id: attempt,
        kind,
        ...extra,
      },
    },
  });
  try {
    writeFileSync(
      file,
      [
        JSON.stringify({
          type: 'Point',
          metric: 'http_reqs',
          data: { tags: { secret: 'NOT_RETAINED' } },
        }),
        JSON.stringify(point('submit_requested')),
        JSON.stringify(
          point('start_response', {
            http_status: '201',
            attempt_status: 'completed',
            question_count: '0',
            secret: 'NOT_RETAINED',
          }),
        ),
        JSON.stringify(
          point('submit_response', { http_status: '201', valid: '1', score: '80', xp: '125' }),
        ),
        JSON.stringify(point('iteration_finished', { actor_id: attempt })),
        'broken-json',
      ].join('\n'),
    );
    const r = await readLoadReceipts([file]);
    assert.equal(r.operations.length, 1);
    assert.equal(r.operations[0].events.submit_response.xp, 125);
    assert.equal(r.operations[0].events.start_response.attemptStatus, 'completed');
    assert.equal(r.operations[0].events.start_response.questionCount, 0);
    assert.deepEqual(
      r.errors.map((x) => x.code),
      ['RECEIPT_IDENTITY_CHANGED', 'INVALID_JSON_LINE'],
    );
    assert.ok(!JSON.stringify(r).includes('NOT_RETAINED'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stream reader rejects arbitrary status and nonnumeric question metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'numora-receipt-metadata-'));
  const file = join(dir, 'stream.jsonl');
  try {
    const points = [{ attempt_status: 'private payload' }, { question_count: 'NaN' }].map(
      (extra) => ({
        type: 'Point',
        metric: 'qa_client_event',
        data: {
          time: '2026-10-28T00:00:00Z',
          tags: {
            phase: 'load',
            op_id: 'vus_10:1:0',
            actor_id: student,
            kind: 'start_response',
            ...extra,
          },
        },
      }),
    );
    writeFileSync(file, points.map((p) => JSON.stringify(p)).join('\n'));
    assert.deepEqual(
      (await readLoadReceipts([file])).errors.map((e) => e.code),
      ['INVALID_RECEIPT', 'INVALID_RECEIPT'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
