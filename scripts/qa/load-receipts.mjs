import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const kinds = new Set([
  'start_requested',
  'start_response',
  'answer_failed',
  'submit_requested',
  'submit_response',
  'iteration_finished',
]);

// Consume k6's durable JSON output, rather than console output or an end-of-iteration counter.
// Only controlled custom tags are retained; auth headers and response bodies are never receipts.
export async function readLoadReceipts(files) {
  const operations = new Map(),
    errors = [];
  for (const file of files) {
    let lineNumber = 0;
    for await (const line of createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    })) {
      lineNumber++;
      if (!line.trim()) continue;
      let point;
      try {
        point = JSON.parse(line);
      } catch {
        errors.push({ code: 'INVALID_JSON_LINE', line: lineNumber });
        continue;
      }
      if (point.type !== 'Point' || point.metric !== 'qa_client_event') continue;
      const t = point.data?.tags || {};
      if (
        !['load', 'stress'].includes(t.phase) ||
        !/^[a-zA-Z0-9_:.-]{1,160}$/.test(t.op_id || '') ||
        !kinds.has(t.kind) ||
        !uuid.test(t.actor_id || '') ||
        (t.attempt_id && !uuid.test(t.attempt_id)) ||
        (t.attempt_status !== undefined &&
          !['inProgress', 'completed', 'unknown'].includes(t.attempt_status)) ||
        (t.question_count !== undefined && !/^(?:-1|\d{1,4})$/.test(t.question_count))
      ) {
        errors.push({ code: 'INVALID_RECEIPT', line: lineNumber });
        continue;
      }
      const key = t.phase + ':' + t.op_id;
      let op = operations.get(key);
      if (!op) {
        op = { operationId: key, actorId: t.actor_id, attemptId: null, events: {} };
        operations.set(key, op);
      }
      if (
        op.actorId !== t.actor_id ||
        (op.attemptId && t.attempt_id && op.attemptId !== t.attempt_id)
      ) {
        errors.push({ code: 'RECEIPT_IDENTITY_CHANGED', operationId: key });
        continue;
      }
      if (op.events[t.kind]) errors.push({ code: 'DUPLICATE_LIFECYCLE_EVENT', operationId: key });
      if (t.attempt_id) op.attemptId = t.attempt_id;
      op.events[t.kind] = {
        at: point.data.time,
        status: Number(t.http_status || 0),
        errorCode: t.error_code || null,
        valid: t.valid === '1',
        score: t.score === undefined ? null : Number(t.score),
        xp: t.xp === undefined ? null : Number(t.xp),
        ...(t.attempt_status === undefined ? {} : { attemptStatus: t.attempt_status }),
        ...(t.question_count === undefined ? {} : { questionCount: Number(t.question_count) }),
      };
    }
  }
  return { operations: [...operations.values()], errors };
}

export function reconcileLoadReceipts(receipts, rows, acceptedCounter) {
  const failures = [...receipts.errors],
    incomplete = [],
    acknowledged = new Map();
  if (!receipts.operations.length) incomplete.push({ code: 'NO_CLIENT_RECEIPTS' });
  const byAttempt = new Map();
  for (const op of receipts.operations) {
    if (op.attemptId) {
      const list = byAttempt.get(op.attemptId) || [];
      list.push(op);
      byAttempt.set(op.attemptId, list);
    }
    const response = op.events.submit_response;
    if (response && !op.events.submit_requested)
      failures.push({ code: 'RESPONSE_WITHOUT_REQUEST', operationId: op.operationId });
    if (response?.status === 201) {
      if (!response.valid || !op.attemptId)
        failures.push({ code: 'INVALID_ACKNOWLEDGED_RESPONSE', operationId: op.operationId });
      else {
        const previous = acknowledged.get(op.attemptId);
        if (
          previous &&
          (previous.actorId !== op.actorId ||
            previous.response.score !== response.score ||
            previous.response.xp !== response.xp)
        )
          failures.push({ code: 'CONFLICTING_RECEIPTS', attemptId: op.attemptId });
        acknowledged.set(op.attemptId, { actorId: op.actorId, response });
      }
    }
  }
  const graded = rows.filter((r) => r.status === 'GRADED'),
    durable = new Map(rows.map((r) => [r.id, r]));
  const unacknowledgedGraded = [];
  for (const row of graded) {
    const ledger = row.ledger || [],
      events = row.events || [];
    if (ledger.length !== 1 || events.length !== 1)
      failures.push({ code: 'DUPLICATE_OR_MISSING_EFFECTS', attemptId: row.id });
    else if (
      ledger[0].studentId !== row.studentId ||
      ledger[0].sourceType !== 'DRILL' ||
      events[0].actorId !== row.studentId ||
      events[0].correlationId !== row.id ||
      Number(events[0].payload?.score) !== Number(row.score) ||
      Number(events[0].payload?.reward?.totalXp) !== Number(ledger[0].xp)
    )
      failures.push({ code: 'DURABLE_CONTENT_MISMATCH', attemptId: row.id });
    if (!acknowledged.has(row.id)) {
      const ops = byAttempt.get(row.id) || [];
      unacknowledgedGraded.push({
        attemptId: row.id,
        classification: ops.some((o) => o.events.submit_response)
          ? 'RESPONSE_FAILED_AFTER_COMMIT'
          : ops.some((o) => o.events.submit_requested)
            ? 'SUBMIT_INTERRUPTED_OR_RESPONSE_NOT_OBSERVED'
            : 'UNATTRIBUTED_COMMIT',
        operationIds: ops.map((o) => o.operationId),
      });
    }
  }
  for (const [id, ack] of acknowledged) {
    const row = durable.get(id);
    if (!row || row.status !== 'GRADED')
      failures.push({ code: 'ACKNOWLEDGED_RESULT_NOT_COMMITTED', attemptId: id });
    else if (
      row.studentId !== ack.actorId ||
      Number(row.score) !== ack.response.score ||
      Number(row.ledger?.[0]?.xp) !== ack.response.xp
    )
      failures.push({ code: 'ACKNOWLEDGED_CONTENT_MISMATCH', attemptId: id });
  }
  for (const op of receipts.operations)
    if (op.events.submit_requested && durable.get(op.attemptId)?.status !== 'GRADED')
      incomplete.push({
        code: 'SUBMISSION_NOT_FINAL_AT_SNAPSHOT',
        operationId: op.operationId,
        attemptId: op.attemptId,
      });
  // Preserve the original strict count gate as well as the stronger identity/content gate.
  if (graded.length !== acceptedCounter || unacknowledgedGraded.length)
    failures.push({ code: 'DATABASE_RECONCILIATION_FAILED' });
  const counts = {
    operations: receipts.operations.length,
    startRequests: receipts.operations.filter((o) => o.events.start_requested).length,
    submitRequests: receipts.operations.filter((o) => o.events.submit_requested).length,
    submitResponses: receipts.operations.filter((o) => o.events.submit_response).length,
    missingSubmitResponses: receipts.operations.filter(
      (o) => o.events.submit_requested && !o.events.submit_response,
    ).length,
    graded: graded.length,
    acknowledgedDistinctAttempts: acknowledged.size,
    acceptedCounter,
    broken: failures.filter((f) =>
      ['DUPLICATE_OR_MISSING_EFFECTS', 'DURABLE_CONTENT_MISMATCH'].includes(f.code),
    ).length,
  };
  return {
    status: failures.length ? 'FAIL' : incomplete.length ? 'BLOCKED' : 'PASS',
    counts,
    failures,
    incomplete,
    unacknowledgedGraded,
  };
}
