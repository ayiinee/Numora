import {
  classLeaderboardEntries,
  getDatabase,
  leaderboardPeriods,
  xpLedger,
  leaderboardPeriod,
  pvpMatches,
  pvpPlayers,
  pvpBestRecords,
  pvpLeaderboardEntries,
  classMemberships,
  classes,
  users,
  globalActivityLeaderboardEntries,
} from '@tka/database';
import { and, asc, eq, gte, lte, inArray, isNull, lt, or, sql } from 'drizzle-orm';

export const classLeaderboardPeriod = leaderboardPeriod;

export async function projectClassLeaderboard(now = new Date()) {
  const { db } = getDatabase();
  const period = classLeaderboardPeriod(now);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('class_leaderboard_projection'))`);
    await tx
      .insert(leaderboardPeriods)
      .values({ startsAt: period.startsAt, endsAt: period.endsAt, timezone: 'Asia/Jakarta' })
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
        .values({ ...interval, timezone: 'Asia/Jakarta' })
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
      const totals = await tx
        .select({
          studentId: classMemberships.studentUserId,
          classId: classMemberships.classId,
          totalXp: sql<string>`coalesce(sum(${xpLedger.xpAmount}),0)`,
        })
        .from(classMemberships)
        .leftJoin(
          xpLedger,
          and(
            eq(classMemberships.studentUserId, xpLedger.studentId),
            inArray(xpLedger.sourceType, ['DRILL', 'TRYOUT']),
            gte(xpLedger.occurredAt, period.startsAt),
            lt(xpLedger.occurredAt, period.endsAt),
          ),
        )
        .innerJoin(classes, eq(classes.id, classMemberships.classId))
        .innerJoin(users, eq(users.id, xpLedger.studentId))
        .where(
          and(
            lt(classMemberships.joinedAt, membershipAt),
            or(
              isNull(classMemberships.leftAt),
              archivedInterval ? gte(classMemberships.leftAt, membershipAt) : undefined,
            ),
            or(
              isNull(classes.archivedAt),
              archivedInterval ? gte(classes.archivedAt, membershipAt) : undefined,
            ),
            eq(users.status, 'ACTIVE'),
          ),
        )
        .groupBy(classMemberships.classId, classMemberships.studentUserId)
        .orderBy(asc(classMemberships.classId));
      await tx
        .delete(classLeaderboardEntries)
        .where(eq(classLeaderboardEntries.periodId, projection.id));
      const byClass = new Map<string, typeof totals>();
      for (const row of totals) {
        if (!row.classId) continue;
        byClass.set(row.classId, [...(byClass.get(row.classId) ?? []), row]);
      }
      const entries = [...byClass.entries()].flatMap(([classId, students]) => {
        students.sort(
          (a, b) => Number(b.totalXp) - Number(a.totalXp) || a.studentId.localeCompare(b.studentId),
        );
        let rank = 0;
        let previousTotal: number | null = null;
        return students.map((student, index) => {
          const totalXp = Number(student.totalXp);
          if (totalXp !== previousTotal) rank = index + 1;
          previousTotal = totalXp;
          return {
            periodId: projection.id,
            classId,
            studentId: student.studentId,
            totalXp,
            rank,
            updatedAt: now,
          };
        });
      });
      if (entries.length) await tx.insert(classLeaderboardEntries).values(entries);
      const globalTotals = await tx
        .select({
          studentId: users.id,
          totalXp: sql<string>`coalesce(sum(${xpLedger.xpAmount}),0)`,
        })
        .from(users)
        .leftJoin(
          xpLedger,
          and(
            eq(xpLedger.studentId, users.id),
            inArray(xpLedger.sourceType, ['DRILL', 'TRYOUT']),
            gte(xpLedger.occurredAt, period.startsAt),
            lt(xpLedger.occurredAt, period.endsAt),
          ),
        )
        .where(
          and(
            eq(users.role, 'STUDENT'),
            eq(users.status, 'ACTIVE'),
            lt(users.createdAt, membershipAt),
          ),
        )
        .groupBy(users.id);
      globalTotals.sort(
        (a, b) => Number(b.totalXp) - Number(a.totalXp) || a.studentId.localeCompare(b.studentId),
      );
      let globalRank = 0;
      let previousGlobal: number | null = null;
      const globalEntries = globalTotals.map((row, index) => {
        const totalXp = Number(row.totalXp);
        if (totalXp !== previousGlobal) globalRank = index + 1;
        previousGlobal = totalXp;
        return {
          periodId: period.id,
          studentId: row.studentId,
          totalXp,
          rank: globalRank,
          updatedAt: now,
        };
      });
      await tx
        .delete(globalActivityLeaderboardEntries)
        .where(eq(globalActivityLeaderboardEntries.periodId, period.id));
      if (globalEntries.length)
        await tx.insert(globalActivityLeaderboardEntries).values(globalEntries);
      await tx
        .delete(pvpLeaderboardEntries)
        .where(eq(pvpLeaderboardEntries.periodId, projection.id));
      await tx.delete(pvpBestRecords).where(eq(pvpBestRecords.periodId, projection.id));
      const records = await tx
        .select({
          studentId: pvpPlayers.studentId,
          difficulty: pvpMatches.difficulty,
          matchId: pvpMatches.id,
          points: pvpPlayers.totalPoints,
          achievedAt: pvpMatches.endedAt,
        })
        .from(pvpPlayers)
        .innerJoin(pvpMatches, eq(pvpMatches.id, pvpPlayers.matchId))
        .where(
          and(
            eq(pvpMatches.status, 'FINISHED'),
            eq(pvpMatches.recordEligible, true),
            eq(pvpMatches.endReason, 'COMPLETED'),
            gte(pvpMatches.endedAt, period.startsAt),
            lt(pvpMatches.endedAt, period.endsAt),
          ),
        );
      records.sort(
        (a, b) =>
          Number(b.points) - Number(a.points) ||
          a.achievedAt!.getTime() - b.achievedAt!.getTime() ||
          a.matchId.localeCompare(b.matchId),
      );
      const best = new Map<string, (typeof records)[number]>();
      for (const r of records)
        if (!best.has(r.studentId + ':' + r.difficulty))
          best.set(r.studentId + ':' + r.difficulty, r);
      const projected: (typeof pvpLeaderboardEntries.$inferInsert)[] = [];
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const sorted = [...best.values()]
          .filter((r) => r.difficulty === difficulty)
          .sort(
            (a, b) => Number(b.points) - Number(a.points) || a.studentId.localeCompare(b.studentId),
          );
        let rank = 0;
        let previous: number | null = null;
        for (const [i, r] of sorted.entries()) {
          if (Number(r.points) !== previous) rank = i + 1;
          previous = Number(r.points);
          projected.push({
            periodId: projection.id,
            studentId: r.studentId,
            difficulty,
            bestPoints: r.points!,
            rank,
            updatedAt: now,
          });
        }
      }
      if (best.size)
        await tx.insert(pvpBestRecords).values(
          [...best.values()].map((r) => ({
            periodId: projection.id,
            studentId: r.studentId,
            difficulty: r.difficulty,
            matchId: r.matchId,
            bestPoints: r.points!,
            achievedAt: r.achievedAt!,
          })),
        );
      if (projected.length) await tx.insert(pvpLeaderboardEntries).values(projected);
      if (projection.id === current.id) {
        classCount = entries.length;
        pvpCount = projected.length;
      } else
        await tx
          .update(leaderboardPeriods)
          .set({ status: 'ARCHIVED', archivedAt: now })
          .where(eq(leaderboardPeriods.id, projection.id));
    }
    return { periodId: current.id, entries: classCount, pvpEntries: pvpCount };
  });
}
