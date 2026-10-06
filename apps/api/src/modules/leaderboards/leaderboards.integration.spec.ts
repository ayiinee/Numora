import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  classLeaderboardEntries,
  classMemberships,
  closeDatabaseConnection,
  getDatabase,
  leaderboardPeriod,
  leaderboardPeriods,
  pvpLeaderboardEntries,
  users,
} from '@tka/database';
import { and, eq } from 'drizzle-orm';
import { pvpFixture } from '../pvp/pvp.test-fixture';
import { IdentityService } from '../identity/identity.service';
import { LeaderboardsService } from './leaderboards.service';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('leaderboard current visibility, dense rank, mode and archive authorization', () => {
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  let service: LeaderboardsService;
  let periodId: string;
  let removedId: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
    process.env.PVP_MODE = 'demo';
    fixture = await pvpFixture();
    service = new LeaderboardsService({
      me: async (header?: string) =>
        header === 'teacher' ? fixture.teacher : fixture.students[header === 'other' ? 2 : 0]!,
    } as unknown as IdentityService);
    const { db } = getDatabase();
    const interval = leaderboardPeriod(new Date());
    await db
      .insert(leaderboardPeriods)
      .values({ ...interval, projectedAt: new Date(), rankPolicyVersion: 'dense-v1' })
      .onConflictDoNothing();
    const [period] = await db
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.startsAt, interval.startsAt));
    periodId = period!.id;
    await db
      .update(leaderboardPeriods)
      .set({ projectedAt: new Date(), rankPolicyVersion: 'dense-v1' })
      .where(eq(leaderboardPeriods.id, periodId));
    await db
      .insert(classMemberships)
      .values({ classId: fixture.schoolClass.id, studentUserId: fixture.students[2]!.id });
    const [removed] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'STUDENT',
        displayName: 'TEST zero/ban rank',
        email: `${randomUUID()}@example.test`,
      })
      .returning();
    removedId = removed!.id;
    await db
      .insert(classMemberships)
      .values({ classId: fixture.schoolClass.id, studentUserId: removedId });
    await db.insert(classLeaderboardEntries).values([
      ...fixture.students.map((s, i) => ({
        periodId,
        classId: fixture.schoolClass.id,
        studentId: s.id,
        totalXp: [12.125, 12.125, 0][i]!,
        rank: i < 2 ? 2 : 3,
      })),
      { periodId, classId: fixture.schoolClass.id, studentId: removedId, totalXp: 20, rank: 1 },
    ]);
  });
  afterAll(async () => {
    delete process.env.PVP_MODE;
    await closeDatabaseConnection();
  });
  it('shows precise XP/zero, reranks visible members immediately and separates DEMO/official points', async () => {
    const before = await service.class('self', fixture.schoolClass.id);
    expect(before.entries.map((e) => e.rank)).toEqual([1, 2, 2, 3]);
    await getDatabase()
      .db.update(classMemberships)
      .set({ leftAt: new Date(), endReason: 'LEFT' })
      .where(
        and(
          eq(classMemberships.classId, fixture.schoolClass.id),
          eq(classMemberships.studentUserId, removedId),
        ),
      );
    const after = await service.class('self', fixture.schoolClass.id);
    expect(after.entries.map((e) => [e.points, e.rank])).toEqual([
      [12.125, 1],
      [12.125, 1],
      [0, 2],
    ]);
    expect(after.available).toBe(true);
    expect(after.updatedAt).not.toBeNull();
    const actor = fixture.students[0]!.id;
    await getDatabase()
      .db.insert(pvpLeaderboardEntries)
      .values([
        {
          periodId,
          studentId: actor,
          difficulty: 'easy',
          dataMode: 'demo',
          bestPoints: '550',
          rank: 1,
        },
        {
          periodId,
          studentId: actor,
          difficulty: 'easy',
          dataMode: 'official',
          bestPoints: '999',
          rank: 1,
        },
      ]);
    expect((await service.pvp('self', 'easy')).ownEntry?.points).toBe(550);
    process.env.PVP_MODE = 'official';
    expect((await service.pvp('self', 'easy')).ownEntry?.points).toBe(999);
    process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
    process.env.PVP_MODE = 'demo';
  });
  it('preserves legacy archive ranks, requires current membership and rejects unknown periods/roles', async () => {
    const { db } = getDatabase();
    const archiveId = randomUUID();
    const interval = leaderboardPeriod(
      new Date(Date.UTC(3100 + Math.floor(Math.random() * 300), 0, 1)),
    );
    await db.insert(leaderboardPeriods).values({
      id: archiveId,
      ...interval,
      status: 'ARCHIVED',
      archivedAt: new Date(),
      rankPolicyVersion: 'legacy-competition-v0',
    });
    await db.insert(classLeaderboardEntries).values({
      periodId: archiveId,
      classId: fixture.schoolClass.id,
      studentId: fixture.students[0]!.id,
      totalXp: 8,
      rank: 3,
    });
    await db.insert(pvpLeaderboardEntries).values({
      periodId: archiveId,
      studentId: fixture.students[0]!.id,
      difficulty: 'easy',
      dataMode: 'legacy',
      bestPoints: '321',
      rank: 3,
    });
    expect(await service.pvp('self', 'easy', archiveId)).toMatchObject({
      dataMode: 'legacy',
      rankPolicyVersion: 'legacy-competition-v0',
      ownEntry: { points: 321, rank: 3 },
    });
    expect(
      (await service.periods('self', { scope: 'pvp', difficulty: 'easy' })).periods.some(
        (p) => p.id === archiveId,
      ),
    ).toBe(true);
    expect((await service.class('self', fixture.schoolClass.id, archiveId)).ownEntry).toMatchObject(
      { points: 8, rank: 3 },
    );
    expect(
      (
        await service.periods('self', { scope: 'class', classId: fixture.schoolClass.id })
      ).periods.some((p) => p.id === archiveId),
    ).toBe(true);
    await expect(service.activity('self', randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(service.activity('teacher')).rejects.toMatchObject({ status: 403 });
    await db
      .update(classMemberships)
      .set({ leftAt: new Date(), endReason: 'LEFT' })
      .where(
        and(
          eq(classMemberships.classId, fixture.schoolClass.id),
          eq(classMemberships.studentUserId, fixture.students[2]!.id),
        ),
      );
    await expect(service.class('other', fixture.schoolClass.id, archiveId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.periods('other', { scope: 'class', classId: fixture.schoolClass.id }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
