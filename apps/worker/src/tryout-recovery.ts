import { assessmentAttempts, getDatabase } from '@tka/database';
import { finalizeTryout } from '@tka/assessment-engine';
import { and, asc, eq, sql } from 'drizzle-orm';

const overdue = and(eq(assessmentAttempts.assessmentType, 'TRYOUT'),
  eq(assessmentAttempts.status, 'IN_PROGRESS'),
  sql`${assessmentAttempts.deadlineAt} <= clock_timestamp()`);

export type RecoveryCursor = { deadlineAt: string; id: string };

export async function recoverOverdueTryouts(limit = 100, after?: RecoveryCursor) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('TRYOUT_RECOVERY_LIMIT_INVALID');
  const { db } = getDatabase();
  const candidates = await db.select({ id: assessmentAttempts.id,
    deadlineAt: sql<string>`${assessmentAttempts.deadlineAt}::text` }).from(assessmentAttempts)
    .where(and(overdue, after ? sql`(${assessmentAttempts.deadlineAt}, ${assessmentAttempts.id}) > (${after.deadlineAt}::timestamptz, ${after.id}::uuid)` : undefined)).orderBy(asc(assessmentAttempts.deadlineAt), asc(assessmentAttempts.id)).limit(limit);
  let finalized = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    try {
      const result = await finalizeTryout({ kind: 'automatic', attemptId: candidate.id, skipLocked: true });
      if (result.finalized) finalized++;
      else skipped++;
    } catch {
      // A malformed attempt rolls back alone; other attempts in the batch still recover.
      failed++;
    }
  }
  const [backlog] = await db.select({
    total: sql<number>`count(*)::integer`,
    oldestSeconds: sql<number>`coalesce(greatest(0, extract(epoch from clock_timestamp() - min(${assessmentAttempts.deadlineAt}))), 0)::integer`,
  }).from(assessmentAttempts).where(overdue);
  return { scanned: candidates.length, finalized, failed, skipped,
    // Advance even past malformed/locked attempts; reset after the last page so they retry.
    nextCursor: candidates.length === limit ? candidates.at(-1) : undefined,
    backlog: backlog?.total ?? 0, oldestOverdueSeconds: backlog?.oldestSeconds ?? 0 };
}
