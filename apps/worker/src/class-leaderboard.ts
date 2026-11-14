import { getDatabase, leaderboardPeriods, leaderboardPeriod, analyticsOutbox } from '@tka/database';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { projectLeaderboardRows } from './leaderboard-projection.js';

export const classLeaderboardPeriod = leaderboardPeriod;

export async function projectClassLeaderboard(now = new Date()) {
  const { db } = getDatabase();
  const period = classLeaderboardPeriod(now);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('class_leaderboard_projection'))`);
    await tx
      .insert(leaderboardPeriods)
      .values({
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        timezone: 'Asia/Jakarta',
        rankPolicyVersion: 'dense-v1',
      })
      .onConflictDoNothing({ target: leaderboardPeriods.startsAt });
    const [current] = await tx
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.startsAt, period.startsAt))
      .limit(1);
    if (!current || current.status !== 'ACTIVE')
      throw new Error('Current class leaderboard period is unavailable.');
    // Materialize missed periods after downtime, including matches before the first worker run.
    const missing = await tx.execute<{ occurred_at: Date }>(sql`select distinct occurred_at from (
      select occurred_at from xp_ledger union all
      select ended_at as occurred_at from pvp_matches where status='FINISHED' and record_eligible=true
    ) events where occurred_at <= ${now.toISOString()} and not exists (select 1 from leaderboard_periods p where events.occurred_at >= p.starts_at and events.occurred_at < p.ends_at)`);
    for (const event of missing) {
      const interval = leaderboardPeriod(new Date(event.occurred_at));
      await tx
        .insert(leaderboardPeriods)
        .values({ ...interval, timezone: 'Asia/Jakarta', rankPolicyVersion: 'dense-v1' })
        .onConflictDoNothing();
    }
    const pending = await tx
      .select()
      .from(leaderboardPeriods)
      .where(
        and(
          eq(leaderboardPeriods.status, 'ACTIVE'),
          lte(leaderboardPeriods.startsAt, period.startsAt),
        ),
      )
      .orderBy(asc(leaderboardPeriods.startsAt));
    let classCount = 0;
    let pvpCount = 0;
    for (const projection of pending) {
      const period = projection;
      const archivedInterval = period.endsAt <= now;
      const membershipAt = archivedInterval ? period.endsAt : now;
      // Reconcile missed periods against membership at the period boundary.
      // Once archived, neither membership changes nor reruns rewrite the snapshot.
      const { entries, pvpEntries } = await projectLeaderboardRows(
        tx,
        period,
        membershipAt,
        archivedInterval,
        now,
      );
      await tx
        .update(leaderboardPeriods)
        .set({ projectedAt: now, rankPolicyVersion: 'dense-v1' })
        .where(eq(leaderboardPeriods.id, projection.id));
      if (projection.id === current.id) {
        classCount = entries;
        pvpCount = pvpEntries;
      } else {
        await tx
          .update(leaderboardPeriods)
          .set({ status: 'ARCHIVED', archivedAt: now })
          .where(eq(leaderboardPeriods.id, projection.id));
        await tx.insert(analyticsOutbox).values({
          eventName: 'leaderboard_archived',
          entityType: 'leaderboard_period',
          entityId: projection.id,
          occurredAt: now,
          payload: {
            startsAt: period.startsAt.toISOString(),
            endsAt: period.endsAt.toISOString(),
          },
        });
      }
    }
    return { periodId: current.id, entries: classCount, pvpEntries: pvpCount };
  });
}
