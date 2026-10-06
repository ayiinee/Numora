import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  closeDatabaseConnection,
  chapters,
  getDatabase,
  levelProgress,
  levels,
  scoringPolicyVersions,
  subchapters,
  teacherSchoolMemberships,
  teacherVerificationTokens,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { ClassesService } from '../classes/classes.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { SchoolsService } from './schools.service';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('Teacher verification and Class flow against PostgreSQL', () => {
  afterAll(async () => closeDatabaseConnection());

  it('enforces token expiry/single use, multiple classes, Teacher ownership and teacherless takeover', async () => {
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const suffix = randomUUID().slice(0, 8);
    const profiles = {
      admin: {
        role: 'ADMIN',
        status: 'ACTIVE',
        adminRole: 'SUPER_ADMIN',
        teacherVerified: null,
      },
      teacherA: { role: 'TEACHER', teacherVerified: true },
      teacherB: { role: 'TEACHER', teacherVerified: true },
      teacherC: { role: 'TEACHER', teacherVerified: true },
      student: { role: 'STUDENT', teacherVerified: null },
    } as const;
    const identities = {} as Record<keyof typeof profiles, string>;
    for (const [key, profile] of Object.entries(profiles) as [
      keyof typeof profiles,
      (typeof profiles)[keyof typeof profiles],
    ][]) {
      const [created] = await db
        .insert(users)
        .values({
          authUserId: randomUUID(),
          role: profile.role,
          displayName: key,
          email: `${key}-${suffix}@example.test`,
        })
        .returning({ id: users.id });
      identities[key] = created!.id;
    }
    const identity = {
      me: async (authorization?: string) => {
        const key = authorization as keyof typeof profiles;
        return { id: identities[key], ...profiles[key] };
      },
    } as unknown as IdentityService;
    const schools = new SchoolsService(identity);
    const classes = new ClassesService(identity);
    const monitoring = new MonitoringService(classes);
    const school = await schools.createSchool('admin', `TEST-${suffix}`, 'Sekolah Test');

    const expired = await schools.issueToken('admin', school.id);
    await db
      .update(teacherVerificationTokens)
      .set({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(teacherVerificationTokens.id, expired.id));
    await expect(schools.verifyTeacher('teacherA', school.id, expired.token)).rejects.toMatchObject(
      { status: 403 },
    );

    const issued = await schools.issueToken('admin', school.id);
    expect(issued.expiresAt).toBeDefined();
    const [stored] = await db
      .select({ tokenHash: teacherVerificationTokens.tokenHash })
      .from(teacherVerificationTokens)
      .where(eq(teacherVerificationTokens.id, issued.id));
    expect(stored?.tokenHash).not.toBe(issued.token);
    const attempts = await Promise.allSettled([
      schools.verifyTeacher('teacherA', school.id, issued.token),
      schools.verifyTeacher('teacherB', school.id, issued.token),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const owner = attempts[0]?.status === 'fulfilled' ? 'teacherA' : 'teacherB';
    const outsider = owner === 'teacherA' ? 'teacherB' : 'teacherA';
    await expect(schools.verifyTeacher(outsider, school.id, issued.token)).rejects.toMatchObject({
      status: 403,
    });
    const second = await schools.issueToken('admin', school.id);
    const third = await schools.issueToken('admin', school.id);
    const sameTeacher = await Promise.allSettled([
      schools.verifyTeacher('teacherC', school.id, second.token),
      schools.verifyTeacher('teacherC', school.id, third.token),
    ]);
    expect(sameTeacher.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(sameTeacher.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });

    const firstClass = await classes.create(owner, 'IX A');
    const otherClass = await classes.create(owner, 'IX B');
    const listed = await classes.list(owner);
    expect(listed.items.find((item) => item.id === firstClass.id)?.joinCode).toBe(
      firstClass.joinCode,
    );
    await classes.join('student', firstClass.joinCode);
    await expect(classes.join('student', firstClass.joinCode)).resolves.toMatchObject({
      joined: true,
    });
    await expect(classes.join('student', otherClass.joinCode)).resolves.toMatchObject({
      joined: true,
    });
    const [chapter] = await db
      .insert(chapters)
      .values({
        code: `TEST-${suffix}`,
        slug: `TEST-${suffix}`.toLowerCase(),
        name: `Bab ${suffix}`,
        displayOrder: parseInt(suffix, 16) % 2_000_000_000,
        status: 'READY',
      })
      .returning({ id: chapters.id });
    const [subchapter] = await db
      .insert(subchapters)
      .values({
        chapterId: chapter!.id,
        code: `SUB-${suffix}`,
        slug: `SUB-${suffix}`.toLowerCase(),
        name: 'Subbab',
        displayOrder: 1,
        status: 'READY',
      })
      .returning({ id: subchapters.id });
    const [level] = await db
      .insert(levels)
      .values({
        subchapterId: subchapter!.id,
        description: 'Level 1',
        levelNumber: 1,
        status: 'READY',
      })
      .returning({ id: levels.id });
    const [policy] = await db
      .select({ id: scoringPolicyVersions.id })
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'DRILL_PG_DEMO'),
          eq(scoringPolicyVersions.version, 1),
        ),
      )
      .limit(1);
    const [drillPackage] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `MONITORING-${suffix}`,
        packageVersion: 1,
        name: `Monitoring ${suffix}`,
        assessmentType: 'DRILL',
        chapterId: chapter!.id,
        levelId: level!.id,
        variantIndex: 1,
        isDemo: true,
        scoringPolicyVersionId: policy!.id,
        releaseAt: new Date(),
        status: 'PUBLISHED',
      })
      .returning({ id: assessmentPackages.id });
    await db.insert(assessmentAttempts).values({
      studentId: identities.student,
      packageId: drillPackage!.id,
      assessmentType: 'DRILL',
      chapterIdAtStart: chapter!.id,
      levelIdAtStart: level!.id,
      scoringPolicyVersionId: policy!.id,
      status: 'GRADED',
      startedAt: new Date(Date.now() - 4000),
      finishedAt: new Date(Date.now() - 3000),
      rawPoints: '0',
      score0To100: '0',
    });
    await db.insert(levelProgress).values({
      studentId: identities.student,
      levelId: level!.id,
      unlockedAt: new Date(),
      latestScore: 0,
      bestScore: 0,
    });
    const [lockedLevel] = await db
      .insert(levels)
      .values({
        subchapterId: subchapter!.id,
        levelNumber: 2,
        status: 'READY',
      })
      .returning({ id: levels.id });
    await db
      .insert(levelProgress)
      .values({ studentId: identities.student, levelId: lockedLevel!.id });
    const progress = await monitoring.studentProgress(owner, firstClass.id, identities.student);
    expect(progress.student.displayName).toBe('student');
    expect(progress.latestDrillScore).toBe(0);
    expect(progress.levels.find((item) => item.levelId === level!.id)).toMatchObject({
      accessStatus: 'UNLOCKED',
      latestDrillScore: 0,
      bestDrillScore: 0,
    });
    expect(progress.levels.find((item) => item.levelId === lockedLevel!.id)).toMatchObject({
      accessStatus: 'LOCKED',
      levelLabel: 'Level 2',
    });
    await expect(
      monitoring.studentProgress(owner, otherClass.id, identities.student),
    ).resolves.toMatchObject({ student: { id: identities.student } });
    await db.insert(assessmentAttempts).values(
      [90, 60].map((score, index) => ({
        studentId: identities.student,
        packageId: drillPackage!.id,
        assessmentType: 'DRILL' as const,
        chapterIdAtStart: chapter!.id,
        levelIdAtStart: level!.id,
        scoringPolicyVersionId: policy!.id,
        status: 'GRADED' as const,
        startedAt: new Date(Date.now() - (3000 - index * 1000)),
        finishedAt: new Date(Date.now() - (2000 - index * 1000)),
        rawPoints: String(score),
        score0To100: String(score),
      })),
    );
    await db
      .update(levelProgress)
      .set({ latestScore: 60, bestScore: 90 })
      .where(
        and(eq(levelProgress.studentId, identities.student), eq(levelProgress.levelId, level!.id)),
      );
    const repeated = await monitoring.studentProgress(owner, firstClass.id, identities.student);
    expect(repeated.latestDrillScore).toBe(60);
    expect(repeated.levels.find((item) => item.levelId === level!.id)).toMatchObject({
      latestDrillScore: 60,
      bestDrillScore: 90,
    });
    await expect(
      monitoring.studentProgress(outsider, firstClass.id, identities.student),
    ).rejects.toMatchObject({ status: 403 });
    await schools.updateSchool('admin', school.id, { status: 'INACTIVE' });
    expect((await classes.list(owner)).items).toEqual([]);
    await expect(classes.join('student', firstClass.joinCode)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      monitoring.studentProgress(owner, firstClass.id, identities.student),
    ).rejects.toMatchObject({ status: 403 });
    await schools.updateSchool('admin', school.id, { status: 'ACTIVE' });
    await db
      .update(teacherSchoolMemberships)
      .set({ endedAt: new Date() })
      .where(eq(teacherSchoolMemberships.teacherUserId, identities[owner]));
    await expect(classes.join('student', firstClass.joinCode)).resolves.toMatchObject({
      joined: true,
    });
    await classes.takeover('teacherC', firstClass.joinCode);
    await expect(classes.takeover(owner, firstClass.joinCode)).rejects.toMatchObject({
      status: 403,
    });
    await classes.setBan('teacherC', firstClass.id, identities.student, true);
    await expect(classes.join('student', firstClass.joinCode)).rejects.toMatchObject({
      status: 403,
      response: { code: 'CLASS_BANNED' },
    });
    await expect(
      monitoring.studentProgress('teacherC', firstClass.id, identities.student),
    ).rejects.toMatchObject({ status: 404 });
    await classes.setBan('teacherC', firstClass.id, identities.student, false);
    await classes.join('student', firstClass.joinCode);
    await classes.leave('student', firstClass.id);
    await expect(classes.create(owner, 'IX C')).rejects.toMatchObject({ status: 403 });
  }, 20_000);
});
