import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  analyticsOutbox,
  notificationOutbox,
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  chapters,
  closeDatabaseConnection,
  competencies,
  getDatabase,
  levelProgress,
  levels,
  learningVideos,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
  users,
  videoSubchapterMappings,
  xpLedger,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { DrillAssessmentService } from './drill-assessment.service';
import { AssessmentHistoryService } from './assessment-history.service';
import { LearningCatalogService } from './learning-catalog.service';
import { TryoutReleaseService } from './tryout-release.service';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('Drill lifecycle against PostgreSQL', () => {
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeDatabaseConnection();
  });

  it('keeps reward/submit atomic and idempotent, reuses the MVP package, and protects historical results', async () => {
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const suffix = randomUUID().slice(0, 8);
    const [student, stranger] = await db
      .insert(users)
      .values(
        [1, 2].map((number) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: `Student ${number}`,
          email: `drill-${number}-${suffix}@example.test`,
        })),
      )
      .returning({ id: users.id });
    const identity = {
      me: async (authorization?: string) => ({
        id: authorization === 'stranger' ? stranger!.id : student!.id,
        role: 'STUDENT',
      }),
    } as unknown as IdentityService;
    const learning = new DrillAssessmentService(identity);
    const catalog = new LearningCatalogService(identity);
    const history = new AssessmentHistoryService(identity, new TryoutReleaseService());
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
    const [firstLevel, nextLevel] = await db
      .insert(levels)
      .values(
        [1, 2].map((number) => ({
          subchapterId: subchapter!.id,
          description: null,
          levelNumber: number,
          status: 'READY' as const,
        })),
      )
      .returning({ id: levels.id });
    const [competency] = await db
      .insert(competencies)
      .values({
        subchapterId: subchapter!.id,
        code: `COMP-${suffix}`,
        description: 'Fixture',
        status: 'READY',
      })
      .returning({ id: competencies.id });
    const [policy] = await db
      .select({ id: scoringPolicyVersions.id })
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'DRILL_PRD_V06'),
          eq(scoringPolicyVersions.version, 1),
        ),
      )
      .limit(1);
    expect(policy).toBeDefined();
    const [firstPackage, secondPackage] = await db
      .insert(assessmentPackages)
      .values(
        [1, 2].map((number) => ({
          familyCode: `TEST-DRILL-${suffix}-${number}`,
          packageVersion: 1,
          name: `Drill ${suffix} ${number}`,
          assessmentType: 'DRILL' as const,
          chapterId: chapter!.id,
          levelId: firstLevel!.id,
          variantIndex: number,
          isDemo: true,
          scoringPolicyVersionId: policy!.id,
          releaseAt: new Date(),
          status: 'PUBLISHED' as const,
        })),
      )
      .returning({ id: assessmentPackages.id });
    // A scheduled package sorts first but must not be available before publication.
    await db.insert(assessmentPackages).values({
      familyCode: `TEST-DRILL-${suffix}-SCHEDULED`,
      packageVersion: 1,
      name: `Scheduled ${suffix}`,
      assessmentType: 'DRILL',
      chapterId: chapter!.id,
      levelId: firstLevel!.id,
      variantIndex: 0,
      isDemo: true,
      scoringPolicyVersionId: policy!.id,
      releaseAt: new Date(Date.now() + 86_400_000),
      status: 'PUBLISHED',
    });
    const [lockedPackage] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `TEST-DRILL-${suffix}-LOCKED`,
        packageVersion: 1,
        name: `Locked ${suffix}`,
        assessmentType: 'DRILL',
        chapterId: chapter!.id,
        levelId: nextLevel!.id,
        variantIndex: 1,
        isDemo: true,
        scoringPolicyVersionId: policy!.id,
        releaseAt: new Date(),
        status: 'PUBLISHED',
      })
      .returning({ id: assessmentPackages.id });

    for (let number = 1; number <= 10; number++) {
      const [question] = await db
        .insert(questions)
        .values({
          primaryCompetencyId: competency!.id,
          sourceRef: `TEST-${suffix}-${number}`,
          status: 'READY',
        })
        .returning({ id: questions.id });
      const [original] = await db
        .insert(questionVariants)
        .values({
          questionId: question!.id,
          variantCode: `ORIG-${suffix}-${number}`,
          kind: 'ORIGINAL',
          origin: 'TEST',
        })
        .returning({ id: questionVariants.id });
      for (const variantNo of [1, 2]) {
        const variant =
          variantNo === 1
            ? original!
            : (
                await db
                  .insert(questionVariants)
                  .values({
                    questionId: question!.id,
                    originalVariantId: original!.id,
                    variantCode: `VAR-${suffix}-${number}`,
                    kind: 'VARIANT',
                    origin: 'TEST',
                  })
                  .returning({ id: questionVariants.id })
              )[0]!;
        const [version] = await db
          .insert(questionVersions)
          .values({
            variantId: variant.id,
            versionNumber: 1,
            questionType: 'SINGLE_CHOICE',
            stem: { text: `Soal ${number}, varian ${variantNo}` },
            optionsOrStatements: ['A', 'B', 'C', 'D'].map((id) => ({
              id,
              content: { text: id === 'A' ? 'Benar' : 'Salah' },
            })),
            answerKey: { optionId: 'A' },
            explanation: { text: 'Demo' },
            difficulty: 'EASY',
            contentStatus: 'READY',
            reviewedAt: new Date(),
            reviewedByUserId: student!.id,
          })
          .returning({ id: questionVersions.id });
        await db.insert(packageItems).values({
          packageId: variantNo === 1 ? firstPackage!.id : secondPackage!.id,
          questionVersionId: version!.id,
          displayOrder: number,
          maxPoints: '1',
        });
      }
    }

    await db.insert(levelProgress).values({ studentId: student!.id, levelId: nextLevel!.id });
    expect(
      (await catalog.subchapter('student', subchapter!.id)).levels.find(
        (level) => level.id === nextLevel!.id,
      )?.status,
    ).toBe('locked');
    await expect(learning.start('student', nextLevel!.id)).rejects.toMatchObject({ status: 403 });
    // A pre-existing attempt cannot bypass the current level eligibility check.
    await db.insert(assessmentAttempts).values({
      studentId: stranger!.id,
      packageId: lockedPackage!.id,
      assessmentType: 'DRILL',
      chapterIdAtStart: chapter!.id,
      levelIdAtStart: nextLevel!.id,
      scoringPolicyVersionId: policy!.id,
    });
    await expect(learning.start('stranger', nextLevel!.id)).rejects.toMatchObject({ status: 403 });
    expect(
      (await catalog.subchapter('stranger', subchapter!.id)).levels.find(
        (level) => level.id === nextLevel!.id,
      )?.status,
    ).toBe('locked');
    // Synthetic provenance cannot authorize distribution without isolated opt-in.
    vi.stubEnv('ALLOW_SYNTHETIC_CONTENT', 'false');
    await expect(learning.start('student', firstLevel!.id)).rejects.toMatchObject({
      status: 503,
      response: { code: 'DRILL_PACKAGE_UNAVAILABLE' },
    });
    vi.stubEnv('ALLOW_SYNTHETIC_CONTENT', 'true');
    vi.stubEnv('DOMAIN_ANALYTICS_ENABLED', 'false');
    const untracked = await learning.start('stranger', firstLevel!.id);
    await learning.saveAnswer(
      'stranger',
      untracked.id,
      untracked.questions[0]!.questionInstanceId,
      'A',
    );
    expect(
      await db.select().from(analyticsOutbox).where(eq(analyticsOutbox.entityId, untracked.id)),
    ).toHaveLength(0);
    vi.stubEnv('DOMAIN_ANALYTICS_ENABLED', 'true');
    expect((await learning.start('stranger', firstLevel!.id)).id).toBe(untracked.id);
    expect(
      await db.select().from(analyticsOutbox).where(eq(analyticsOutbox.entityId, untracked.id)),
    ).toHaveLength(0);
    const attempt = await learning.start('student', firstLevel!.id);
    expect(attempt.isDemo).toBe(true);
    expect(attempt.levelTitle).toBe('Level 1');
    expect(attempt.questions).toHaveLength(10);
    await expect(
      db.insert(assessmentAttempts).values({
        studentId: student!.id,
        packageId: firstPackage!.id,
        assessmentType: 'DRILL',
        chapterIdAtStart: chapter!.id,
        levelIdAtStart: firstLevel!.id,
        scoringPolicyVersionId: policy!.id,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      db.insert(assessmentAttempts).values({
        studentId: student!.id,
        packageId: firstPackage!.id,
        assessmentType: 'DRILL',
        chapterIdAtStart: chapter!.id,
        levelIdAtStart: nextLevel!.id,
        scoringPolicyVersionId: policy!.id,
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    const concurrentStarts = await Promise.all([
      learning.start('student', firstLevel!.id),
      learning.start('student', firstLevel!.id),
    ]);
    expect(concurrentStarts.map((item) => item.id)).toEqual([attempt.id, attempt.id]);
    await expect(learning.attempt('stranger', attempt.id)).rejects.toMatchObject({ status: 404 });
    await learning.saveAnswer('student', attempt.id, attempt.questions[0]!.questionInstanceId, 'B');
    expect((await learning.attempt('student', attempt.id)).questions[0]?.selectedOptionId).toBe(
      'B',
    );
    await Promise.all(
      [1, 2].map(() =>
        learning.saveAnswer('student', attempt.id, attempt.questions[0]!.questionInstanceId, 'B'),
      ),
    );
    const beforeFailure = (
      await db
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptItemId, attempt.questions[0]!.questionInstanceId))
    )[0];
    const trigger = `test_answer_${randomUUID().replaceAll('-', '')}`;
    await db.execute(
      sql.raw(`create function ${trigger}() returns trigger language plpgsql as $$ begin
      if NEW.entity_id = '${attempt.id}'::uuid and NEW.event_name = 'question_answered' then
        raise exception 'TEST ONLY analytics unavailable'; end if; return NEW; end $$`),
    );
    await db.execute(
      sql.raw(`create trigger ${trigger} before insert on analytics_outbox
      for each row execute function ${trigger}()`),
    );
    try {
      await expect(
        learning.saveAnswer('student', attempt.id, attempt.questions[0]!.questionInstanceId, null),
      ).rejects.toThrow();
      expect(
        (
          await db
            .select()
            .from(attemptAnswers)
            .where(eq(attemptAnswers.attemptItemId, attempt.questions[0]!.questionInstanceId))
        )[0],
      ).toEqual(beforeFailure);
    } finally {
      await db.execute(sql.raw(`drop trigger ${trigger} on analytics_outbox`));
      await db.execute(sql.raw(`drop function ${trigger}()`));
    }
    await learning.saveAnswer(
      'student',
      attempt.id,
      attempt.questions[0]!.questionInstanceId,
      null,
    );
    expect(
      (await learning.attempt('student', attempt.id)).questions[0]?.selectedOptionId,
    ).toBeNull();
    for (const item of attempt.questions.slice(0, 8))
      await learning.saveAnswer('student', attempt.id, item.questionInstanceId, 'A');

    const [resultA, resultB] = await Promise.all([
      learning.submit('student', attempt.id),
      learning.submit('student', attempt.id),
    ]);
    expect(resultA).toMatchObject({ score: 80, mastered: true, unlockedLevelId: nextLevel!.id });
    expect(resultA.levelTitle).toBe('Level 1');
    expect(resultB).toMatchObject({ attemptId: attempt.id, score: 80 });
    const rewards = await db.select().from(xpLedger).where(eq(xpLedger.attemptId, attempt.id));
    expect(rewards).toHaveLength(1);
    expect(resultA.xp).toBe(rewards[0]?.xpAmount);
    expect(resultA.xp).toBeGreaterThanOrEqual(80);
    expect(resultA.xp).toBeLessThanOrEqual(130);
    expect(
      await db
        .select()
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.recipientId, student!.id),
            eq(notificationOutbox.kind, 'LEVEL_UNLOCKED'),
          ),
        ),
    ).toHaveLength(1);
    expect(resultA.recommendations).toEqual([]);
    expect(resultA).toMatchObject({
      drillPolicyVersion: 2,
      stars: 2,
      reward: { policyVersion: 2, baseXp: 80 },
    });
    expect(resultB.reward).toEqual(resultA.reward);
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, attempt.id))).toHaveLength(
      1,
    );
    expect((await history.list('student')).records[0]).toMatchObject({
      attemptId: attempt.id,
      activity: 'drill',
      resultState: 'ready',
      score: 80,
    });
    const events = await db
      .select({ id: analyticsOutbox.id })
      .from(analyticsOutbox)
      .where(
        and(
          eq(analyticsOutbox.entityId, attempt.id),
          eq(analyticsOutbox.eventName, 'drill_completed'),
        ),
      );
    expect(events).toHaveLength(1);
    const domainEvents = await db
      .select()
      .from(analyticsOutbox)
      .where(eq(analyticsOutbox.entityId, attempt.id));
    for (const name of ['drill_started', 'drill_submitted', 'level_unlocked'])
      expect(domainEvents.filter((event) => event.eventName === name)).toHaveLength(1);
    expect(domainEvents.filter((event) => event.eventName === 'question_answered')).toHaveLength(
      10,
    );
    for (const event of domainEvents.filter((event) => event.eventName !== 'drill_completed')) {
      expect(event.correlationId).toBe(attempt.id);
      expect(event.actorUserId).toBe(student!.id);
      expect(event.payload).toMatchObject({
        attemptId: attempt.id,
        assessmentType: 'DRILL',
        packageId: firstPackage!.id,
        packageVersion: 1,
        scoringPolicyVersionId: policy!.id,
      });
      for (const forbidden of ['answer', 'answerKey', 'optionId', 'score', 'email', 'displayName'])
        expect(event.payload).not.toHaveProperty(forbidden);
    }

    await expect(learning.result('stranger', attempt.id)).rejects.toMatchObject({ status: 404 });
    expect(
      (await catalog.subchapter('student', subchapter!.id)).levels.find(
        (level) => level.id === nextLevel!.id,
      )?.status,
    ).toBe('open');

    const retry = await learning.start('student', firstLevel!.id);
    expect(retry.id).not.toBe(attempt.id);
    expect(retry.questions[0]?.stem).toContain('varian 1');
    for (const item of retry.questions.slice(0, 7))
      await learning.saveAnswer('student', retry.id, item.questionInstanceId, 'A');
    const [video] = await db
      .insert(learningVideos)
      .values({
        title: 'Ulang materi',
        url: 'https://www.youtube.com/watch?v=TESTVIDEO00',
        source: 'TEST',
        curationStatus: 'READY',
      })
      .returning({ id: learningVideos.id });
    await db.insert(videoSubchapterMappings).values({
      videoId: video!.id,
      subchapterId: subchapter!.id,
      recommendationOrder: 1,
      status: 'READY',
    });
    const failedRetry = await learning.submit('student', retry.id);
    expect(failedRetry).toMatchObject({ score: 70, mastered: false, unlockedLevelId: null });
    expect(failedRetry.recommendations).toMatchObject([{ id: video!.id }]);
    const [progress] = await db
      .select()
      .from(levelProgress)
      .where(eq(levelProgress.levelId, firstLevel!.id));
    expect(progress).toMatchObject({
      latestScore: 70,
      latestStars: 2,
      latestAttemptId: retry.id,
      bestScore: 80,
      bestStars: 2,
    });
    const retryHistory = await history.list('student', undefined, firstLevel!.id);
    expect(retryHistory.records).toHaveLength(2);
    expect(retryHistory.records.find((record) => record.attemptId === attempt.id)).toMatchObject({
      score: 80,
      levelId: firstLevel!.id,
    });
    expect(retryHistory.records.find((record) => record.attemptId === retry.id)).toMatchObject({
      score: 70,
      levelId: firstLevel!.id,
    });
    expect(
      (await catalog.subchapter('student', subchapter!.id)).levels.find(
        (level) => level.id === nextLevel!.id,
      )?.status,
    ).toBe('open');
    await expect(
      learning.saveAnswer('student', retry.id, retry.questions[0]!.questionInstanceId, 'B'),
    ).rejects.toMatchObject({ status: 409 });
    // Archiving source content cannot rewrite a completed attempt's snapshot.
    await db
      .update(questionVersions)
      .set({ contentStatus: 'ARCHIVED' })
      .where(
        eq(
          questionVersions.variantId,
          (
            await db
              .select()
              .from(questionVariants)
              .where(eq(questionVariants.variantCode, `ORIG-${suffix}-1`))
          )[0]!.id,
        ),
      );
    expect(await learning.result('student', attempt.id)).toMatchObject({
      score: 80,
      questions: resultA.questions,
    });
    expect(await history.list('student', undefined, firstLevel!.id)).toEqual(retryHistory);
    // Advance only the application clock; finalized assessment facts stay immutable.
    const [beforeExpiry] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attempt.id));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(beforeExpiry!.finishedAt!.getTime() + 91 * 24 * 60 * 60 * 1000));
      expect(await learning.result('student', attempt.id)).toMatchObject({
        score: 80,
        explanationState: 'available',
        questions: resultA.questions,
      });
      expect(
        (await history.list('student', undefined, firstLevel!.id)).records.find(
          (record) => record.attemptId === attempt.id,
        ),
      ).toMatchObject({ score: 80, resultState: 'ready' });
      const [afterExpiry] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attempt.id));
      expect(afterExpiry).toEqual(beforeExpiry);
    } finally {
      vi.useRealTimers();
    }
    await expect(learning.start('student', firstLevel!.id)).rejects.toMatchObject({
      status: 503,
      response: { code: 'DRILL_CONTENT_NOT_READY' },
    });
    const [storedAttempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attempt.id));
    expect(storedAttempt).toMatchObject({
      assessmentType: 'DRILL',
      status: 'GRADED',
      levelIdAtStart: firstLevel!.id,
    });
    expect(
      await db
        .select({ id: attemptAnswers.id })
        .from(attemptAnswers)
        .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
        .where(eq(attemptItems.attemptId, attempt.id)),
    ).toHaveLength(10);
    const [completedProgress] = await db
      .select()
      .from(levelProgress)
      .where(
        and(eq(levelProgress.studentId, student!.id), eq(levelProgress.levelId, firstLevel!.id)),
      );
    expect(completedProgress?.completionAttemptId).toBe(attempt.id);
    const [nextProgress] = await db
      .select()
      .from(levelProgress)
      .where(
        and(eq(levelProgress.studentId, student!.id), eq(levelProgress.levelId, nextLevel!.id)),
      );
    expect(nextProgress?.unlockingAttemptId).toBe(attempt.id);
    // A later valid completion must not emit an unlock for a level already open.
    await db.insert(levelProgress).values({
      studentId: stranger!.id,
      levelId: nextLevel!.id,
      unlockedAt: new Date(),
      unlockSource: 'PRETEST',
    });
    for (const item of untracked.questions)
      await learning.saveAnswer('stranger', untracked.id, item.questionInstanceId, 'A');
    await learning.submit('stranger', untracked.id);
    expect(
      await db
        .select()
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.entityId, untracked.id),
            eq(analyticsOutbox.eventName, 'level_unlocked'),
          ),
        ),
    ).toHaveLength(0);
  }, 30_000);
});
