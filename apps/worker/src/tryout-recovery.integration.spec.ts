import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  analyticsOutbox, assessmentAttempts, assessmentPackages, attemptAnswers, attemptItems,
  chapters, closeDatabaseConnection, competencies, getDatabase, levels, packageItems,
  questionVariants, questions, questionVersions, scoringPolicyVersions, subchapters, users,
} from '@tka/database';
import { finalizeTryout } from '@tka/assessment-engine';
import { recoverOverdueTryouts } from './tryout-recovery.js';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('TryOut recovery on real PostgreSQL without browser or Redis', () => {
  afterAll(async () => { vi.unstubAllEnvs(); await closeDatabaseConnection(); });

  let chapterOrder = 0;
  async function fixture() {
    const { db } = getDatabase();
    const tag = randomUUID();
    const [reviewer] = await db.insert(users).values({ authUserId: randomUUID(),
      role: 'ADMIN', displayName: 'TEST ONLY reviewer', email: `${tag}@example.test` })
      .returning();
    const [chapter] = await db.insert(chapters).values({ code: tag, slug: tag, name: 'TEST ONLY', displayOrder: ++chapterOrder }).returning();
    const [subchapter] = await db.insert(subchapters).values({ chapterId: chapter!.id,
      code: tag, slug: tag, name: 'TEST ONLY', displayOrder: 1 }).returning();
    const [level] = await db.insert(levels).values({ subchapterId: subchapter!.id, levelNumber: 1 }).returning();
    const [competency] = await db.insert(competencies).values({ subchapterId: subchapter!.id,
      code: tag, description: 'TEST ONLY' }).returning();
    const [policy] = await db.insert(scoringPolicyVersions).values({ policyCode: tag,
      version: 1, configuration: { fixture: true } }).returning();
    const [pkg] = await db.insert(assessmentPackages).values({ familyCode: tag, packageVersion: 1,
      name: 'TEST ONLY TryOut', assessmentType: 'TRYOUT', isDemo: true,
      scoringPolicyVersionId: policy!.id }).returning();
    const itemPins: { packageItemId: string; versionId: string; order: number }[] = [];
    for (const order of [1, 2]) {
      const [question] = await db.insert(questions).values({ primaryCompetencyId: competency!.id }).returning();
      const [variant] = await db.insert(questionVariants).values({ questionId: question!.id,
        variantCode: `${tag}-${order}`, kind: 'ORIGINAL', origin: 'TEST' }).returning();
      const [version] = await db.insert(questionVersions).values({ variantId: variant!.id,
        versionNumber: 1, questionType: 'SINGLE_CHOICE', stem: { text: 'TEST ONLY question' },
        optionsOrStatements: ['A', 'B'].map(id => ({ id, content: { text: id } })),
        answerKey: { optionId: 'A' }, explanation: { text: 'TEST ONLY explanation' },
        difficulty: 'EASY', contentStatus: 'READY', reviewedByUserId: reviewer!.id,
        reviewedAt: new Date() }).returning();
      const [item] = await db.insert(packageItems).values({ packageId: pkg!.id,
        questionVersionId: version!.id, displayOrder: order, maxPoints: '1' }).returning();
      itemPins.push({ packageItemId: item!.id, versionId: version!.id, order });
    }
    async function attempt(deadlineAt: Date | null, empty = false) {
      const [student] = await db.insert(users).values({ authUserId: randomUUID(), role: 'STUDENT',
        displayName: 'TEST ONLY student', email: `${randomUUID()}@example.test` }).returning();
      const [row] = await db.insert(assessmentAttempts).values({ studentId: student!.id,
        packageId: pkg!.id, assessmentType: 'TRYOUT', startedAt: new Date(Date.now() - 60_000),
        deadlineAt, scoringPolicyVersionId: policy!.id, classIdAtStart: null }).returning();
      const pinned = empty ? [] : await db.insert(attemptItems).values(itemPins.map(pin => ({
        attemptId: row!.id, packageId: pkg!.id, packageItemId: pin.packageItemId,
        questionVersionId: pin.versionId, displayOrder: pin.order, maxPoints: '1',
      }))).returning();
      const savedAt = new Date(Date.now() - 30_000);
      if (pinned[0]) await db.insert(attemptAnswers).values({ attemptItemId: pinned[0].id,
        answer: { optionId: 'A' }, savedAt });
      return { row: row!, pinned, savedAt };
    }
    return { db, attempt, level: level!, policy: policy! };
  }

  it('recovers due attempts, races manual/auto safely, keeps raw answers and never expires Drill', async () => {
    const { db, attempt, level, policy } = await fixture();
    vi.stubEnv('DOMAIN_ANALYTICS_ENABLED', 'true');
    const due = await attempt(new Date(Date.now() - 1_000));
    const future = await attempt(new Date(Date.now() + 60_000));
    const noDeadline = await attempt(null);
    const [drillPackage] = await db.insert(assessmentPackages).values({ familyCode: randomUUID(),
      packageVersion: 1, name: 'TEST ONLY Drill', assessmentType: 'DRILL', levelId: level.id,
      isDemo: true, scoringPolicyVersionId: policy.id }).returning();
    const [drill] = await db.insert(assessmentAttempts).values({ studentId: due.row.studentId,
      packageId: drillPackage!.id, assessmentType: 'DRILL', levelIdAtStart: level.id,
      deadlineAt: new Date(Date.now() - 1_000) }).returning();
    await expect(finalizeTryout({ kind: 'manual', attemptId: due.row.id, studentId: future.row.studentId }))
      .rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
    await Promise.all([recoverOverdueTryouts(), recoverOverdueTryouts(),
      finalizeTryout({ kind: 'manual', attemptId: due.row.id, studentId: due.row.studentId })]);
    const [stored] = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, due.row.id));
    expect(stored).toMatchObject({ status: 'GRADED', score0To100: '50.00', classIdAtStart: null,
      deadlineAt: due.row.deadlineAt, scoringPolicyVersionId: due.row.scoringPolicyVersionId });
    const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptItemId, due.pinned[0]!.id));
    expect(answers[0]).toMatchObject({ answer: { optionId: 'A' }, savedAt: due.savedAt, awardedPoints: '1.00' });
    const events = await db.select().from(analyticsOutbox).where(and(eq(analyticsOutbox.entityId, due.row.id),
      eq(analyticsOutbox.eventName, 'tryout_completed')));
    expect(events).toHaveLength(1);
    const submitted = await db.select().from(analyticsOutbox).where(and(eq(analyticsOutbox.entityId, due.row.id),
      eq(analyticsOutbox.eventName, 'tryout_submitted')));
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ actorUserId: due.row.studentId, correlationId: due.row.id });
    expect(submitted[0]!.payload).toMatchObject({ assessmentType: 'TRYOUT', packageId: due.row.packageId,
      scoringPolicyVersionId: due.row.scoringPolicyVersionId, packageVersion: 1,
      submissionType: 'deadline', questionCount: 2, answeredCount: 1 });
    for (const key of ['score', 'answer', 'answerKey', 'email']) expect(submitted[0]!.payload).not.toHaveProperty(key);

    await recoverOverdueTryouts(); // New process/runner state is not needed for replay protection.
    expect((await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, due.row.id)))[0])
      .toEqual(stored);
    for (const id of [future.row.id, noDeadline.row.id, drill!.id])
      expect((await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, id)))[0]?.status)
        .toBe('IN_PROGRESS');
    // A runner started later discovers a previously future deadline from durable PostgreSQL.
    await db.update(assessmentAttempts).set({ deadlineAt: new Date(Date.now() - 1) })
      .where(eq(assessmentAttempts.id, future.row.id));
    expect((await recoverOverdueTryouts()).finalized).toBe(1);
  });

  it('isolates invalid attempts and reports their overdue backlog without partially grading', async () => {
    vi.stubEnv('DOMAIN_ANALYTICS_ENABLED', 'false');
    const { db, attempt } = await fixture();
    const broken = await attempt(new Date(Date.now() - 10_000), true);
    const valid = await attempt(new Date(Date.now() - 1_000));
    const first = await recoverOverdueTryouts(1);
    expect(first).toMatchObject({ finalized: 0, failed: 1, backlog: 2 });
    expect(first.nextCursor).toBeDefined();
    const result = await recoverOverdueTryouts(1, first.nextCursor);
    expect(result).toMatchObject({ finalized: 1, failed: 0, backlog: 1 });
    expect(result.oldestOverdueSeconds).toBeGreaterThanOrEqual(10);
    expect((await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, broken.row.id)))[0])
      .toMatchObject({ status: 'IN_PROGRESS', finishedAt: null, score0To100: null });
    expect((await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, valid.row.id)))[0]?.status)
      .toBe('GRADED');
    // Remove poison from the remaining test scope, preserving its failure record until asserted.
    await db.update(assessmentAttempts).set({ status: 'CANCELLED' }).where(eq(assessmentAttempts.id, broken.row.id));
  });

  it('rolls grading back when transactional outbox insertion fails, then retries once', async () => {
    vi.stubEnv('DOMAIN_ANALYTICS_ENABLED', 'false');
    const { db, attempt } = await fixture();
    const due = await attempt(new Date(Date.now() - 1_000));
    const name = `test_finalizer_${randomUUID().replaceAll('-', '')}`;
    await db.execute(sql.raw(`create function ${name}() returns trigger language plpgsql as $$ begin
      if NEW.entity_id = '${due.row.id}'::uuid then raise exception 'TEST ONLY outbox failure'; end if;
      return NEW; end $$`));
    await db.execute(sql.raw(`create trigger ${name} before insert on analytics_outbox
      for each row execute function ${name}()`));
    try {
      expect((await recoverOverdueTryouts()).failed).toBe(1);
      expect((await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, due.row.id)))[0])
        .toMatchObject({ status: 'IN_PROGRESS', rawPoints: null, score0To100: null, finishedAt: null });
      expect((await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptItemId, due.pinned[0]!.id)))[0])
        .toMatchObject({ answer: { optionId: 'A' }, savedAt: due.savedAt, awardedPoints: null });
    } finally {
      await db.execute(sql.raw(`drop trigger ${name} on analytics_outbox`));
      await db.execute(sql.raw(`drop function ${name}()`));
    }
    expect((await recoverOverdueTryouts()).finalized).toBe(1);
    expect((await db.select().from(analyticsOutbox).where(eq(analyticsOutbox.entityId, due.row.id))))
      .toHaveLength(1);
  });
});
