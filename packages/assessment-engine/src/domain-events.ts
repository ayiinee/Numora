import {
  analyticsOutbox,
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  getDatabase,
  type AssessmentReader,
} from '@tka/database';
import { databaseTime } from './database-time.js';
import { AssessmentFinalizationError } from './errors.js';
import { and, eq, sql } from 'drizzle-orm';

/** The caller has decoded the immutable pinned item. Recheck all mutable guards at commit. */
export async function saveAssessmentAnswerAtomically(
  db: AssessmentReader,
  input: Pick<
    Parameters<typeof saveAssessmentAnswerWithEvent>[1],
    'attemptId' | 'questionInstanceId' | 'answer' | 'questionFormat'
  > & {
    studentId: string;
    questionVersionId: string;
    guard:
      | { assessmentType: 'DRILL'; timer: unknown; expiresAt: Date | null }
      | { assessmentType: 'TRYOUT'; deadlineAt: Date | null };
  },
) {
  // The event-enabled path keeps the existing event and answer transaction together.
  if (process.env.DOMAIN_ANALYTICS_ENABLED === 'true') return false;
  const { guard } = input;
  const expiresAt = guard.assessmentType === 'DRILL' ? guard.expiresAt : guard.deadlineAt;
  const unchangedGuard =
    guard.assessmentType === 'DRILL'
      ? guard.timer === null
        ? sql`(a.drill_timer is null or a.drill_timer = 'null'::jsonb)`
        : sql`a.drill_timer = ${JSON.stringify(guard.timer)}::jsonb`
      : sql`date_trunc('milliseconds', a.effective_deadline) is not distinct from ${guard.deadlineAt?.toISOString() ?? null}::timestamptz`;
  const stored = storedAssessmentAnswer(input.answer, input.questionFormat);
  const [result] = await db.execute<{ accepted: boolean }>(sql`
    with locked as materialized (
      select a.id, a.status, a.purpose, a.drill_timer,
        case when a.tryout_batch_id is not null then a.deadline_at
          else least(a.deadline_at, p.close_at) end as effective_deadline
      from public.assessment_attempts a
      join public.assessment_packages p on p.id = a.package_id
      where a.id = ${input.attemptId} and a.student_id = ${input.studentId}
        and a.assessment_type = ${guard.assessmentType}
      for update of a
    ), tick as materialized (
      select locked.*, clock_timestamp() as now from locked
    ), eligible as materialized (
      select i.id, a.now from tick a
      join public.attempt_items i on i.attempt_id = a.id
      where a.status = 'IN_PROGRESS'
        and (${guard.assessmentType} <> 'DRILL' or a.purpose = 'REGULAR')
        and i.id = ${input.questionInstanceId} and i.question_version_id = ${input.questionVersionId}
        and ${unchangedGuard}
        and (${expiresAt?.toISOString() ?? null}::timestamptz is null
          or a.now < ${expiresAt?.toISOString() ?? null}::timestamptz)
    ), saved as (
      insert into public.attempt_answers (attempt_item_id, answer, saved_at)
      select id, ${JSON.stringify(stored)}::jsonb, now from eligible
      on conflict (attempt_item_id) do update set
        answer = excluded.answer, saved_at = excluded.saved_at,
        awarded_points = null, graded_at = null, score_category = null,
        fully_correct = null, response_state = null
      where (case when jsonb_typeof(attempt_answers.answer) = 'string'
        then (attempt_answers.answer #>> '{}')::jsonb else attempt_answers.answer end)
          is distinct from excluded.answer
      returning id
    )
    select exists(select 1 from eligible) as accepted
  `);
  // A changed guard writes nothing. The caller retries through its locked validation path.
  return result?.accepted === true;
}

function storedAssessmentAnswer(
  answer: import('./question-content.js').AssessmentAnswer,
  format: import('./question-content.js').QuestionKind,
) {
  return (
    answer ??
    (format === 'CATEGORY'
      ? { categoryByStatementId: {} }
      : format === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
        ? { optionIds: [] }
        : { optionId: null })
  );
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]
>[0];
type Event =
  | { eventName: 'drill_started'; questionCount: number }
  | {
      eventName: 'drill_submitted' | 'tryout_submitted';
      submissionType: 'manual' | 'deadline';
      questionCount: number;
      answeredCount: number;
    }
  | { eventName: 'level_unlocked'; unlockedLevelId: string }
  | {
      eventName: 'question_answered';
      questionInstanceId: string;
      questionVersionId: string;
      questionFormat: string;
      answerState: 'selected' | 'cleared';
    };

// PROPOSED Data mapping (DRL-OPEN-08). Server-only opt-in, off unless exactly true.
// The caller must own/lock the attempt and include this write in its business transaction.
export async function recordDomainEvent(
  tx: Transaction,
  attemptId: string,
  event: Event,
  now: Date,
) {
  if (process.env.DOMAIN_ANALYTICS_ENABLED !== 'true') return;
  const [context] = await tx
    .select({
      actorUserId: assessmentAttempts.studentId,
      assessmentType: assessmentAttempts.assessmentType,
      packageId: assessmentAttempts.packageId,
      packageVersion: assessmentPackages.packageVersion,
      scoringPolicyVersionId: assessmentAttempts.scoringPolicyVersionId,
      chapterId: assessmentAttempts.chapterIdAtStart,
      levelId: assessmentAttempts.levelIdAtStart,
      classIdAtStart: assessmentAttempts.classIdAtStart,
      startedAt: assessmentAttempts.startedAt,
      deadlineAt: assessmentAttempts.deadlineAt,
    })
    .from(assessmentAttempts)
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
    .where(eq(assessmentAttempts.id, attemptId))
    .limit(1);
  if (!context) throw new Error('DOMAIN_EVENT_CONTEXT_MISSING');
  const { actorUserId, startedAt, deadlineAt, ...pins } = context;
  const { eventName, ...details } = event;
  await tx.insert(analyticsOutbox).values({
    eventName,
    eventVersion: '1',
    actorUserId,
    entityType: 'assessmentAttempt',
    entityId: attemptId,
    correlationId: attemptId,
    occurredAt: now,
    payload: {
      ...pins,
      attemptId,
      startedAt: startedAt.toISOString(),
      deadlineAt: deadlineAt?.toISOString() ?? null,
      ...details,
    },
  });
}

