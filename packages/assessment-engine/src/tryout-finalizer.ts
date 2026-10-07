import {
  analyticsOutbox,
  assessmentAttempts,
  xpLedger,
  attemptAnswers,
  attemptItems,
  getDatabase,
  questionVersions,
  assessmentPackages,
  scoringPolicyVersions,
  scoringRubricVersions,
} from '@tka/database';
import { eq, inArray, sql } from 'drizzle-orm';
import { databaseTime } from './database-time.js';
import { AssessmentFinalizationError } from './errors.js';
import { recordDomainEvent } from './domain-events.js';
import { decodeAssessmentContent, normalizeAssessmentAnswer } from './question-content.js';
import {
  decodeRuntimeQuestion,
  gradeRuntimeResult,
  validateRuntimeAnswer,
} from './rich-question.js';
import { readApprovedPolicy, roundPolicy } from './approved-policy.js';
import { TRYOUT_XP_POLICY } from './tryout-reward.js';
import {
  TRYOUT_PARTIAL_POLICY,
  tryoutCorrectFraction,
  validateTryoutPartialRubric,
} from './tryout-partial.js';

type Request =
  | { kind: 'manual'; attemptId: string; studentId: string }
  | { kind: 'automatic'; attemptId: string; studentId?: string; skipLocked?: boolean };

