import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  analyticsEvents,
  analyticsOutbox,
  closeDatabaseConnection,
  getDatabase,
} from '@tka/database';
import { drainOutboxBatch, outboxStatus } from './outbox.js';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('atomic outbox groups and poison-event fallback', () => {
  afterAll(closeDatabaseConnection);
  afterEach(async () => {
    vi.restoreAllMocks();
    const { db } = getDatabase();
    await db
      .update(analyticsOutbox)
      .set({ failedAt: null })
      .where(isNull(analyticsOutbox.processedAt));
    await drainOutboxBatch(1000);
  });
  async function events(count: number) {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      eventName: 'drill_completed',
      eventVersion: '2',
      entityType: 'assessmentAttempt',
      entityId: randomUUID(),
      correlationId: randomUUID(),
      occurredAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index)),
      payload: { fixture: true, index, text: '∑ siswa 😊', optional: null },
    }));
    await getDatabase().db.insert(analyticsOutbox).values(rows);
    return rows;
  }
  it('rejects invalid limits and reports an empty queue without work', async () => {
    for (const limit of [0, -1, 1.5, 1001, NaN])
      await expect(drainOutboxBatch(limit)).rejects.toThrow('OUTBOX_LIMIT_INVALID');
    expect(await drainOutboxBatch()).toEqual({ processed: 0, failed: 0 });
  });
  it('respects the public limit and preserves full event contents with bounded SQL work', async () => {
    const rows = await events(27);
    const spy = vi.spyOn(getDatabase().client, 'unsafe');
    expect(await drainOutboxBatch(25)).toEqual({ processed: 25, failed: 0 });
    expect(spy.mock.calls.length).toBe(3);
    spy.mockRestore();
    const delivered = await getDatabase()
      .db.select()
      .from(analyticsEvents)
      .where(
        inArray(
          analyticsEvents.eventId,
          rows.map((r) => r.id),
        ),
      );
    expect(delivered).toHaveLength(25);
    for (const [index, event] of rows.entries()) {
      const stored = delivered.find((r) => r.eventId === event.id);
      if (index >= 25) expect(stored).toBeUndefined();
      else
        expect(stored).toMatchObject({
          eventId: event.id,
          eventName: event.eventName,
          eventVersion: '2',
          actorUserId: null,
          entityType: event.entityType,
          entityId: event.entityId,
          correlationId: event.correlationId,
          occurredAt: event.occurredAt,
          payload: event.payload,
        });
    }
  });
  it('acknowledges partial and complete redelivery without rewriting existing analytics', async () => {
    const rows = await events(4);
    await getDatabase()
      .db.insert(analyticsEvents)
      .values(
        rows
          .slice(0, 2)
          .map(({ id, ...event }) => ({ ...event, eventId: id, payload: { historical: true } })),
      );
    expect(await drainOutboxBatch(4)).toEqual({ processed: 4, failed: 0 });
    const delivered = await getDatabase()
      .db.select()
      .from(analyticsEvents)
      .where(
        inArray(
          analyticsEvents.eventId,
          rows.map((r) => r.id),
        ),
      );
    expect(delivered).toHaveLength(4);
    expect(delivered.find((r) => r.eventId === rows[0]!.id)?.payload).toEqual({ historical: true });
    await getDatabase()
      .db.update(analyticsOutbox)
      .set({ processedAt: null })
      .where(
        inArray(
          analyticsOutbox.id,
          rows.map((r) => r.id),
        ),
      );
    expect(await drainOutboxBatch(4)).toEqual({ processed: 4, failed: 0 });
    expect(
      await getDatabase()
        .db.select()
        .from(analyticsEvents)
        .where(
          inArray(
            analyticsEvents.eventId,
            rows.map((r) => r.id),
          ),
        ),
    ).toHaveLength(4);
  });
  for (const failure of ['insert', 'acknowledgment'] as const) {
    it(`rolls back a failed group and isolates ${failure} failure without counting it twice`, async () => {
      const rows = await events(4),
        bad = rows[1]!;
      const { db } = getDatabase();
      const name = 'test_batch_' + randomUUID().replaceAll('-', '');
      const table = failure === 'insert' ? 'analytics_events' : 'analytics_outbox';
      const condition =
        failure === 'insert'
          ? `NEW.event_id='${bad.id}'::uuid`
          : `NEW.id='${bad.id}'::uuid and NEW.processed_at is not null`;
      await db.execute(
        sql.raw(
          `create function ${name}() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'TEST ONLY batch delivery failure'; end if; return NEW; end $$`,
        ),
      );
      await db.execute(
        sql.raw(
          `create trigger ${name} before ${failure === 'insert' ? 'insert' : 'update'} on ${table} for each row execute function ${name}()`,
        ),
      );
      try {
        expect(await drainOutboxBatch(4)).toEqual({ processed: 3, failed: 1 });
        expect(
          await db.select().from(analyticsEvents).where(eq(analyticsEvents.eventId, bad.id)),
        ).toHaveLength(0);
        expect(
          await db
            .select()
            .from(analyticsEvents)
            .where(
              inArray(
                analyticsEvents.eventId,
                rows.map((r) => r.id),
              ),
            ),
        ).toHaveLength(3);
        expect(await outboxStatus()).toMatchObject({
          pending: 1,
          failed: 1,
          retryReady: 0,
          coolingDown: 1,
        });
        expect(await drainOutboxBatch(10)).toEqual({ processed: 0, failed: 0 });
      } finally {
        await db.execute(sql.raw(`drop trigger ${name} on ${table}`));
        await db.execute(sql.raw(`drop function ${name}()`));
      }
    });
  }
  it('lets two consumers acknowledge disjoint groups exactly once', async () => {
    const rows = await events(20);
    const results = await Promise.all([drainOutboxBatch(10), drainOutboxBatch(10)]);
    expect(results.reduce((n, r) => n + r.processed, 0)).toBe(20);
    expect(results.reduce((n, r) => n + r.failed, 0)).toBe(0);
    const delivered = await getDatabase()
      .db.select()
      .from(analyticsEvents)
      .where(
        inArray(
          analyticsEvents.eventId,
          rows.map((r) => r.id),
        ),
      );
    expect(new Set(delivered.map((r) => r.eventId)).size).toBe(20);
    expect((await outboxStatus()).pending).toBe(0);
  });
});
