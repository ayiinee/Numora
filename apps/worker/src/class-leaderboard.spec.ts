import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  classLeaderboardEntries,
  classMemberships,
  globalActivityLeaderboardEntries,
  classes,
  closeDatabaseConnection,
  getDatabase,
  leaderboardPeriods,
  schools,
  scoringPolicyVersions,
  users,
  xpLedger,
} from '@tka/database';
import { classLeaderboardPeriod, projectClassLeaderboard } from './class-leaderboard.js';

describe('class leaderboard calendar', () => {
  it('rolls to a new period at Thursday 00:00 WIB', () => {
    const before = classLeaderboardPeriod(new Date('2026-09-30T16:59:59.000Z'));
    const after = classLeaderboardPeriod(new Date('2026-09-30T17:00:00.000Z'));
    expect(before.startsAt.toISOString()).toBe('2026-09-23T17:00:00.000Z');
    expect(before.endsAt.toISOString()).toBe(after.startsAt.toISOString());
    expect(after.startsAt.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });
});

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('class leaderboard projection against PostgreSQL', () => {
  afterAll(async () => closeDatabaseConnection());

  it('ranks only class XP, retries safely, and archives the prior week', async () => {
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const suffix = randomUUID().slice(0, 8);
    const [teacher, first, second, third] = await db
      .insert(users)
      .values([
        {
          authUserId: randomUUID(),
          role: 'TEACHER',
          displayName: 'Teacher',
          email: `leader-teacher-${suffix}@example.test`,
        },
        ...['first', 'second', 'third'].map((name) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: name,
          email: `leader-${name}-${suffix}@example.test`,
        })),
      ])
      .returning({ id: users.id });
    const [school] = await db
      .insert(schools)
      .values({
        code: `LEADER-${suffix}`,
        name: 'Leaderboard Test School',
      })
      .returning({ id: schools.id });
    const [schoolClass] = await db
      .insert(classes)
      .values({
        schoolId: school!.id,
        teacherUserId: teacher!.id,
        name: 'IX Test',
        joinCode: `LB${suffix}`,
      })
      .returning({ id: classes.id });
    await db.insert(classMemberships).values(
      [first!, second!, third!].map((student) => ({
        classId: schoolClass!.id,
        studentUserId: student.id,
      })),
    );
    const [policy] = await db
      .insert(scoringPolicyVersions)
      .values({
        policyCode: `LEADER_TEST_${suffix}`,
        version: 1,
        configuration: { fixture: true },
        status: 'PUBLISHED',
      })
      .returning({ id: scoringPolicyVersions.id });
    const [pkg] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `LEADER-TEST-${suffix}`,
        packageVersion: 1,
        name: 'Leaderboard Test Fixture',
        assessmentType: 'TRYOUT',
        status: 'DRAFT',
        scoringPolicyVersionId: policy!.id,
        isDemo: true,
      })
      .returning({ id: assessmentPackages.id });
    // Use a separate future week so repeated runs do not reopen an archived period.
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = new Date(Date.UTC(2200, 0, 1) + (parseInt(suffix, 16) % 100_000) * weekMs);
    const students = [first!, second!, third!];
    const attempts = await db
      .insert(assessmentAttempts)
      .values(
        students.map((student) => ({
          studentId: student.id,
          packageId: pkg!.id,
          assessmentType: 'TRYOUT' as const,
          classIdAtStart: schoolClass!.id,
          startedAt: now,
          finishedAt: now,
          status: 'GRADED' as const,
        })),
      )
      .returning({ id: assessmentAttempts.id });
    await db.insert(xpLedger).values(
      students.map((student, index) => ({
        studentId: student.id,
        classIdAtEvent: schoolClass!.id,
        sourceType: 'TRYOUT' as const,
        attemptId: attempts[index]!.id,
        xpAmount: [12, 12, 7][index]!,
        occurredAt: now,
      })),
    );
    const firstRun = await projectClassLeaderboard(now);
    const secondRun = await projectClassLeaderboard(now);
    expect(secondRun.periodId).toBe(firstRun.periodId);
    const entries = await db
      .select()
      .from(classLeaderboardEntries)
      .where(
        and(
          eq(classLeaderboardEntries.periodId, firstRun.periodId),
          eq(classLeaderboardEntries.classId, schoolClass!.id),
        ),
      );
    expect(entries).toHaveLength(3);
    const globals = await db
      .select()
      .from(globalActivityLeaderboardEntries)
      .where(
        and(
          eq(globalActivityLeaderboardEntries.periodId, firstRun.periodId),
          eq(globalActivityLeaderboardEntries.studentId, first!.id),
        ),
      );
    expect(globals[0]?.totalXp).toBe(12);
    expect(
      entries.map((entry) => [entry.totalXp, entry.rank]).sort((a, b) => b[0]! - a[0]!),
    ).toEqual([
      [12, 1],
      [12, 1],
      [7, 3],
    ]);
    // A late fixture event in the prior period must be included before archive.
    const [latePackage] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `LEADER-LATE-${suffix}`,
        packageVersion: 1,
        name: 'Late event fixture',
        assessmentType: 'TRYOUT',
        status: 'DRAFT',
        isDemo: true,
      })
      .returning();
    const [lateAttempt] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: first!.id,
        packageId: latePackage!.id,
        assessmentType: 'TRYOUT',
        classIdAtStart: schoolClass!.id,
        startedAt: now,
        finishedAt: now,
        status: 'GRADED',
      })
      .returning();
    await db.insert(xpLedger).values({
      studentId: first!.id,
      classIdAtEvent: schoolClass!.id,
      sourceType: 'TRYOUT',
      attemptId: lateAttempt!.id,
      xpAmount: 5,
      occurredAt: now,
    });
    const nextWeek = new Date(now.getTime() + weekMs);
    await projectClassLeaderboard(nextWeek);
    const [oldPeriod] = await db
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.id, firstRun.periodId));
    expect(oldPeriod?.status).toBe('ARCHIVED');
    const reconciled = await db
      .select()
      .from(classLeaderboardEntries)
      .where(
        and(
          eq(classLeaderboardEntries.periodId, firstRun.periodId),
          eq(classLeaderboardEntries.studentId, first!.id),
        ),
      );
    expect(reconciled[0]!.totalXp).toBe(17);
    expect(
      await db
        .select()
        .from(classLeaderboardEntries)
        .where(
          and(
            eq(classLeaderboardEntries.periodId, firstRun.periodId),
            eq(classLeaderboardEntries.classId, schoolClass!.id),
          ),
        ),
    ).toHaveLength(3);
  }, 30_000);
});
