import {
  analyticsOutbox, assessmentAttempts, attemptAnswers, attemptItems,
  getDatabase, questionVersions,
} from '@tka/database';
import { eq } from 'drizzle-orm';
import { databaseTime } from './database-time.js';
import { AssessmentFinalizationError } from './errors.js';
import { recordDomainEvent } from './domain-events.js';
import { decodeSingleChoice } from './single-choice.js';


type Request =
  | { kind: 'manual'; attemptId: string; studentId: string }
  | { kind: 'automatic'; attemptId: string; studentId?: string; skipLocked?: boolean };

export async function finalizeTryout(request: Request) {
  const { db } = getDatabase();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, request.attemptId))
      .limit(1).for('update', request.kind === 'automatic' && request.skipLocked ? { skipLocked: true } : {});
    if (!attempt || attempt.assessmentType !== 'TRYOUT' ||
        (request.studentId !== undefined && attempt.studentId !== request.studentId)) {
      if (request.kind === 'automatic' && request.skipLocked)
        return { finalized: false, reason: 'unavailable' as const };
      throw new AssessmentFinalizationError('ATTEMPT_NOT_FOUND', 'Tryout tidak ditemukan.');
    }
    if (attempt.status === 'GRADED')
      return { finalized: false, reason: 'alreadyCompleted' as const };
    if (attempt.status !== 'IN_PROGRESS') {
      if (request.kind === 'automatic') return { finalized: false, reason: 'inactive' as const };
      throw new AssessmentFinalizationError('ATTEMPT_NOT_ACTIVE', 'Tryout tidak aktif.');
    }
    const now = await databaseTime(tx);
    const expired = attempt.deadlineAt !== null && attempt.deadlineAt <= now;
    if (request.kind === 'automatic' && !expired)
      return { finalized: false, reason: 'notDue' as const };

    const rows = await tx.select({
      id: attemptItems.id, maxPoints: attemptItems.maxPoints,
      questionType: questionVersions.questionType, stem: questionVersions.stem,
      optionsOrStatements: questionVersions.optionsOrStatements,
      answerKey: questionVersions.answerKey, explanation: questionVersions.explanation,
      answer: attemptAnswers.answer,
    }).from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attempt.id));
    if (!rows.length)
      throw new AssessmentFinalizationError('TRYOUT_PACKAGE_INVALID', 'Paket Tryout kosong.');
    const grades = rows.map((row) => {
      const content = decodeSingleChoice(row);
      const answer = row.answer ?? { optionId: null };
      const option = answer && typeof answer === 'object' && 'optionId' in answer
        ? answer.optionId : null;
      return { id: row.id, answer, maximum: Number(row.maxPoints),
        points: option === content.correctOptionId ? Number(row.maxPoints) : 0 };
    });
    const raw = grades.reduce((sum, grade) => sum + grade.points, 0);
    const maximum = grades.reduce((sum, grade) => sum + grade.maximum, 0);
    if (!Number.isFinite(maximum) || maximum <= 0)
      throw new AssessmentFinalizationError('TRYOUT_PACKAGE_INVALID', 'Poin paket tidak valid.');
    for (const grade of grades)
      await tx.insert(attemptAnswers).values({
        attemptItemId: grade.id, answer: grade.answer, savedAt: now,
        awardedPoints: String(grade.points), gradedAt: now,
      }).onConflictDoUpdate({ target: attemptAnswers.attemptItemId,
        // Preserve the raw answer and its original save timestamp.
        set: { awardedPoints: String(grade.points), gradedAt: now } });
    await tx.update(assessmentAttempts).set({
      status: 'GRADED', finishedAt: now, rawPoints: String(raw),
      score0To100: String(Math.round(raw * 100 / maximum)),
    }).where(eq(assessmentAttempts.id, attempt.id));
    await recordDomainEvent(tx, attempt.id, { eventName: 'tryout_submitted',
      submissionType: expired ? 'deadline' : 'manual', questionCount: rows.length,
      answeredCount: rows.filter(row => row.answer && typeof row.answer === 'object' &&
        'optionId' in row.answer && typeof row.answer.optionId === 'string').length,
    }, now);
    await tx.insert(analyticsOutbox).values({
      eventName: 'tryout_completed', actorUserId: attempt.studentId,
      entityType: 'assessmentAttempt', entityId: attempt.id,
      correlationId: attempt.id, occurredAt: now, payload: { packageId: attempt.packageId },
    });
    return { finalized: true, reason: expired ? 'deadline' as const : 'manual' as const };
  });
}
