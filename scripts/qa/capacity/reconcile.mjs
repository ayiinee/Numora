import { createRequire } from 'node:module';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

const requireDatabase = createRequire(
  new URL('../../../packages/database/package.json', import.meta.url),
);
const canonical = (value) => {
  if (Array.isArray(value)) return JSON.stringify(value.slice().sort());
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
};

export async function readReceipts(path) {
  const receipts = [];
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      receipts.push(JSON.parse(line));
    } catch {
      throw new Error('Invalid capacity receipt');
    }
  }
  return receipts;
}

export function reconcile(receipts, snapshots) {
  const found = new Map(snapshots.map((row) => [row.id, row]));
  const issues = [];
  const submits = new Map();
  let acknowledgedSaves = 0;
  for (const entry of receipts) {
    const { attemptId, actor } = entry;
    if (!attemptId) continue;
    const durable = found.get(attemptId);
    const kind = entry.kind.toUpperCase();
    if (!durable || durable.student_id !== actor || durable.assessment_type !== kind) {
      issues.push({ reason: 'attempt-owner-or-kind-mismatch', attemptId });
      continue;
    }
    if (entry.event === 'save') {
      acknowledgedSaves++;
      if (canonical(durable.answers?.[entry.questionInstanceId]) !== canonical(entry.answer)) {
        issues.push({ reason: 'acknowledged-answer-mismatch', attemptId });
      }
    }
    if (entry.event === 'submit' && [200, 201].includes(entry.status)) {
      submits.set(attemptId, entry);
      const expectedXp = kind === 'PRETEST' ? 0 : 1;
      const finalized =
        durable.status === 'GRADED' || (kind === 'TRYOUT' && durable.status === 'SUBMITTED');
      if (
        !finalized ||
        Number(durable.ledger_count) !== expectedXp ||
        Number(durable.outbox_count) !== 1 ||
        (entry.score !== null && Number(durable.score) !== entry.score) ||
        (entry.xp !== null && Number(durable.xp) !== entry.xp)
      ) {
        issues.push({ reason: 'acknowledged-finalization-mismatch', attemptId });
      }
    }
  }
  for (const row of snapshots) {
    if (
      (row.status === 'GRADED' ||
        (row.assessment_type === 'TRYOUT' && row.status === 'SUBMITTED')) &&
      !submits.has(row.id)
    ) {
      issues.push({ reason: 'commit-without-acknowledged-submit', attemptId: row.id });
    }
  }
  return {
    pass: issues.length === 0,
    attempts: snapshots.length,
    acknowledgedSaves,
    acknowledgedSubmits: submits.size,
    issueCount: issues.length,
    issues: issues.slice(0, 20),
  };
}

export function validateEvidenceUrl(rawUrl, config, environment) {
  if (!rawUrl) throw new Error('Assessment writers require a read-only evidence database');
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid evidence database URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== config.evidenceDatabaseHost ||
    (environment === 'dev'
      ? !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        !/^\/numora_test/.test(url.pathname)
      : !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode')))
  ) {
    throw new Error('Evidence database URL does not match the declared environment and host');
  }
  return rawUrl;
}

export async function capture(rawUrl, ids, explicit, since, receipts) {
  const postgres = requireDatabase('postgres');
  const sql = postgres(rawUrl, { max: 1, connect_timeout: 5, idle_timeout: 2, onnotice: () => {} });
  try {
    const snapshot = () =>
      sql.begin(
        'isolation level repeatable read read only',
        (tx) => tx`
      WITH candidates AS (
        SELECT id, student_id, assessment_type::text, status::text, score_0_100 AS score
        FROM assessment_attempts
        WHERE student_id = ANY(${tx.array(ids)}::uuid[])
          AND (started_at >= ${since}::timestamptz OR id = ANY(${tx.array(explicit)}::uuid[]))
      )
      SELECT c.*, x.ledger_count, x.xp, o.outbox_count, a.answers
      FROM candidates c
      LEFT JOIN LATERAL (
        SELECT count(*) AS ledger_count, max(xp_amount) AS xp FROM xp_ledger
        WHERE attempt_id = c.id
      ) x ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS outbox_count FROM analytics_outbox
        WHERE entity_id = c.id AND actor_user_id = c.student_id
          AND event_name = lower(c.assessment_type) || '_completed'
      ) o ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(item.id, answer.answer) AS answers
        FROM attempt_items item JOIN attempt_answers answer ON answer.attempt_item_id = item.id
        WHERE item.attempt_id = c.id
      ) a ON true
    `,
      );
    // The window captures committed requests whose client stopped before it could emit a receipt.
    let previous;
    let current = await snapshot();
    for (let sample = 0; sample < 3; sample++) {
      await delay(2000);
      previous = canonical(current.slice().sort((a, b) => a.id.localeCompare(b.id)));
      current = await snapshot();
      if (previous === canonical(current.slice().sort((a, b) => a.id.localeCompare(b.id)))) {
        return reconcile(receipts, current);
      }
    }
    return { ...reconcile(receipts, current), pass: false, unstableSnapshot: true };
  } finally {
    await sql.end({ timeout: 2 });
  }
}