// Call only after attempt row locking, ownership/active/deadline and option validation.
export async function saveChoiceWithEvent(
  tx: Transaction,
  input: {
    attemptId: string;
    questionInstanceId: string;
    optionId: string | null;
    now: Date;
    deadlineAt?: Date | null;
  },
) {
  const [previous] = await tx
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptItemId, input.questionInstanceId))
    .limit(1);
  const priorOption =
    previous?.answer &&
    typeof previous.answer === 'object' &&
    'optionId' in previous.answer &&
    typeof previous.answer.optionId === 'string'
      ? previous.answer.optionId
      : null;
  const now = input.deadlineAt ? await databaseTime(tx) : input.now;
  if (input.deadlineAt && input.deadlineAt <= now)
    throw new AssessmentFinalizationError('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.');
  if (previous && priorOption === input.optionId) return;
  await tx
    .insert(attemptAnswers)
    .values({
      attemptItemId: input.questionInstanceId,
      answer: { optionId: input.optionId },
      savedAt: now,
    })
    .onConflictDoUpdate({
      target: attemptAnswers.attemptItemId,
      set: {
        answer: { optionId: input.optionId },
        savedAt: now,
        awardedPoints: null,
        gradedAt: null,
      },
    });
  if (priorOption === input.optionId || process.env.DOMAIN_ANALYTICS_ENABLED !== 'true') return;
  const [pin] = await tx
    .select({ questionVersionId: attemptItems.questionVersionId })
    .from(attemptItems)
    .where(
      and(
        eq(attemptItems.id, input.questionInstanceId),
        eq(attemptItems.attemptId, input.attemptId),
      ),
    )
    .limit(1);
  if (!pin) throw new Error('DOMAIN_EVENT_ITEM_MISSING');
  await recordDomainEvent(
    tx,
    input.attemptId,
    {
      eventName: 'question_answered',
      questionInstanceId: input.questionInstanceId,
      questionVersionId: pin.questionVersionId,
      questionFormat: 'SINGLE_CHOICE',
      answerState: input.optionId === null ? 'cleared' : 'selected',
    },
    now,
  );
}

// Typed replacement save. The caller owns/locks the attempt and validates pinned content.
export async function saveAssessmentAnswerWithEvent(
  tx: Transaction,
  input: {
    attemptId: string;
    questionInstanceId: string;
    questionVersionId?: string;
    answer: import('./question-content.js').AssessmentAnswer;
    questionFormat: import('./question-content.js').QuestionKind;
    now: Date;
    deadlineAt?: Date | null;
  },
) {
  const now = input.deadlineAt ? await databaseTime(tx) : input.now;
  if (input.deadlineAt && input.deadlineAt <= now)
    throw new AssessmentFinalizationError('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.');
  // Maintain historical PG null encoding in storage; the wire answer is null.
  const stored = storedAssessmentAnswer(input.answer, input.questionFormat);
  const [changed] = await tx.execute<{ existed: boolean }>(sql`
    with previous as materialized (
      select 1 from public.attempt_answers where attempt_item_id = ${input.questionInstanceId}
    )
    insert into public.attempt_answers (attempt_item_id, answer, saved_at)
    values (${input.questionInstanceId}, ${JSON.stringify(stored)}::jsonb, ${now.toISOString()}::timestamptz)
    on conflict (attempt_item_id) do update set
      answer = excluded.answer, saved_at = excluded.saved_at,
      awarded_points = null, graded_at = null, score_category = null,
      fully_correct = null, response_state = null
    where (case when jsonb_typeof(attempt_answers.answer) = 'string'
      then (attempt_answers.answer #>> '{}')::jsonb else attempt_answers.answer end)
      is distinct from excluded.answer
    returning exists(select 1 from previous) as existed
  `);
  if (!changed || (input.answer === null && !changed.existed)) return;
  if (process.env.DOMAIN_ANALYTICS_ENABLED !== 'true') return;
  let questionVersionId = input.questionVersionId;
  if (!questionVersionId) {
    const [pin] = await tx
      .select({ questionVersionId: attemptItems.questionVersionId })
      .from(attemptItems)
      .where(
        and(
          eq(attemptItems.id, input.questionInstanceId),
          eq(attemptItems.attemptId, input.attemptId),
        ),
      )
      .limit(1);
    if (!pin) throw new Error('DOMAIN_EVENT_ITEM_MISSING');
    questionVersionId = pin.questionVersionId;
  }
  await recordDomainEvent(
    tx,
    input.attemptId,
    {
      eventName: 'question_answered',
      questionInstanceId: input.questionInstanceId,
      questionVersionId,
      questionFormat: input.questionFormat,
      answerState: input.answer === null ? 'cleared' : 'selected',
    },
    now,
  );
}
