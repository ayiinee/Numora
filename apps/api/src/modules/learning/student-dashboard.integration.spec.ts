import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assessmentAttempts,
  assessmentPackages,
  chapters,
  subchapters,
  closeDatabaseConnection,
  getDatabase,
  levels,
  levelProgress,
  xpLedger,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { ClassesService } from '../classes/classes.service';
import { SchoolsService } from '../schools/schools.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { pvpFixture } from '../pvp/pvp.test-fixture';
import { LearningCatalogService } from './learning-catalog.service';
import { AssessmentHistoryService } from './assessment-history.service';
import { TryoutReleaseService } from './tryout-release.service';
import { StudentDashboardService } from './student-dashboard.service';
import { and, eq } from 'drizzle-orm';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('Student dashboard ownership, affiliation and IRT privacy', () => {
  afterAll(async () => closeDatabaseConnection());
  it('returns real metrics, hides Tryout scores, refreshes class eligibility, and rejects Teachers', async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const fixture = await pvpFixture();
    const { db } = getDatabase();
    const [admin] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'ADMIN',
        adminRole: 'SUPER_ADMIN',
        displayName: 'Dashboard fixture admin',
        email: `${randomUUID()}@example.invalid`,
      })
      .returning();
    const identity = {
      me: async (header?: string) => {
        const user =
          header === 'admin'
            ? admin!
            : header === 'teacher'
              ? fixture.teacher
              : header === 'other'
                ? fixture.students[2]!
                : fixture.students[0]!;
        return {
          id: user.id,
          role: user.role,
          adminRole: user.adminRole,
          displayName: user.displayName,
          status: user.status,
        };
      },
    } as unknown as IdentityService;
    const schools = new SchoolsService(identity);
    const token = await schools.issueToken('admin', fixture.schoolClass.schoolId);
    await schools.verifyTeacher('teacher', fixture.schoolClass.schoolId, token.token);
    const history = new AssessmentHistoryService(identity, new TryoutReleaseService());
    const service = new StudentDashboardService(
      identity,
      new LearningCatalogService(identity),
      history,
    );
    const initial = await service.dashboard('other');
    expect(initial.affiliation).toBe('MANDIRI');
    expect(initial.features.tryout).toBe(true);
    expect(initial.class).toBeNull();
    expect(initial.totalXp).toBe(0);
    expect(initial.latestDrillScore).toBeNull();
    expect(initial.bestDrillScore).toBeNull();
    expect(initial.activities).toEqual([]);
    const [chapter] = await db
      .select({ chapterId: assessmentPackages.chapterId })
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, fixture.pack.id));
    // Use a READY demo level and copy its scope to the fixture package.
    const [entry] = await db
      .select({ level: levels })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(
        and(
          eq(levels.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ),
      )
      .limit(1);
    const level = entry?.level;
    expect(level).toBeDefined();
    const [drill] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'Dashboard Drill fixture',
        assessmentType: 'DRILL',
        levelId: level!.id,
        chapterId: chapter?.chapterId ?? null,
        scoringPolicyVersionId: fixture.policy.policyVersionId,
        status: 'PUBLISHED',
        isDemo: true,
      })
      .returning();
    const attempts = await db
      .insert(assessmentAttempts)
      .values(
        [40, 80].map((score) => ({
          studentId: fixture.students[0]!.id,
          packageId: drill!.id,
          levelIdAtStart: level!.id,
          assessmentType: 'DRILL' as const,
          status: 'GRADED' as const,
          score0To100: String(score),
          startedAt: new Date('2026-09-29T01:00:00Z'),
          finishedAt: new Date(`2026-09-29T${score === 40 ? '02' : '03'}:00:00Z`),
        })),
      )
      .returning();
    await db.insert(xpLedger).values(
      attempts.map((attempt, index) => ({
        studentId: fixture.students[0]!.id,
        attemptId: attempt.id,
        sourceType: 'DRILL' as const,
        xpAmount: index === 0 ? 12.125 : 7.5,
      })),
    );
    await db.insert(levelProgress).values({
      studentId: fixture.students[0]!.id,
      levelId: level!.id,
      unlockedAt: new Date(),
      completedAt: new Date(),
      latestScore: 80,
      bestScore: 80,
      completionAttemptId: attempts[1]!.id,
    });
    const [tryout] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'Private Tryout',
        assessmentType: 'TRYOUT',
        isDemo: true,
        status: 'DRAFT',
      })
      .returning();
    const [tryoutAttempt] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: fixture.students[0]!.id,
        packageId: tryout!.id,
        assessmentType: 'TRYOUT',
        status: 'GRADED',
        score0To100: '99',
        startedAt: new Date('2026-09-30T01:00:00Z'),
        finishedAt: new Date('2026-09-30T02:00:00Z'),
      })
      .returning();
    await db.insert(xpLedger).values({
      studentId: fixture.students[0]!.id,
      attemptId: tryoutAttempt!.id,
      sourceType: 'TRYOUT',
      xpAmount: 10.5,
    });
    const active = await db
      .insert(assessmentAttempts)
      .values({
        studentId: fixture.students[0]!.id,
        packageId: drill!.id,
        levelIdAtStart: level!.id,
        assessmentType: 'DRILL',
        status: 'IN_PROGRESS',
      })
      .returning();
    const dashboard = await service.dashboard();
    expect(dashboard.affiliation).toBe('SCHOOL');
    expect(dashboard.class?.name).toBe(fixture.schoolClass.name);
    expect(dashboard.latestDrillScore).toBe(80);
    expect(dashboard.bestDrillScore).toBe(80);
    expect(dashboard.totalXp).toBe(30.125);
    expect(dashboard.activeDrill?.attemptId).toBe(active[0]!.id);
    expect(dashboard.activities.find((a) => a.activity === 'tryout')).toMatchObject({
      resultState: 'waitingIrt',
      score: null,
    });
    expect(dashboard.activities.filter((a) => a.score === 99)).toEqual([]);
    expect(dashboard.completedLevels).toBe(1);
    expect((await service.dashboard('other')).activities).toEqual([]);
    expect((await service.dashboard('other')).totalXp).toBe(0);
    const leaderboards = new LeaderboardsService(identity);
    await expect(leaderboards.class('other')).rejects.toMatchObject({
      status: 403,
      response: { code: 'CLASS_REQUIRED' },
    });
    await new ClassesService(identity).join('other', fixture.schoolClass.joinCode);
    const joined = await service.dashboard('other');
    expect(joined.features.tryout).toBe(true);
    expect(joined.affiliation).toBe('SCHOOL');
    expect((await leaderboards.class('other')).policyPending).toBe(false);
    await expect(service.dashboard('teacher')).rejects.toMatchObject({ status: 403 });
  }, 30_000);
});
