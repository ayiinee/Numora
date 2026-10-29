import { assessmentAttempts, assessmentPackages, getDatabase } from '@tka/database';
import { finalizeTryout } from '@tka/assessment-engine';
import { and, asc, eq, sql } from 'drizzle-orm';

const deadline = sql`least(${assessmentAttempts.deadlineAt}, ${assessmentPackages.closeAt})`;
const overdue = and(
  eq(assessmentAttempts.assessmentType, 'TRYOUT'),
  eq(assessmentAttempts.status, 'IN_PROGRESS'),
  sql`${deadline} <= clock_timestamp()`,
);

export type RecoveryCursor = { deadlineAt: string; id: string };

export async function recoverOverdueTryouts(limit = 100, after?: RecoveryCursor) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('TRYOUT_RECOVERY_LIMIT_INVALID');
  const { db } = getDatabase();
  const candidates = await db
    .select({ id: assessmentAttempts.id, deadlineAt: sql<string>`${deadline}::text` })
    .from(assessmentAttempts)
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
    .where(
      and(
        overdue,
        after
          ? sql`(${deadline}, ${assessmentAttempts.id}) > (${after.deadlineAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(deadline), asc(assessmentAttempts.id))
    .limit(limit);
  let finalized = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    try {
      const result = await finalizeTryout({
        kind: 'automatic',
        attemptId: candidate.id,
        skipLocked: true,
      });
      if (result.finalized) finalized++;
      else skipped++;
    } catch {
      // A malformed attempt rolls back alone; other attempts in the batch still recover.
      failed++;
    }
  }
  await advanceTryoutBatches();
  const [backlog] = await db
    .select({
      total: sql<number>`count(*)::integer`,
      oldestSeconds: sql<number>`coalesce(greatest(0, extract(epoch from clock_timestamp() - min(${deadline}))), 0)::integer`,
    })
    .from(assessmentAttempts)
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
    .where(overdue);
  return {
    scanned: candidates.length,
    finalized,
    failed,
    skipped,
    // Advance even past malformed/locked attempts; reset after the last page so they retry.
    nextCursor: candidates.length === limit ? candidates.at(-1) : undefined,
    backlog: backlog?.total ?? 0,
    oldestOverdueSeconds: backlog?.oldestSeconds ?? 0,
  };
}

export async function advanceTryoutBatches() {
  return getDatabase().client.begin(async (tx) => {
    const batches = await tx<{ id: string; package_id: string; next_status: string }[]>`
      SELECT b.id,b.package_id,CASE WHEN b.cutoff_at<=clock_timestamp() THEN 'CLOSED' ELSE 'OPEN' END AS next_status
      FROM tryout_batches b WHERE b.status IN ('PLANNED','OPEN') AND b.starts_at<=clock_timestamp()
      AND (b.status='PLANNED' OR b.cutoff_at<=clock_timestamp())
      AND (b.cutoff_at>clock_timestamp() OR NOT EXISTS(SELECT 1 FROM assessment_attempts a WHERE a.package_id=b.package_id AND a.purpose='REGULAR' AND a.status IN ('IN_PROGRESS','SUBMITTED')))
      ORDER BY b.cutoff_at,b.id LIMIT 100 FOR UPDATE OF b SKIP LOCKED`;
    for (const batch of batches) {
      await tx`UPDATE tryout_batches SET status=${batch.next_status} WHERE id=${batch.id}`;
      await tx`INSERT INTO analytics_outbox(event_name,event_version,entity_type,entity_id,payload) VALUES(${batch.next_status === 'CLOSED' ? 'tryout.batch_closed' : 'tryout.batch_opened'},'3','tryout_batch',${batch.id},${JSON.stringify({ packageId: batch.package_id })}::text::jsonb)`;
    }
    return batches.length;
  });
}
