import { analyticsEvents, analyticsOutbox, getDatabase } from '@tka/database';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

const ready = or(isNull(analyticsOutbox.failedAt),
  sql`${analyticsOutbox.failedAt} <= clock_timestamp() - interval '5 minutes'`);

export async function outboxStatus() {
  const { db } = getDatabase();
  const [status] = await db.select({
    pending: sql<number>`count(*)::integer`,
    failed: sql<number>`count(*) filter (where ${analyticsOutbox.failedAt} is not null)::integer`,
    retryReady: sql<number>`count(*) filter (where ${ready})::integer`,
    oldestPendingSeconds: sql<number>`coalesce(greatest(0, extract(epoch from clock_timestamp() - min(${analyticsOutbox.occurredAt}))), 0)::integer`,
    oldestFailedSeconds: sql<number>`coalesce(greatest(0, extract(epoch from clock_timestamp() - min(${analyticsOutbox.failedAt}))), 0)::integer`,
  }).from(analyticsOutbox).where(isNull(analyticsOutbox.processedAt));
  return { ...status!, coolingDown: status!.pending - status!.retryReady };
}

export async function drainOutboxBatch(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('OUTBOX_LIMIT_INVALID');
  const { db } = getDatabase();
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < limit; index++) {
    let selectedId: string | undefined;
    try {
      const found = await db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(analyticsOutbox)
          .where(and(
            isNull(analyticsOutbox.processedAt),
            ready,
          ))
          .orderBy(asc(analyticsOutbox.occurredAt), asc(analyticsOutbox.id))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!event) return false;
        selectedId = event.id;
        await tx.insert(analyticsEvents).values({
          eventId: event.id, correlationId: event.correlationId,
          eventName: event.eventName,
          eventVersion: event.eventVersion,
          actorUserId: event.actorUserId,
          occurredAt: event.occurredAt,
          entityType: event.entityType,
          entityId: event.entityId,
          payload: event.payload,
        }).onConflictDoNothing({ target: analyticsEvents.eventId });
        await tx.update(analyticsOutbox)
          .set({ processedAt: sql`clock_timestamp()`, failedAt: null })
          .where(eq(analyticsOutbox.id, event.id));
        return true;
      });
      if (!found) break;
      processed++;
    } catch {
      failed++;
      if (selectedId)
        await db.update(analyticsOutbox)
          .set({ failedAt: sql`clock_timestamp()` })
          .where(and(eq(analyticsOutbox.id, selectedId), isNull(analyticsOutbox.processedAt)));
      console.error('[outbox] delivery failed', {
        eventId: selectedId ?? null,
        reason: 'DELIVERY_FAILED',
      });
    }
  }
  return { processed, failed };
}
