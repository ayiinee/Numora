import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  analyticsEvents,
  analyticsOutbox,
  closeDatabaseConnection,
  getDatabase,
} from '@tka/database';
import { drainOutboxBatch, outboxStatus } from './outbox.js';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('durable analytics outbox', () => {
  afterAll(async () => closeDatabaseConnection());

  it('records an event once and safely retries duplicate delivery', async () => {
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const [event] = await db.insert(analyticsOutbox).values({
      eventName: 'drill_completed',
      entityType: 'assessmentAttempt',
      entityId: randomUUID(), correlationId: randomUUID(),
      payload: { score: 80 },
      occurredAt: new Date('2020-01-01T00:00:00.000Z'),
    }).returning({ id: analyticsOutbox.id });
    expect(await drainOutboxBatch(1)).toEqual({ processed: 1, failed: 0 });
    expect(await db.select().from(analyticsEvents)
      .where(eq(analyticsEvents.eventId, event!.id))).toHaveLength(1);
    const [processed] = await db.select().from(analyticsOutbox)
      .where(eq(analyticsOutbox.id, event!.id));
    expect(processed?.processedAt).toBeInstanceOf(Date);
    expect((await db.select().from(analyticsEvents).where(eq(analyticsEvents.eventId, event!.id)))[0]?.correlationId)
      .toBe(processed!.correlationId);
    await db.update(analyticsOutbox)
      .set({ processedAt: null })
      .where(eq(analyticsOutbox.id, event!.id));
    expect(await drainOutboxBatch(1)).toEqual({ processed: 1, failed: 0 });
    expect(await db.select().from(analyticsEvents)
      .where(eq(analyticsEvents.eventId, event!.id))).toHaveLength(1);
  });
  it('reports cooldown/backlog, rolls delivery back, and retries concurrently without a duplicate', async () => {
    const { db } = getDatabase();
    await expect(drainOutboxBatch(0)).rejects.toThrow('OUTBOX_LIMIT_INVALID');
    const [event] = await db.insert(analyticsOutbox).values({ eventName: 'drill_submitted',
      entityType: 'assessmentAttempt', entityId: randomUUID(), correlationId: randomUUID(),
      occurredAt: new Date(Date.now() - 600_000), payload: { fixture: true } }).returning();
    const name = `test_consumer_${randomUUID().replaceAll('-', '')}`;
    await db.execute(sql.raw(`create function ${name}() returns trigger language plpgsql as $$ begin
      if NEW.id = '${event!.id}'::uuid and NEW.processed_at is not null then
        raise exception 'TEST ONLY acknowledgment unavailable'; end if; return NEW; end $$`));
    await db.execute(sql.raw(`create trigger ${name} before update on analytics_outbox
      for each row execute function ${name}()`));
    try {
      expect(await drainOutboxBatch(1)).toEqual({ processed: 0, failed: 1 });
      expect(await db.select().from(analyticsEvents).where(eq(analyticsEvents.eventId, event!.id))).toHaveLength(0);
      expect(await outboxStatus()).toMatchObject({ pending: 1, failed: 1, retryReady: 0, coolingDown: 1 });
      expect((await outboxStatus()).oldestPendingSeconds).toBeGreaterThanOrEqual(600);
      expect(await drainOutboxBatch(1)).toEqual({ processed: 0, failed: 0 });
    } finally {
      await db.execute(sql.raw(`drop trigger ${name} on analytics_outbox`));
      await db.execute(sql.raw(`drop function ${name}()`));
    }
    await db.update(analyticsOutbox).set({ failedAt: new Date(Date.now() - 301_000) })
      .where(eq(analyticsOutbox.id, event!.id));
    expect(await outboxStatus()).toMatchObject({ pending: 1, failed: 1, retryReady: 1, coolingDown: 0 });
    const batches = await Promise.all([drainOutboxBatch(1), drainOutboxBatch(1)]);
    expect(batches.reduce((sum, batch) => sum + batch.processed, 0)).toBe(1);
    expect(await db.select().from(analyticsEvents).where(eq(analyticsEvents.eventId, event!.id))).toHaveLength(1);
    expect((await db.select().from(analyticsOutbox).where(eq(analyticsOutbox.id, event!.id)))[0])
      .toMatchObject({ failedAt: null });
    expect(await outboxStatus()).toMatchObject({ pending: 0, failed: 0, retryReady: 0, coolingDown: 0 });
  });

});
