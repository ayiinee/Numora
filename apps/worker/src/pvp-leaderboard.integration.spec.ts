import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assessmentPackages,
  closeDatabaseConnection,
  getDatabase,
  leaderboardPeriods,
  pvpBestRecords,
  pvpLeaderboardEntries,
  pvpMatches,
  pvpPlayers,
  classLeaderboardEntries,
  users,
} from '@tka/database';
import { and, eq, inArray } from 'drizzle-orm';
import { projectClassLeaderboard } from './class-leaderboard.js';
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('PvP projection, best record and archive', () => {
  afterAll(async () => closeDatabaseConnection());
  it('projects best valid points independently by difficulty, excludes forfeit/cancel and reconciles before archive', async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { db } = getDatabase();
    const key = randomUUID();
    const students = await db
      .insert(users)
      .values(
        Array.from({ length: 23 }, (_, i) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: `Fixture ${i}`,
          email: `${key}-${i}@example.test`,
        })),
      )
      .returning();
    const [pack] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: key,
        packageVersion: 1,
        name: 'Projection test only',
        assessmentType: 'PVP',
        status: 'DRAFT',
        isDemo: true,
      })
      .returning();
    const now = new Date(Date.UTC(6000 + Math.floor(Math.random() * 1000), 0, 15));
    const record = async (
      index: number,
      points: number,
      difficulty = 'easy',
      eligible = true,
      status: 'FINISHED' | 'CANCELLED' = 'FINISHED',
      endReason = 'COMPLETED',
      dataMode: 'demo' | 'official' = 'demo',
    ) => {
      const [match] = await db
        .insert(pvpMatches)
        .values({
          roomCode: randomUUID(),
          packageId: pack!.id,
          creatorStudentId: students[index]!.id,
          difficulty,
          dataMode,
          status,
          recordEligible: eligible,
          startedAt: now,
          endedAt: now,
          endReason,
        })
        .returning();
      await db.insert(pvpPlayers).values({
        matchId: match!.id,
        studentId: students[index]!.id,
        playerSlot: 1,
        totalPoints: String(points),
        result: status === 'CANCELLED' ? null : 'WIN',
      });
      return match!.id;
    };
    for (let i = 0; i < 23; i++) await record(i, i < 2 ? 500 : 500 - i * 10);
    await record(22, 50);
    const bestMatch = await record(22, 290);
    await record(22, 9999, 'easy', false, 'FINISHED', 'FORFEIT');
    await record(22, 9999, 'easy', false, 'CANCELLED', 'SERVER_RESTARTED');
    await record(22, 600, 'hard');
    await record(22, 1200, 'easy', true, 'FINISHED', 'COMPLETED', 'official');
    const first = await projectClassLeaderboard(now);
    const again = await projectClassLeaderboard(now);
    expect(again.periodId).toBe(first.periodId);
    const easy = await db
      .select()
      .from(pvpLeaderboardEntries)
      .where(
        and(
          eq(pvpLeaderboardEntries.periodId, first.periodId),
          eq(pvpLeaderboardEntries.difficulty, 'easy'),
          eq(pvpLeaderboardEntries.dataMode, 'demo'),
        ),
      );
    expect(easy).toHaveLength(23);
    expect(easy.filter((e) => e.rank === 1)).toHaveLength(2);
    expect(easy.some((e) => e.rank === 2)).toBe(true);
    const [official] = await db
      .select()
      .from(pvpLeaderboardEntries)
      .where(
        and(
          eq(pvpLeaderboardEntries.periodId, first.periodId),
          eq(pvpLeaderboardEntries.dataMode, 'official'),
        ),
      );
    expect(Number(official?.bestPoints)).toBe(1200);
    expect(official?.rank).toBe(1);
    const best = await db
      .select()
      .from(pvpBestRecords)
      .where(
        and(
          eq(pvpBestRecords.periodId, first.periodId),
          eq(pvpBestRecords.studentId, students[22]!.id),
          eq(pvpBestRecords.difficulty, 'easy'),
          eq(pvpBestRecords.dataMode, 'demo'),
        ),
      );
    expect(best[0]!.matchId).toBe(bestMatch);
    expect(Number(best[0]!.bestPoints)).toBe(290);
    expect(
      await db
        .select()
        .from(classLeaderboardEntries)
        .where(
          and(
            eq(classLeaderboardEntries.periodId, first.periodId),
            inArray(
              classLeaderboardEntries.studentId,
              students.map((s) => s.id),
            ),
          ),
        ),
    ).toHaveLength(0);
    await record(22, 550);
    await projectClassLeaderboard(new Date(now.getTime() + 7 * 86400_000));
    expect(
      (
        await db.select().from(leaderboardPeriods).where(eq(leaderboardPeriods.id, first.periodId))
      )[0]!.status,
    ).toBe('ARCHIVED');
    const archived = await db
      .select()
      .from(pvpLeaderboardEntries)
      .where(
        and(
          eq(pvpLeaderboardEntries.periodId, first.periodId),
          eq(pvpLeaderboardEntries.studentId, students[22]!.id),
          eq(pvpLeaderboardEntries.difficulty, 'easy'),
          eq(pvpLeaderboardEntries.dataMode, 'demo'),
        ),
      );
    expect(Number(archived[0]!.bestPoints)).toBe(550);
    expect(archived[0]!.rank).toBe(1);
  }, 30_000);
});
