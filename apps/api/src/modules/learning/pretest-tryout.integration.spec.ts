import { seedLifecycleDemo } from '@tka/database/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  closeDatabaseConnection,
  getDatabase,
  levelProgress,
  levels,
  subchapters,
  users,
  xpLedger,
  analyticsOutbox,
  pretestChapterStates,
  tryoutBatchCloseAt,
} from '@tka/database';
import { finalizeTryout } from '@tka/assessment-engine';
import { recoverOverdueTryouts } from '../../../../worker/src/tryout-recovery';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { LearningModule } from './learning.module';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;
integration('Pretest and continued Tryout lifecycle (isolated TEST/DEMO)', () => {
  let app: INestApplication;
  let origin: string;
  let fixture: Awaited<ReturnType<typeof seedLifecycleDemo>>;
  const actors = new Map<string, string>();
  const http = async (path: string, method = 'GET', body?: unknown, token = 'student') => {
    const response = await fetch(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  beforeAll(async () => {
    if (
      !testUrl ||
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)
    )
      throw new Error('Isolated local PostgreSQL required.');
    process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
    process.env.DATABASE_URL = testUrl;
    const db = getDatabase().db;
    const suffix = randomUUID();
    for (const token of [
      'student',
      'other',
      'skip',
      'teacher',
      'zero',
      'seven',
      'eight',
      'eighteen',
      'nineteen',
      'twenty',
      'deadline',
      'tryout',
    ]) {
      const [actor] = await db
        .insert(users)
        .values({
          authUserId: randomUUID(),
          role: token === 'teacher' ? 'TEACHER' : 'STUDENT',
          displayName: `TEST ONLY ${token}`,
          email: `${suffix}-${token}@example.test`,
        })
        .returning();
      actors.set(token, actor!.id);
    }
    // Fixture isolation only; this never runs against shared development/staging.
    await db
      .update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.isDemo, true),
          eq(assessmentPackages.status, 'PUBLISHED'),
        ),
      );
    fixture = await seedLifecycleDemo(suffix);
    const module = await Test.createTestingModule({ imports: [LearningModule] })
      .overrideProvider(IdentityService)
      .useValue({
        me: async (auth?: string) => {
          const token = auth?.replace(/^Bearer /, '') ?? '';
          if (!actors.has(token)) throw new UnauthorizedException();
          return {
            id: actors.get(token)!,
            role: token === 'teacher' ? 'TEACHER' : 'STUDENT',
            status: 'ACTIVE',
          };
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
  });

  it('allows independent Students, does not consume Skip, and concurrently starts one pinned 20-item session', async () => {
    const skipped = await http(`pretest/chapters/${fixture.chapterId}/skip`, 'POST');
    expect(skipped.body).toMatchObject({ state: 'skipped', canStart: true, skipped: true });
    const [one, two] = await Promise.all([
      http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }),
      http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }),
    ]);
    expect(one.status).toBe(201);
    expect(two.body.id).toBe(one.body.id);
    expect(one.body.questions).toHaveLength(20);
    expect(JSON.stringify(one.body)).not.toMatch(/answerKey|explanation|correctOptionId/);
    const question = one.body.questions[0];
    const saved = await http(
      `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
      'PATCH',
      { answer: { optionId: 'A' }, expectedRevision: 0 },
    );
    expect(saved.body).toMatchObject({ revision: 1, answer: { optionId: 'A' } });
    const retry = await http(
      `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
      'PATCH',
      { answer: { optionId: 'A' }, expectedRevision: 0 },
    );
    expect(retry.body.revision).toBe(1);
    const stale = await http(
      `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
      'PATCH',
      { answer: { optionId: 'B' }, expectedRevision: 0 },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('ANSWER_REVISION_CONFLICT');
    expect(
      (
        await http(
          `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
          'PATCH',
          { answer: { optionId: 'Z' }, expectedRevision: 1 },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await http(
          `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
          'PATCH',
          { answer: { optionId: 'A' } },
        )
      ).status,
    ).toBe(400);
    await http(`pretest/chapters/${fixture.chapterId}/skip`, 'POST');
    const resumed = await http(`pretest/attempts/${one.body.id}`);
    expect(resumed.body.questions[0]).toMatchObject({ answer: { optionId: 'A' }, revision: 1 });
    const [stored] = await getDatabase()
      .db.select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, one.body.id));
    expect(stored!.deadlineAt).toBeNull();
    // Login/GET/Skip never changes the original timer/content pins.
    const repeated = await http('pretest/attempts', 'POST', { chapterId: fixture.chapterId });
    expect(repeated.body.startedAt).toBe(one.body.startedAt);
    expect((await http(`pretest/attempts/${one.body.id}`, 'GET', undefined, 'other')).status).toBe(
      404,
    );
    expect(
      (await http(`pretest/attempts/${one.body.id}`, 'GET', undefined, 'teacher')).status,
    ).toBe(403);
    expect(
      (await http(`pretest/attempts/${one.body.id}`, 'GET', undefined, 'unknown')).status,
    ).toBe(401);
    const [first, second] = await Promise.all([
      http(`pretest/attempts/${one.body.id}/submit`, 'POST'),
      http(`pretest/attempts/${one.body.id}/submit`, 'POST'),
    ]);
    expect(first.body).toEqual(second.body);
    expect(first.body).toMatchObject({
      correctCount: 1,
      initialLevel: 1,
      mappingStatus: 'applied',
    });
    expect((await http('pretest/attempts', 'POST', { chapterId: fixture.chapterId })).status).toBe(
      409,
    );
    expect(
      (
        await http(
          `pretest/attempts/${one.body.id}/answers/${question.questionInstanceId}`,
          'PATCH',
          { answer: { optionId: 'B' }, expectedRevision: 1 },
        )
      ).status,
    ).toBe(409);
    const rewards = await getDatabase()
      .db.select()
      .from(xpLedger)
      .where(eq(xpLedger.attemptId, one.body.id));
    expect(rewards).toHaveLength(0);
    const events = await getDatabase()
      .db.select()
      .from(analyticsOutbox)
      .where(
        and(
          eq(analyticsOutbox.entityId, one.body.id),
          eq(analyticsOutbox.eventName, 'pretest_completed'),
        ),
      );
    expect(events).toHaveLength(1);
    expect((await http(`pretest/attempts/${one.body.id}/result`)).body).toEqual(first.body);
  });

  it('applies all placement boundaries additively and leaves Drill completion/latest/best intact', async () => {
    const db = getDatabase().db;
    const chapterLevels = await db
      .select({ id: levels.id, number: levels.levelNumber })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .where(eq(subchapters.chapterId, fixture.chapterId));
    const existing = chapterLevels.find((level) => level.number === 5)!;
    await db.insert(levelProgress).values({
      studentId: actors.get('seven')!,
      levelId: existing.id,
      unlockedAt: new Date(),
      completedAt: new Date(),
      latestScore: 90,
      bestScore: 100,
      latestStars: 2,
      bestStars: 3,
    });
    for (const [token, correct, initialLevel] of [
      ['zero', 0, 1],
      ['seven', 7, 1],
      ['eight', 8, 2],
      ['eighteen', 18, 2],
      ['nineteen', 19, 3],
      ['twenty', 20, 3],
    ] as const) {
      const attempt = (
        await http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }, token)
      ).body;
      for (const question of attempt.questions.slice(0, correct))
        await http(
          `pretest/attempts/${attempt.id}/answers/${question.questionInstanceId}`,
          'PATCH',
          { answer: { optionId: 'A' }, expectedRevision: 0 },
          token,
        );
      const result = await http(`pretest/attempts/${attempt.id}/submit`, 'POST', undefined, token);
      expect(result.body).toMatchObject({
        correctCount: correct,
        initialLevel,
        score: correct * 5,
        mappingStatus: 'applied',
      });
      expect(result.body.unlockedLevels).toHaveLength(initialLevel * 2);
      const progress = await db
        .select()
        .from(levelProgress)
        .where(eq(levelProgress.studentId, actors.get(token)!));
      expect(
        progress
          .filter((row) => row.levelId !== existing.id)
          .every(
            (row) => row.completedAt === null && row.latestScore === null && row.bestScore === null,
          ),
      ).toBe(true);
    }
    const [preserved] = await db
      .select()
      .from(levelProgress)
      .where(
        and(
          eq(levelProgress.studentId, actors.get('seven')!),
          eq(levelProgress.levelId, existing.id),
        ),
      );
    expect(preserved).toMatchObject({
      latestScore: 90,
      bestScore: 100,
      latestStars: 2,
      bestStars: 3,
    });
    expect(preserved!.completedAt).not.toBeNull();
    expect(
      (await http('students/me/assessment-results', 'GET', undefined, 'eight')).body.records,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: 'pretest',
          xpState: 'notApplicable',
          resultState: 'ready',
          score: 40,
        }),
      ]),
    );
  }, 60000);

  it('serializes start/Skip/submit and can Skip even when no approved package is available', async () => {
    const [started] = await Promise.all([
      http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }, 'skip'),
      http(`pretest/chapters/${fixture.chapterId}/skip`, 'POST', undefined, 'skip'),
    ]);
    expect(started.body.questions).toHaveLength(20);
    const completed = await http(
      `pretest/attempts/${started.body.id}/submit`,
      'POST',
      undefined,
      'skip',
    );
    expect(completed.status).toBe(201);
    const skipped = await http(
      `pretest/chapters/${fixture.chapterId}/skip`,
      'POST',
      undefined,
      'skip',
    );
    expect(skipped.status).toBe(409);
    const states = await getDatabase()
      .db.select()
      .from(pretestChapterStates)
      .where(
        and(
          eq(pretestChapterStates.studentId, actors.get('skip')!),
          eq(pretestChapterStates.chapterId, fixture.chapterId),
        ),
      );
    expect(states).toHaveLength(1);
  });

  it('delivers 30 mixed questions, validates raw answers, freezes one submission and keeps grading/release gated', async () => {
    const started = await http(
      'tryout/attempts',
      'POST',
      { packageId: fixture.tryoutPackageId },
      'tryout',
    );
    expect(started.status).toBe(201);
    const attempt = started.body;
    expect(attempt.questions).toHaveLength(30);
    expect(attempt.xpPolicyVersion).toBeNull();
    const mcma = attempt.questions.find(
      (question: { type: string }) => question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
    );
    const category = attempt.questions.find(
      (question: { type: string }) => question.type === 'CATEGORY',
    );
    expect(
      (
        await http(
          `tryout/attempts/${attempt.id}/answers/${mcma.questionInstanceId}`,
          'PATCH',
          { answer: { optionIds: ['C', 'A'] } },
          'tryout',
        )
      ).body.answer,
    ).toEqual({ optionIds: ['A', 'C'] });
    expect(
      (
        await http(
          `tryout/attempts/${attempt.id}/answers/${category.questionInstanceId}`,
          'PATCH',
          { answer: { categoryByStatementId: { A: 'Y' } } },
          'tryout',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await http(
          `tryout/attempts/${attempt.id}/answers/${category.questionInstanceId}`,
          'PATCH',
          { answer: { categoryByStatementId: { X: 'Y' } } },
          'tryout',
        )
      ).status,
    ).toBe(400);
    const [one, two] = await Promise.all([
      http(`tryout/attempts/${attempt.id}/submit`, 'POST', undefined, 'tryout'),
      http(`tryout/attempts/${attempt.id}/submit`, 'POST', undefined, 'tryout'),
    ]);
    expect(one.status).toBe(201);
    expect(two.body).toEqual(one.body);
    expect(one.body).toMatchObject({ state: 'waitingIrt', xp: null });
    const [stored] = await getDatabase()
      .db.select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attempt.id));
    expect(stored).toMatchObject({ status: 'SUBMITTED', rawPoints: null, score0To100: null });
    const answers = await getDatabase()
      .db.select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptItemId, mcma.questionInstanceId));
    expect(answers[0]).toMatchObject({
      answer: { optionIds: ['A', 'C'] },
      awardedPoints: null,
      gradedAt: null,
    });
    expect(
      (await http(`tryout/attempts/${attempt.id}/result`, 'GET', undefined, 'tryout')).status,
    ).toBe(409);
    expect(
      (
        await http(
          `tryout/attempts/${attempt.id}/answers/${mcma.questionInstanceId}`,
          'PATCH',
          { answer: null },
          'tryout',
        )
      ).status,
    ).toBe(409);
  });

  it('auto-finalizes without a browser, survives repeated recovery and locks Past packages for every Student', async () => {
    const attempt = (
      await http('tryout/attempts', 'POST', { packageId: fixture.tryoutPackageId }, 'deadline')
    ).body;
    const db = getDatabase().db;
    await db
      .update(assessmentAttempts)
      .set({ deadlineAt: new Date(Date.now() - 1000) })
      .where(eq(assessmentAttempts.id, attempt.id));
    await Promise.all([
      finalizeTryout({ kind: 'automatic', attemptId: attempt.id }),
      recoverOverdueTryouts(),
    ]);
    await recoverOverdueTryouts();
    const [stored] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attempt.id));
    expect(stored!.status).toBe('SUBMITTED');
    const events = await db
      .select()
      .from(analyticsOutbox)
      .where(
        and(
          eq(analyticsOutbox.entityId, attempt.id),
          eq(analyticsOutbox.eventName, 'tryout_completed'),
        ),
      );
    expect(events).toHaveLength(1);
    await db
      .update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(eq(assessmentPackages.id, fixture.tryoutPackageId));
    const past = (
      await http(`tryout/packages/${fixture.tryoutPackageId}`, 'GET', undefined, 'other')
    ).body;
    expect(past).toMatchObject({
      periodState: 'past',
      eligible: false,
      state: 'unavailable',
      attemptId: null,
    });
    const attempted = (
      await http(`tryout/packages/${fixture.tryoutPackageId}`, 'GET', undefined, 'deadline')
    ).body;
    expect(attempted).toMatchObject({
      periodState: 'past',
      eligible: false,
      state: 'waitingIrt',
      attemptId: attempt.id,
    });
    expect(
      (await http('tryout/attempts', 'POST', { packageId: fixture.tryoutPackageId }, 'other'))
        .status,
    ).toBe(409);
    const listing = await http('tryout/packages', 'GET', undefined, 'other');
    expect(listing.body.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fixture.tryoutPackageId,
          periodState: 'past',
          eligible: false,
        }),
      ]),
    );
    expect((await http('tryout/packages?cursor=invalid')).status).toBe(400);
    const [policy] = await db
      .select({ id: assessmentPackages.scoringPolicyVersionId })
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, fixture.tryoutPackageId));
    const [legacy] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'TEST ONLY legacy weekly metadata',
        assessmentType: 'TRYOUT',
        purpose: 'REGULAR',
        isDemo: true,
        status: 'PUBLISHED',
        scoringPolicyVersionId: policy!.id,
        releaseAt: new Date('2026-09-20T17:00:00Z'),
        durationSeconds: 600,
      })
      .returning();
    expect((await http(`tryout/packages/${legacy!.id}`)).body).toMatchObject({
      periodState: 'past',
      eligible: false,
      closeAt: null,
      resultDueAt: null,
    });
    expect((await http('tryout/attempts', 'POST', { packageId: legacy!.id })).status).toBe(409);
    expect(tryoutBatchCloseAt(new Date('2026-10-04T17:00:00Z')).toISOString()).toBe(
      '2026-10-11T16:59:00.000Z',
    );
  });

  it('resumes pinned content after package archive and allows Skip without any available package', async () => {
    const db = getDatabase().db;
    const active = (
      await http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }, 'other')
    ).body;
    await db
      .update(assessmentPackages)
      .set({ status: 'ARCHIVED' })
      .where(eq(assessmentPackages.id, fixture.pretestPackageId));
    expect(
      (await http(`pretest/attempts/${active.id}`, 'GET', undefined, 'other')).body.questions,
    ).toHaveLength(20);
    expect(
      (await http('pretest/attempts', 'POST', { chapterId: fixture.chapterId }, 'other')).body.id,
    ).toBe(active.id);
    const [chapter] = await db
      .insert((await import('@tka/database')).chapters)
      .values({
        code: `NO-PACK-${randomUUID()}`,
        slug: randomUUID(),
        name: 'TEST ONLY no approved blueprint',
        displayOrder: sql`(select coalesce(max(display_order),0)+1 from chapters)`,
        status: 'READY',
      })
      .returning();
    const state = await http(`pretest/chapters/${chapter!.id}`);
    expect(state.body).toMatchObject({ state: 'unavailable', canStart: false, canSkip: true });
    expect((await http('pretest/attempts', 'POST', { chapterId: chapter!.id })).status).toBe(503);
    const skipped = await http(`pretest/chapters/${chapter!.id}/skip`, 'POST');
    expect(skipped.body).toMatchObject({ state: 'skipped', canStart: false });
    const main = await getDatabase().client.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE numora_main_runtime');
      return tx.unsafe('SELECT student_id FROM public.pretest_chapter_states WHERE chapter_id=$1', [
        chapter!.id,
      ]);
    });
    expect(main).toHaveLength(1);
  });
});
