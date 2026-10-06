import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  analyticsOutbox,
  assessmentAttempts,
  assessmentPackages,
  attemptItems,
  attemptAnswers,
  chapters,
  subchapters,
  levels,
  competencies,
  questions,
  questionVariants,
  questionVersions,
  packageItems,
  scoringPolicyVersions,
  users,
  xpLedger,
  levelProgress,
  getDatabase,
  closeDatabaseConnection,
} from '@tka/database';
import type { IdentityService } from '../identity/identity.service';
import { DrillAssessmentService } from './drill-assessment.service';
import { AssessmentHistoryService } from './assessment-history.service';
import { TryoutReleaseService } from './tryout-release.service';
import { LearningCatalogService } from './learning-catalog.service';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('Drill v0.6 reward and historical pins on PostgreSQL (TEST ONLY)', () => {
  afterAll(async () => {
    vi.useRealTimers();
    await closeDatabaseConnection();
    vi.unstubAllEnvs();
  });
  it('posts once, rolls back all effects on failure, retries a single package and leaves legacy XP untouched', async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    vi.stubEnv('ALLOW_SYNTHETIC_CONTENT', 'true');
    const { db } = getDatabase();
    const suffix = randomUUID();
    const [student, legacyStudent] = await db
      .insert(users)
      .values(
        [1, 2].map((n) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: 'TEST ONLY',
          email: `${suffix}-${n}@example.test`,
        })),
      )
      .returning();
    const identity = {
      me: async (token: string) => ({
        id: token === 'legacy' ? legacyStudent!.id : student!.id,
        role: 'STUDENT',
      }),
    } as unknown as IdentityService;
    const service = new DrillAssessmentService(identity);
    const history = new AssessmentHistoryService(identity, new TryoutReleaseService());
    const catalog = new LearningCatalogService(identity);
    const [chapter] = await db
      .insert(chapters)
      .values({
        code: suffix,
        slug: suffix,
        name: 'TEST ONLY reward',
        displayOrder: parseInt(suffix.slice(0, 7), 16),
        status: 'READY',
      })
      .returning();
    const [subchapter] = await db
      .insert(subchapters)
      .values({
        chapterId: chapter!.id,
        code: suffix,
        slug: suffix,
        name: 'TEST ONLY reward',
        displayOrder: 1,
        status: 'READY',
      })
      .returning();
    const [level, next] = await db
      .insert(levels)
      .values(
        [1, 2].map((levelNumber) => ({
          subchapterId: subchapter!.id,
          levelNumber,
          status: 'READY' as const,
        })),
      )
      .returning();
    const [competency] = await db
      .insert(competencies)
      .values({
        subchapterId: subchapter!.id,
        code: suffix,
        description: 'TEST ONLY',
        status: 'READY',
      })
      .returning();
    const [policy] = await db
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'DRILL_PG_DEMO'),
          eq(scoringPolicyVersions.version, 1),
        ),
      );
    const [pack] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: suffix,
        packageVersion: 1,
        name: 'TEST ONLY single package',
        assessmentType: 'DRILL',
        chapterId: chapter!.id,
        levelId: level!.id,
        variantIndex: 1,
        isDemo: true,
        scoringPolicyVersionId: policy!.id,
        status: 'PUBLISHED',
      })
      .returning();
    for (let i = 1; i <= 10; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          primaryCompetencyId: competency!.id,
          sourceRef: `${suffix}-${i}`,
          status: 'READY',
        })
        .returning();
      const [variant] = await db
        .insert(questionVariants)
        .values({
          questionId: q!.id,
          variantCode: `${suffix}-${i}`,
          kind: 'ORIGINAL',
          origin: 'TEST',
        })
        .returning();
      const [version] = await db
        .insert(questionVersions)
        .values({
          variantId: variant!.id,
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE',
          stem: { text: `TEST ONLY ${i}` },
          optionsOrStatements: ['A', 'B', 'C', 'D'].map((id) => ({ id, content: { text: id } })),
          answerKey: { optionId: 'A' },
          explanation: { text: 'TEST ONLY' },
          difficulty: 'EASY',
          contentStatus: 'READY',
          reviewedAt: new Date(),
          reviewedByUserId: student!.id,
        })
        .returning();
      await db.insert(packageItems).values({
        packageId: pack!.id,
        questionVersionId: version!.id,
        displayOrder: i,
        maxPoints: '1',
      });
    }
    const items = await db.select().from(packageItems).where(eq(packageItems.packageId, pack!.id));
    const [legacy] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: legacyStudent!.id,
        packageId: pack!.id,
        assessmentType: 'DRILL',
        chapterIdAtStart: chapter!.id,
        levelIdAtStart: level!.id,
        scoringPolicyVersionId: policy!.id,
      })
      .returning();
    await db.insert(attemptItems).values(
      items.map((i) => ({
        attemptId: legacy!.id,
        packageId: pack!.id,
        packageItemId: i.id,
        questionVersionId: i.questionVersionId,
        displayOrder: i.displayOrder,
        maxPoints: i.maxPoints,
      })),
    );
    expect((await service.start('legacy', level!.id)).id).toBe(legacy!.id);
    await expect(
      db
        .update(assessmentAttempts)
        .set({ drillPolicyVersion: 2 })
        .where(eq(assessmentAttempts.id, legacy!.id)),
    ).rejects.toThrow();
    const legacyResult = await service.submit('legacy', legacy!.id);
    expect(legacyResult).toMatchObject({ stars: null, reward: null, drillPolicyVersion: null });
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, legacy!.id))).toHaveLength(
      0,
    );

    const [attempt, duplicate] = await Promise.all([
      service.start('student', level!.id),
      service.start('student', level!.id),
    ]);
    expect(duplicate.id).toBe(attempt.id);
    expect(Date.parse(attempt.serverTime)).toBeGreaterThan(0);
    for (const q of attempt.questions.slice(0, 8))
      await service.saveAnswer('student', attempt.id, q.questionInstanceId, 'A');
    // Simulate a later failure in the very same transaction, after XP insertion.
    const trigger = `test_reward_${suffix.replaceAll('-', '')}`;
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${attempt.id}'::uuid AND NEW.event_name='drill_completed' THEN RAISE EXCEPTION 'TEST ONLY outbox unavailable'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON analytics_outbox FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      ),
    );
    try {
      await expect(service.submit('student', attempt.id)).rejects.toThrow();
      expect(
        (
          await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attempt.id))
        )[0]!.status,
      ).toBe('IN_PROGRESS');
      expect(
        await db.select().from(xpLedger).where(eq(xpLedger.attemptId, attempt.id)),
      ).toHaveLength(0);
      expect(
        await db.select().from(levelProgress).where(eq(levelProgress.studentId, student!.id)),
      ).toHaveLength(0);
      expect(
        (
          await db
            .select()
            .from(attemptAnswers)
            .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
            .where(eq(attemptItems.attemptId, attempt.id))
        ).every((r) => r.attempt_answers.gradedAt === null),
      ).toBe(true);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON analytics_outbox`));
      await db.execute(sql.raw(`DROP FUNCTION ${trigger}()`));
    }
    const [result, replay] = await Promise.all([
      service.submit('student', attempt.id),
      service.submit('student', attempt.id),
    ]);
    expect(result.reward).toEqual(replay.reward);
    expect(result).toMatchObject({ score: 80, stars: 2, reward: { baseXp: 80, policyVersion: 2 } });
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, attempt.id))).toHaveLength(
      1,
    );
    expect(
      await db
        .select()
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.entityId, attempt.id),
            eq(analyticsOutbox.eventName, 'drill_completed'),
          ),
        ),
    ).toHaveLength(1);
    await expect(
      db.update(xpLedger).set({ xpAmount: 1 }).where(eq(xpLedger.attemptId, attempt.id)),
    ).rejects.toThrow();
    await expect(db.delete(xpLedger).where(eq(xpLedger.attemptId, attempt.id))).rejects.toThrow();
    const retry = await service.start('student', level!.id);
    expect(retry.id).not.toBe(attempt.id);
    expect(retry.questions.map((q) => q.stem)).toEqual(attempt.questions.map((q) => q.stem));
    const zero = await service.submit('student', retry.id);
    expect(zero).toMatchObject({ score: 0, stars: 0, mastered: false });
    expect(zero.reward?.totalXp).toBeGreaterThanOrEqual(0);
    const path = await catalog.subchapter('student', subchapter!.id);
    expect(path.levels.find((l) => l.id === level!.id)).toMatchObject({
      latestScore: 0,
      latestStars: 0,
      bestScore: 80,
    });
    expect(path.levels.find((l) => l.id === next!.id)?.status).toBe('open');
    expect((await history.list('student', undefined, level!.id)).records).toHaveLength(2);
    expect(
      (await history.list('student')).records.find((r) => r.attemptId === retry.id),
    ).toMatchObject({ xpState: 'ready', starsState: 'ready', xp: zero.reward!.totalXp, stars: 0 });
    await expect(service.result('legacy', attempt.id)).rejects.toMatchObject({ status: 404 });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    expect(await service.result('student', attempt.id)).toEqual(result);
    expect(await service.result('legacy', legacy!.id)).toMatchObject({
      score: 0,
      reward: null,
      explanationState: 'expired',
      questions: [],
    });
    vi.useRealTimers();
    // Production-equivalent RLS/grants with a separate LOGIN, never the migration owner.
    const role = `drill_main_${suffix.replaceAll('-', '')}`;
    const password = randomUUID();
    await db.execute(sql.raw(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`));
    await db.execute(sql.raw(`GRANT numora_main_runtime TO ${role}`));
    const runtimeUrl = new URL(process.env.TEST_DATABASE_URL!);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    await closeDatabaseConnection();
    try {
      process.env.DATABASE_URL = runtimeUrl.toString();
      const runtimeAttempt = await service.start('student', level!.id);
      expect(await service.submit('student', runtimeAttempt.id)).toMatchObject({
        stars: 0,
        reward: { policyVersion: 2, baseXp: 0 },
      });
      expect(
        (await history.list('student')).records.find((r) => r.attemptId === runtimeAttempt.id)
          ?.xpState,
      ).toBe('ready');
    } finally {
      await closeDatabaseConnection();
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      await getDatabase().db.execute(sql.raw(`DROP ROLE ${role}`));
    }
  }, 60_000);
});