export async function finalizeTryout(request: Request) {
  const { db } = getDatabase();
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, request.attemptId))
      .limit(1)
      .for(
        'update',
        request.kind === 'automatic' && request.skipLocked ? { skipLocked: true } : {},
      );
    if (
      !attempt ||
      attempt.assessmentType !== 'TRYOUT' ||
      (request.studentId !== undefined && attempt.studentId !== request.studentId)
    ) {
      if (request.kind === 'automatic' && request.skipLocked)
        return { finalized: false, reason: 'unavailable' as const };
      throw new AssessmentFinalizationError('ATTEMPT_NOT_FOUND', 'Tryout tidak ditemukan.');
    }
    if (attempt.status === 'GRADED' || attempt.status === 'SUBMITTED')
      return { finalized: false, reason: 'alreadyCompleted' as const };
    if (attempt.status !== 'IN_PROGRESS') {
      if (request.kind === 'automatic') return { finalized: false, reason: 'inactive' as const };
      throw new AssessmentFinalizationError('ATTEMPT_NOT_ACTIVE', 'Tryout tidak aktif.');
    }
    const now = await databaseTime(tx);
    const [packageRow] = await tx
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, attempt.packageId));
    const close = packageRow?.closeAt ?? null;
    const deadline =
      attempt.deadlineAt === null
        ? close
        : close && close < attempt.deadlineAt
          ? close
          : attempt.deadlineAt;
    const expired = deadline !== null && deadline <= now;
    if (request.kind === 'automatic' && !expired)
      return { finalized: false, reason: 'notDue' as const };

    const rows = await tx
      .select({
        id: attemptItems.id,
        maxPoints: attemptItems.maxPoints,
        rubricVersionId: attemptItems.rubricVersionId,
        versionRubricVersionId: questionVersions.scoringRubricVersionId,
        questionType: questionVersions.questionType,
        stem: questionVersions.stem,
        optionsOrStatements: questionVersions.optionsOrStatements,
        answerKey: questionVersions.answerKey,
        explanation: questionVersions.explanation,
        answer: attemptAnswers.answer,
      })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attempt.id));
    if (!rows.length)
      throw new AssessmentFinalizationError('TRYOUT_PACKAGE_INVALID', 'Paket Tryout kosong.');
    const [policyRow] = attempt.scoringPolicyVersionId
      ? await tx
          .select()
          .from(scoringPolicyVersions)
          .where(eq(scoringPolicyVersions.id, attempt.scoringPolicyVersionId))
      : [];
    const partialPolicy =
      policyRow?.policyCode === TRYOUT_PARTIAL_POLICY
        ? readApprovedPolicy(policyRow, 'TRYOUT', true).ownerTryoutPartial === true
        : false;
    if (
      !partialPolicy &&
      packageRow?.isDemo &&
      rows.some((row) => row.questionType !== 'SINGLE_CHOICE')
    ) {
      const [pack] = await tx
        .select({ isDemo: assessmentPackages.isDemo })
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, attempt.packageId));
      if (!pack?.isDemo)
        throw new AssessmentFinalizationError(
          'PGK_SCORING_PENDING',
          'Rubrik penilaian PGK belum disahkan.',
        );
      // DEMO transport acceptance only: freeze raw answers without grading or XP.
      let answeredCount = 0;
      for (const row of rows) {
        const content = decodeAssessmentContent(row);
        const answer = normalizeAssessmentAnswer(content, row.answer ?? null);
        if (answer) answeredCount++;
        const empty =
          content.type === 'CATEGORY'
            ? { categoryByStatementId: {} }
            : content.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
              ? { optionIds: [] }
              : { optionId: null };
        await tx
          .insert(attemptAnswers)
          .values({ attemptItemId: row.id, answer: answer ?? empty, savedAt: now })
          .onConflictDoNothing();
      }
      await tx
        .update(assessmentAttempts)
        .set({ status: 'SUBMITTED', finishedAt: now })
        .where(eq(assessmentAttempts.id, attempt.id));
      await recordDomainEvent(
        tx,
        attempt.id,
        {
          eventName: 'tryout_submitted',
          submissionType: expired ? 'deadline' : 'manual',
          questionCount: rows.length,
          answeredCount,
        },
        now,
      );
      await tx.insert(analyticsOutbox).values({
        eventName: 'tryout_completed',
        actorUserId: attempt.studentId,
        entityType: 'assessmentAttempt',
        entityId: attempt.id,
        correlationId: attempt.id,
        occurredAt: now,
        payload: {
          packageId: attempt.packageId,
          gradingState: 'WAITING_RUBRIC',
          isDemo: true,
          xp: null,
        },
      });
      return { finalized: true, reason: expired ? ('deadline' as const) : ('manual' as const) };
    }
    if (!packageRow?.isDemo && !policyRow)
      throw new AssessmentFinalizationError(
        'ASSESSMENT_POLICY_APPROVAL_REQUIRED',
        'Policy attempt tidak tersedia.',
      );
    const policy =
      packageRow?.isDemo || attempt.tryoutXpPolicyVersion === null
        ? null
        : readApprovedPolicy(policyRow!, 'TRYOUT', true);
    const rubricIds = [
      ...new Set(
        rows.flatMap((row) => {
          const id = row.rubricVersionId ?? (partialPolicy ? row.versionRubricVersionId : null);
          return id ? [id] : [];
        }),
      ),
    ];
    const rubrics = rubricIds.length
      ? await tx
          .select()
          .from(scoringRubricVersions)
          .where(inArray(scoringRubricVersions.id, rubricIds))
      : [];
    const grades = rows.map((row) => {
      if (partialPolicy) {
        const content = decodeAssessmentContent(row);
        if (content.type !== 'SINGLE_CHOICE')
          validateTryoutPartialRubric(
            content,
            rubrics.find((r) => r.id === (row.rubricVersionId ?? row.versionRubricVersionId)),
          );
        const answer = normalizeAssessmentAnswer(content, row.answer ?? null);
        const fraction = tryoutCorrectFraction(content, answer);
        return {
          id: row.id,
          answer,
          maximum: Number(row.maxPoints),
          equivalent: fraction,
          correct: fraction === 1,
          scoreCategory: Math.round(
            fraction * (content.type === 'SINGLE_CHOICE' ? 1 : content.options.length),
          ),
          points: Math.round(fraction * Number(row.maxPoints) * 100) / 100,
        };
      }
      const content = decodeRuntimeQuestion(row),
        answer = validateRuntimeAnswer(content, row.answer ?? null);
      const maximum = Number(row.maxPoints);
      const grade = gradeRuntimeResult(
        content,
        answer,
        maximum,
        rubrics.find((r) => r.id === row.rubricVersionId),
      );
      const points = policy
        ? roundPolicy(grade.points * 100, policy.itemPointRounding) / 100
        : grade.points;
      return {
        id: row.id,
        answer,
        maximum,
        equivalent: grade.equivalent,
        correct: grade.fullyCorrect,
        scoreCategory: grade.category,
        points,
      };
    });
    const raw = grades.reduce((sum, grade) => sum + grade.points, 0);
    const maximum = grades.reduce((sum, grade) => sum + grade.maximum, 0);
    if (!Number.isFinite(maximum) || maximum <= 0)
      throw new AssessmentFinalizationError('TRYOUT_PACKAGE_INVALID', 'Poin paket tidak valid.');
    for (const grade of grades)
      await tx
        .insert(attemptAnswers)
        .values({
          attemptItemId: grade.id,
          answer: grade.answer === null ? sql`'null'::jsonb` : grade.answer,
          savedAt: now,
          awardedPoints: String(grade.points),
          gradedAt: now,
          fullyCorrect: grade.correct,
          scoreCategory: grade.scoreCategory,
          responseState: grade.answer === null ? 'OMITTED' : 'RESPONDED',
        })
        .onConflictDoUpdate({
          target: attemptAnswers.attemptItemId,
          // Preserve the raw answer and its original save timestamp.
          set: {
            awardedPoints: String(grade.points),
            gradedAt: now,
            fullyCorrect: grade.correct,
            scoreCategory: grade.scoreCategory,
            responseState: grade.answer === null ? 'OMITTED' : 'RESPONDED',
          },
        });
    await tx
      .update(assessmentAttempts)
      .set({
        status: 'GRADED',
        finishedAt: now,
        rawPoints: String(raw),
        score0To100: String(
          policy
            ? roundPolicy((raw * 100) / maximum, policy.scoreRounding)
            : Math.round((raw * 100) / maximum),
        ),
      })
      .where(eq(assessmentAttempts.id, attempt.id));
    const [reward] =
      attempt.tryoutXpPolicyVersion === TRYOUT_XP_POLICY.version
        ? await tx.execute<{ xp: string }>(sql`
      select ceil(sum(case when aa.score_category is not null then aa.score_category::numeric / ai.maximum_score_category
        else aa.awarded_points / ai.max_points end) * 10)::text as xp
      from public.attempt_items ai join public.attempt_answers aa on aa.attempt_item_id=ai.id where ai.attempt_id=${attempt.id}
    `)
        : [];
    const xp =
      partialPolicy && attempt.tryoutXpPolicyVersion === TRYOUT_XP_POLICY.version
        ? Number(
            (grades.reduce((sum, grade) => sum + grade.points / grade.maximum, 0) * 10).toFixed(6),
          )
        : reward
          ? Number(reward.xp)
          : null;
    if (xp !== null)
      await tx.insert(xpLedger).values({
        studentId: attempt.studentId,
        classIdAtEvent: attempt.classIdAtStart,
        sourceType: 'TRYOUT',
        attemptId: attempt.id,
        xpAmount: xp,
        policyCode: TRYOUT_XP_POLICY.code,
        policyVersion: TRYOUT_XP_POLICY.version,
        baseXp: xp,
        bonusXp: '0',
        occurredAt: now,
      });
    await recordDomainEvent(
      tx,
      attempt.id,
      {
        eventName: 'tryout_submitted',
        submissionType: expired ? 'deadline' : 'manual',
        questionCount: rows.length,
        answeredCount: grades.filter((grade) => grade.answer !== null).length,
      },
      now,
    );
    await tx.insert(analyticsOutbox).values({
      eventName: 'tryout_completed',
      actorUserId: attempt.studentId,
      entityType: 'assessmentAttempt',
      entityId: attempt.id,
      correlationId: attempt.id,
      occurredAt: now,
      payload: { packageId: attempt.packageId, xp, xpPolicyVersion: attempt.tryoutXpPolicyVersion },
    });
    return { finalized: true, reason: expired ? ('deadline' as const) : ('manual' as const) };
  });
}
