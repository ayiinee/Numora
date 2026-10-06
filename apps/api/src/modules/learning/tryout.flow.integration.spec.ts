import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ForbiddenException, UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  analyticsOutbox,
  notificationOutbox,
  notifications,
  assessmentAttempts,
  assessmentPackages,
  chapters,
  classMemberships,
  classes,
  closeDatabaseConnection,
  competencies,
  getDatabase,
  irtBatches,
  irtItemResults,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  schools,
  scoringPolicyVersions,
  xpLedger,
  subchapters,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { configureApplication } from '../../bootstrap';
import { LearningModule } from './learning.module';
import { AssessmentHistoryService } from './assessment-history.service';
import { TryoutReleaseService } from './tryout-release.service';
import { TryoutService } from './tryout.service';
import { discoverNotificationReleases, drainNotificationBatch } from '../../../../worker/src/notifications';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

function currentMondayWib() {
  const local = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 7 * 60 * 60 * 1000);
}

integration('Tryout lifecycle against PostgreSQL', () => {
  let app: INestApplication | undefined;
  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
  });

  it('allows both affiliations, preserves snapshots, enforces HTTP authorization and hides unreleased results', async () => {
    if (
      !testUrl ||
      !['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname) ||
      process.env.NODE_ENV !== 'test'
    )
      throw new Error(
        'Tryout integration requires isolated localhost PostgreSQL and NODE_ENV=test.',
      );
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const suffix = randomUUID().slice(0, 8);
    const [student, independent, teacher, admin] = await db
      .insert(users)
      .values([
        {
          authUserId: randomUUID(),
          role: 'STUDENT',
          displayName: 'Class Student',
          email: `tryout-student-${suffix}@example.test`,
        },
        {
          authUserId: randomUUID(),
          role: 'STUDENT',
          displayName: 'Independent',
          email: `tryout-independent-${suffix}@example.test`,
        },
        {
          authUserId: randomUUID(),
          role: 'TEACHER',
          displayName: 'Teacher',
          email: `tryout-teacher-${suffix}@example.test`,
        },
        {
          authUserId: randomUUID(),
          role: 'ADMIN',
          displayName: 'Admin',
          email: `tryout-admin-${suffix}@example.test`,
        },
      ])
      .returning({ id: users.id });
    // Substitute the identity/provider boundary only; controllers, services and transactions are real.
    const identity = {
      me: async (authorization?: string) => {
        const token = authorization?.replace(/^Bearer /, '');
        if (token === 'disabled') throw new ForbiddenException('Account disabled');
        const user =
          token === 'student'
            ? student
            : token === 'independent'
              ? independent
              : token === 'teacher'
                ? teacher
                : token === 'admin'
                  ? admin
                  : undefined;
        if (!user) throw new UnauthorizedException();
        return {
          id: user.id,
          role: token === 'teacher' ? 'TEACHER' : token === 'admin' ? 'ADMIN' : 'STUDENT',
        };
      },
    } as unknown as IdentityService;
    const releases = new TryoutReleaseService();
    const tryout = new TryoutService(identity, releases);
    const history = new AssessmentHistoryService(identity, releases);
    const [school] = await db
      .insert(schools)
      .values({
        code: `TRYOUT-${suffix}`,
        name: 'Test School',
      })
      .returning({ id: schools.id });
    const [schoolClass] = await db
      .insert(classes)
      .values({
        schoolId: school!.id,
        teacherUserId: teacher!.id,
        name: 'IX Test',
        joinCode: `TY${suffix}`,
      })
      .returning({ id: classes.id });
    await db.insert(classMemberships).values({
      classId: schoolClass!.id,
      studentUserId: student!.id,
    });
    const [chapter] = await db
      .insert(chapters)
      .values({
        code: `TRYOUT-${suffix}`,
        slug: `TRYOUT-${suffix}`.toLowerCase(),
        name: 'Tryout Chapter',
        displayOrder: parseInt(suffix, 16) % 2_000_000_000,
        status: 'READY',
      })
      .returning({ id: chapters.id });
    const [subchapter] = await db
      .insert(subchapters)
      .values({
        chapterId: chapter!.id,
        code: `TRYOUT-${suffix}`,
        slug: `TRYOUT-${suffix}`.toLowerCase(),
        name: 'Tryout Subchapter',
        displayOrder: 1,
        status: 'READY',
      })
      .returning({ id: subchapters.id });
    const [competency] = await db
      .insert(competencies)
      .values({
        subchapterId: subchapter!.id,
        code: `TRYOUT-${suffix}`,
        description: 'Test competency',
        status: 'READY',
      })
      .returning({ id: competencies.id });
    const [policy] = await db.select({ id: scoringPolicyVersions.id }).from(scoringPolicyVersions)
      .where(eq(scoringPolicyVersions.policyCode,'TRYOUT_PRD_V06'));
    const releaseAt = currentMondayWib();
    await db
      .update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.isDemo, true),
          eq(assessmentPackages.status, 'PUBLISHED'),
          eq(assessmentPackages.releaseAt, releaseAt),
        ),
      );
    const [selectedPackage] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `TRYOUT-TEST-${suffix}`,
        packageVersion: 1,
        name: 'Tryout Test Fixture',
        assessmentType: 'TRYOUT',
        chapterId: chapter!.id,
        releaseAt,
        status: 'PUBLISHED',
        durationSeconds: 3600,
        scoringPolicyVersionId: policy!.id,
        isDemo: true,
      })
      .returning({ id: assessmentPackages.id });
    await expect(
      db.insert(assessmentPackages).values({
        familyCode: `TRYOUT-DUPLICATE-${suffix}`,
        packageVersion: 1,
        name: 'Duplicate Test Fixture',
        assessmentType: 'TRYOUT',
        releaseAt,
        status: 'PUBLISHED',
        scoringPolicyVersionId: policy!.id,
        isDemo: true,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    const versionIds: string[] = [];
    for (let index = 1; index <= 2; index++) {
      const [question] = await db
        .insert(questions)
        .values({
          primaryCompetencyId: competency!.id,
          status: 'READY',
        })
        .returning({ id: questions.id });
      const [variant] = await db
        .insert(questionVariants)
        .values({
          questionId: question!.id,
          variantCode: `TRYOUT-${suffix}-${index}`,
          kind: 'ORIGINAL',
          origin: 'TEST',
        })
        .returning({ id: questionVariants.id });
      const [version] = await db
        .insert(questionVersions)
        .values({
          variantId: variant!.id,
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE',
          stem: { text: `Test question ${index}` },
          optionsOrStatements: ['A', 'B', 'C'].map((id) => ({ id, content: { text: id } })),
          answerKey: { optionId: 'A' },
          explanation: { text: 'A is correct.' },
          difficulty: 'EASY',
          contentStatus: 'READY',
          reviewedByUserId: teacher!.id,
          reviewedAt: new Date(),
        })
        .returning({ id: questionVersions.id });
      versionIds.push(version!.id);
      await db.insert(packageItems).values({
        packageId: selectedPackage!.id,
        questionVersionId: version!.id,
        displayOrder: index,
        maxPoints: '1',
      });
    }
    expect(await tryout.current('independent')).toMatchObject({ state: 'open', eligible: true });
    const [mandiri, mandiriDuplicate] = await Promise.all([
      tryout.start('independent', selectedPackage!.id),
      tryout.start('independent', selectedPackage!.id),
    ]);
    expect(mandiri.id).toBe(mandiriDuplicate.id);
    const [mandiriStored] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, mandiri.id));
    expect(mandiriStored?.classIdAtStart).toBeNull();
    expect(await tryout.current('independent')).toMatchObject({
      state: 'inProgress',
      eligible: false,
      attemptId: mandiri.id,
    });
    expect(await tryout.current('student')).toMatchObject({
      id: selectedPackage!.id,
      state: 'open',
      eligible: true,
      questionCount: 2,
    });
    const [a, b] = await Promise.all([
      tryout.start('student', selectedPackage!.id),
      tryout.start('student', selectedPackage!.id),
    ]);
    expect(a.id).toBe(b.id);
    expect((await tryout.start('student', selectedPackage!.id)).id).toBe(a.id);
    for (const attempt of [a, mandiri]) {
      expect(
        await db
          .select()
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.studentId, attempt.id === a.id ? student!.id : independent!.id),
              eq(assessmentAttempts.packageId, selectedPackage!.id),
            ),
          ),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(analyticsOutbox)
          .where(
            and(
              eq(analyticsOutbox.entityId, attempt.id),
              eq(analyticsOutbox.eventName, 'tryout_started'),
            ),
          ),
      ).toHaveLength(1);
      expect(attempt).not.toHaveProperty('score');
      for (const question of attempt.questions) {
        expect(question).not.toHaveProperty('correctOptionId');
        expect(question).not.toHaveProperty('answerKey');
        expect(question).not.toHaveProperty('explanation');
      }
    }
    const module = await Test.createTestingModule({ imports: [LearningModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const request = (path: string, method = 'GET', body?: object, token = 'student') =>
      fetch(`${base}/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const routes = [
      { path: 'tryout/packages/current', method: 'GET', body: undefined },
      { path: 'tryout/attempts', method: 'POST', body: { packageId: selectedPackage!.id } },
      { path: `tryout/attempts/${a.id}`, method: 'GET', body: undefined },
      {
        path: `tryout/attempts/${a.id}/answers/${a.questions[0]!.questionInstanceId}`,
        method: 'PATCH',
        body: { optionId: 'A' },
      },
      { path: `tryout/attempts/${a.id}/submit`, method: 'POST', body: undefined },
      { path: `tryout/attempts/${a.id}/result`, method: 'GET', body: undefined },
    ];
    for (const route of routes) {
      for (const token of ['', 'invalid', 'teacher', 'admin', 'disabled']) {
        const response = await request(route.path, route.method, route.body, token);
        expect(response.status, `${route.method} ${route.path} (${token || 'anonymous'})`).toBe(
          token === '' || token === 'invalid' ? 401 : 403,
        );
        expect(response.headers.get('content-type')).toContain('application/problem+json');
      }
    }
    for (const route of routes.slice(2)) {
      expect((await request(route.path, route.method, route.body, 'independent')).status).toBe(404);
    }
    for (const token of ['student', 'independent']) {
      const response = await request(
        'tryout/attempts',
        'POST',
        { packageId: selectedPackage!.id },
        token,
      );
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ id: token === 'student' ? a.id : mandiri.id });
      const dashboard = await request('students/me/dashboard', 'GET', undefined, token);
      expect(dashboard.status).toBe(200);
      expect(await dashboard.json()).toMatchObject({ features: { tryout: true } });
    }
    await db
      .insert(classMemberships)
      .values({ classId: schoolClass!.id, studentUserId: independent!.id });
    expect((await tryout.start('independent', selectedPackage!.id)).id).toBe(mandiri.id);
    const [afterJoin] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, mandiri.id));
    expect(afterJoin?.classIdAtStart).toBeNull();
    const [beforeClockSkew] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, a.id));
    const wallTime = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    try {
      const resumed = await tryout.attempt('student', a.id);
      expect(Math.abs(new Date(resumed.serverTime).getTime() - wallTime)).toBeLessThan(10_000);
      expect(
        (await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, a.id)))[0]
          ?.startedAt,
      ).toEqual(beforeClockSkew!.startedAt);
      expect(resumed.deadlineAt).toBe(a.deadlineAt);
      expect(await tryout.current('student')).toMatchObject({ state: 'inProgress' });
    } finally {
      vi.useRealTimers();
    }
    expect(a.questions).toHaveLength(2);
    expect(a.questions[0]).not.toHaveProperty('correctOptionId');
    await tryout.saveAnswer('student', a.id, a.questions[0]!.questionInstanceId, 'A');
    expect((await tryout.attempt('student', a.id)).questions[0]?.selectedOptionId).toBe('A');
    // A save queued behind the finalization lock must use time after acquiring it.
    await db
      .update(assessmentAttempts)
      .set({ deadlineAt: new Date(Date.now() + 150) })
      .where(eq(assessmentAttempts.id, a.id));
    let queuedSave: Promise<unknown> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, a.id))
        .for('update');
      queuedSave = tryout
        .saveAnswer('student', a.id, a.questions[0]!.questionInstanceId, 'B')
        .catch((error) => error);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await queuedSave).toMatchObject({
      status: 409,
      response: { code: 'TRYOUT_DEADLINE_PASSED' },
    });
    await db
      .update(assessmentAttempts)
      .set({ deadlineAt: new Date(Date.now() - 1) })
      .where(eq(assessmentAttempts.id, a.id));
    await expect(
      tryout.saveAnswer('student', a.id, a.questions[0]!.questionInstanceId, 'B'),
    ).rejects.toMatchObject({ status: 409, response: { code: 'TRYOUT_DEADLINE_PASSED' } });
    const mandiriDeadline = new Date(Date.now() - 1);
    await db
      .update(assessmentAttempts)
      .set({ deadlineAt: mandiriDeadline })
      .where(eq(assessmentAttempts.id, mandiri.id));
    expect(await tryout.attempt('independent', mandiri.id)).toMatchObject({
      status: 'submitted', questions: [], deadlineAt: mandiriDeadline.toISOString(), xp: 0, xpPolicyVersion: 1,
    });
    expect(await tryout.current('independent')).toMatchObject({ state: 'waitingIrt' });
    await expect(tryout.result('independent', mandiri.id)).rejects.toMatchObject({
      status: 409,
      response: { code: 'TRYOUT_RESULT_PENDING' },
    });
    const [autoStored] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, mandiri.id));
    expect(autoStored).toMatchObject({
      classIdAtStart: null,
      startedAt: mandiriStored!.startedAt,
      deadlineAt: mandiriDeadline,
      status: 'GRADED',
    });
    const [firstSubmit, duplicateSubmit] = await Promise.all([
      tryout.submit('student', a.id),
      tryout.submit('student', a.id),
    ]);
    expect(firstSubmit).toEqual({ state: 'waitingIrt', xp: 10, xpPolicyVersion: 1 });
    expect(duplicateSubmit).toEqual(firstSubmit);
    const rewards = await db.select().from(xpLedger).where(eq(xpLedger.attemptId,a.id));
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.xpAmount).toBe(10);
    expect(await tryout.current('student')).toMatchObject({ state: 'waitingIrt', eligible: false });
    expect((await tryout.attempt('student', a.id)).questions).toEqual([]);
    const [stored] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, a.id));
    expect(stored).toMatchObject({
      status: 'GRADED',
      score0To100: '50.00',
      classIdAtStart: schoolClass!.id,
    });
    expect(
      await db
        .select()
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.entityId, a.id),
            eq(analyticsOutbox.eventName, 'tryout_completed'),
          ),
        ),
    ).toHaveLength(1);
    await expect(tryout.result('student', a.id)).rejects.toMatchObject({
      status: 409,
      response: { code: 'TRYOUT_RESULT_PENDING' },
    });
    expect((await history.list('student')).records[0]).toMatchObject({
      attemptId: a.id,
      resultState: 'waitingIrt',
      score: null,
      xpState: 'ready', xp: 10, tryoutXpPolicyVersion: 1,
    });
    const [batch] = await db
      .insert(irtBatches)
      .values({
        packageId: selectedPackage!.id,
        batchKind: 'TEST',
        modelVersion: 'fixture',
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        resultReleasedAt: new Date(),
      })
      .returning({ id: irtBatches.id });
    await db.insert(irtItemResults).values(
      versionIds.map((versionId, index) => ({
        batchId: batch!.id,
        questionVersionId: versionId,
        sampleSize: index === 0 ? 30 : 29,
        dataStatus: index === 0 ? 'SUFFICIENT' : 'INSUFFICIENT',
      })),
    );
    await expect(tryout.result('student', a.id)).rejects.toMatchObject({ status: 409 });
    await discoverNotificationReleases();
    expect(await db.select().from(notificationOutbox).where(eq(notificationOutbox.sourceKey, `TRYOUT_RESULT_READY:${a.id}`))).toHaveLength(0);
    await db
      .update(irtItemResults)
      .set({ sampleSize: 30, dataStatus: 'SUFFICIENT' })
      .where(eq(irtItemResults.questionVersionId, versionIds[1]!));
    expect(await tryout.result('student', a.id)).toMatchObject({
      score: 50,
      correctCount: 1,
      questionCount: 2,
      xp: 10, xpPolicyVersion: 1,
    });
    expect(await tryout.current('student')).toMatchObject({
      state: 'resultReady',
      eligible: false,
    });
    expect((await history.list('student')).records[0]).toMatchObject({
      attemptId: a.id,
      resultState: 'ready',
      score: 50,
    });
    await expect(tryout.result('independent', a.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, a.id))).toHaveLength(1);
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, mandiri.id))).toHaveLength(1);
    const waitingResponse = await request(`tryout/attempts/${mandiri.id}`, 'GET', undefined, 'independent');
    const waitingBody = await waitingResponse.json();
    expect(waitingBody).toMatchObject({ xp: 0, status: 'submitted', questions: [] });
    expect(waitingBody).not.toHaveProperty('score');
    await discoverNotificationReleases();
    await discoverNotificationReleases();
    await drainNotificationBatch(100);
    expect(await db.select().from(notifications).where(and(eq(notifications.sourceKey, `TRYOUT_RESULT_READY:${a.id}`), eq(notifications.recipientId, student!.id)))).toHaveLength(1);
    expect(await db.select().from(notifications).where(and(eq(notifications.sourceKey, `TRYOUT_RESULT_READY:${mandiri.id}`), eq(notifications.recipientId, independent!.id)))).toHaveLength(1);
    expect(await db.select().from(notifications).where(and(eq(notifications.sourceKey, `TRYOUT_OPENED:${selectedPackage!.id}`), eq(notifications.recipientId, independent!.id)))).toHaveLength(1);
    // Availability must never be inferred from class affiliation, including an expired current package.
    for (const unavailable of [
      { status: 'DRAFT' as const },
      {
        status: 'PUBLISHED' as const,
        releaseAt: new Date(releaseAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      { releaseAt, closeAt: new Date(Date.now() - 1000) },
    ]) {
      await db
        .update(assessmentPackages)
        .set(unavailable)
        .where(eq(assessmentPackages.id, selectedPackage!.id));
      for (const token of ['student', 'independent']) {
        expect(await tryout.current(token)).toEqual({ state: 'unavailable' });
        const response = await request(
          'tryout/attempts',
          'POST',
          { packageId: selectedPackage!.id },
          token,
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'TRYOUT_PACKAGE_UNAVAILABLE' });
      }
    }
    await expect(tryout.start('student', randomUUID())).rejects.toMatchObject({ status: 409 });
  }, 60_000);
});
