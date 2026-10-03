import {
  analyticsOutbox, assessmentAttempts, assessmentPackages, attemptAnswers, attemptItems, getDatabase,
} from '@tka/database';
import { databaseTime } from './database-time.js';
import { AssessmentFinalizationError } from './errors.js';
import { and, eq } from 'drizzle-orm';

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]>[0];
type Event =
  | { eventName: 'drill_started'; questionCount: number }
  | { eventName: 'drill_submitted' | 'tryout_submitted'; submissionType: 'manual' | 'deadline'; questionCount: number; answeredCount: number }
  | { eventName: 'level_unlocked'; unlockedLevelId: string }
  | { eventName: 'question_answered'; questionInstanceId: string; questionVersionId: string; questionFormat: string; answerState: 'selected' | 'cleared' };

// PROPOSED Data mapping (DRL-OPEN-08). Server-only opt-in, off unless exactly true.
// The caller must own/lock the attempt and include this write in its business transaction.
export async function recordDomainEvent(tx: Transaction, attemptId: string, event: Event, now: Date) {
  if (process.env.DOMAIN_ANALYTICS_ENABLED !== 'true') return;
  const [context] = await tx.select({
    actorUserId: assessmentAttempts.studentId,
    assessmentType: assessmentAttempts.assessmentType,
    packageId: assessmentAttempts.packageId, packageVersion: assessmentPackages.packageVersion,
    scoringPolicyVersionId: assessmentAttempts.scoringPolicyVersionId,
    chapterId: assessmentAttempts.chapterIdAtStart, levelId: assessmentAttempts.levelIdAtStart,
    classIdAtStart: assessmentAttempts.classIdAtStart,
    startedAt: assessmentAttempts.startedAt, deadlineAt: assessmentAttempts.deadlineAt,
  }).from(assessmentAttempts)
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
    .where(eq(assessmentAttempts.id, attemptId)).limit(1);
  if (!context) throw new Error('DOMAIN_EVENT_CONTEXT_MISSING');
  const { actorUserId, startedAt, deadlineAt, ...pins } = context;
  const { eventName, ...details } = event;
  await tx.insert(analyticsOutbox).values({
    eventName, eventVersion: '1', actorUserId, entityType: 'assessmentAttempt',
    entityId: attemptId, correlationId: attemptId, occurredAt: now,
    payload: { ...pins, attemptId, startedAt: startedAt.toISOString(),
      deadlineAt: deadlineAt?.toISOString() ?? null, ...details },
  });
}

// Call only after attempt row locking, ownership/active/deadline and option validation.
export async function saveChoiceWithEvent(tx: Transaction, input: {
  attemptId: string; questionInstanceId: string; optionId: string | null; now: Date; deadlineAt?: Date | null;
}) {
  const [previous] = await tx.select().from(attemptAnswers)
    .where(eq(attemptAnswers.attemptItemId, input.questionInstanceId)).limit(1);
  const priorOption = previous?.answer && typeof previous.answer === 'object' &&
    'optionId' in previous.answer && typeof previous.answer.optionId === 'string'
    ? previous.answer.optionId : null;
  const now = input.deadlineAt ? await databaseTime(tx) : input.now;
  if (input.deadlineAt && input.deadlineAt <= now)
    throw new AssessmentFinalizationError('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.');
  if (previous && priorOption === input.optionId) return;
  await tx.insert(attemptAnswers).values({ attemptItemId: input.questionInstanceId,
    answer: { optionId: input.optionId }, savedAt: now })
    .onConflictDoUpdate({ target: attemptAnswers.attemptItemId,
      set: { answer: { optionId: input.optionId }, savedAt: now, awardedPoints: null, gradedAt: null } });
  if (priorOption === input.optionId || process.env.DOMAIN_ANALYTICS_ENABLED !== 'true') return;
  const [pin] = await tx.select({ questionVersionId: attemptItems.questionVersionId })
    .from(attemptItems).where(and(eq(attemptItems.id, input.questionInstanceId),
      eq(attemptItems.attemptId, input.attemptId))).limit(1);
  if (!pin) throw new Error('DOMAIN_EVENT_ITEM_MISSING');
  await recordDomainEvent(tx, input.attemptId, { eventName: 'question_answered',
    questionInstanceId: input.questionInstanceId, questionVersionId: pin.questionVersionId,
    questionFormat: 'SINGLE_CHOICE', answerState: input.optionId === null ? 'cleared' : 'selected',
  }, now);
}
