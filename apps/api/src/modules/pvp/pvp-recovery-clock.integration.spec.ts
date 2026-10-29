import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  analyticsOutbox,
  closeDatabaseConnection,
  getDatabase,
  pvpActiveRooms,
  pvpMatches,
  xpLedger,
} from '@tka/database';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { pvpFixture } from './pvp.test-fixture';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'restart recovery with persisted clocks ahead of the recovering server',
  () => {
    let fixture: Awaited<ReturnType<typeof pvpFixture>>;
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      fixture = await pvpFixture();
    });
    afterAll(closeDatabaseConnection);

    it('cancels future WAITING/RUNNING fixtures atomically without rewinding durable time or awarding records', async () => {
      const future = new Date(Date.now() + 3_600_000);
      const original = new PvpEngineService(fixture.policy);
      vi.spyOn(original, 'now').mockReturnValue(future);
      const running = await original.create(fixture.students[0]!.id, 'easy', randomUUID());
      await original.join(fixture.students[1]!.id, running.roomCode);
      await original.ready(fixture.students[0]!.id, running.matchId);
      await original.ready(fixture.students[1]!.id, running.matchId);
      const waiting = await original.create(fixture.students[2]!.id, 'easy', randomUUID());
      const recovering = new PvpEngineService(fixture.policy);
      const ids = [running.matchId, waiting.matchId];
      await getDatabase()
        .db.update(pvpMatches)
        .set({
          createdAt: sql`${pvpMatches.createdAt} + interval '123 microseconds'`,
          startedAt: sql`${pvpMatches.startedAt} + interval '123 microseconds'`,
        })
        .where(inArray(pvpMatches.id, ids));
      await recovering.recoverAfterRestart();
      const { db } = getDatabase();
      const matches = await db.select().from(pvpMatches).where(inArray(pvpMatches.id, ids));
      expect(matches).toHaveLength(2);
      for (const match of matches) {
        expect(match).toMatchObject({
          status: 'CANCELLED',
          endReason: 'SERVER_RESTARTED',
          recordEligible: false,
        });
        expect(match.endedAt!.getTime()).toBeGreaterThanOrEqual(
          (match.startedAt ?? match.createdAt).getTime(),
        );
      }
      expect(
        await db.select().from(pvpActiveRooms).where(inArray(pvpActiveRooms.matchId, ids)),
      ).toHaveLength(0);
      const events = await db
        .select()
        .from(analyticsOutbox)
        .where(
          and(
            inArray(analyticsOutbox.entityId, ids),
            eq(analyticsOutbox.eventName, 'pvp_match_cancelled'),
          ),
        );
      expect(events).toHaveLength(2);
      const [chronology] = await getDatabase()
        .client`SELECT bool_and(o.occurred_at=m.ended_at) AS exact
      FROM analytics_outbox o JOIN pvp_matches m ON m.id=o.entity_id
      WHERE m.id=any(${ids}::uuid[]) AND o.event_name='pvp_match_cancelled'`;
      expect(chronology!.exact).toBe(true);
      for (const event of events)
        expect(event.occurredAt).toEqual(matches.find((m) => m.id === event.entityId)!.endedAt);
      expect(
        await db
          .select()
          .from(xpLedger)
          .where(
            inArray(
              xpLedger.studentId,
              fixture.students.map((s) => s.id),
            ),
          ),
      ).toHaveLength(0);
      await recovering.recoverAfterRestart();
      expect(
        await db
          .select()
          .from(analyticsOutbox)
          .where(
            and(
              inArray(analyticsOutbox.entityId, ids),
              eq(analyticsOutbox.eventName, 'pvp_match_cancelled'),
            ),
          ),
      ).toHaveLength(2);
      await expect(
        getDatabase()
          .client`UPDATE pvp_matches SET ended_at=created_at-interval '1 millisecond' WHERE id=${waiting.matchId}`,
      ).rejects.toMatchObject({ code: '23514', constraint_name: 'pvp_matches_time_ck' });
    });
  },
);
