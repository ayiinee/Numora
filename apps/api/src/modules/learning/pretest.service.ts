import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  analyticsOutbox,
  assessmentAttempts,
  allowSyntheticContent,
  scoringPolicyVersions,
  assessmentPackages,
  packageRuntimeEligibility,
  attemptAnswers,
  attemptItems,
  chapters,
  getDatabase,
  levelProgress,
  levels,
  packageItems,
  pretestChapterStates,
  questionVariants,
  questionVersions,
  questions,
  subchapters,
} from '@tka/database';
import {
  AssessmentFinalizationError,
  databaseTime,
  decodeAssessmentContent,
  normalizeAssessmentAnswer,
  presentAssessmentQuestion,
} from '@tka/assessment-engine';
import { IdentityService } from '../identity/identity.service';

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]
>[0];
const problem = (code: string, detail: string) => ({ code, detail });
export function pretestInitialLevel(correct: number) {
  return correct >= 19 ? 3 : correct >= 8 ? 2 : 1;
}

@Injectable()
export class PretestService {
  constructor(private readonly identity: IdentityService) {}
  private async student(auth?: string) {
    const user = await this.identity.me(auth);
    if (user.role !== 'STUDENT' || (user.status && user.status !== 'ACTIVE'))
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student aktif diperlukan.'));
    return user.id;
  }
  private async readyChapter(chapterId: string) {
    const [chapter] = await getDatabase()
      .db.select()
      .from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.status, 'READY')));
    if (!chapter) throw new NotFoundException(problem('CHAPTER_NOT_FOUND', 'Bab tidak ditemukan.'));
    return chapter;
  }
  private async package(chapterId: string) {
    const [row] = await getDatabase()
      .db.select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.chapterId, chapterId),
          eq(assessmentPackages.assessmentType, 'PRETEST'),
          eq(assessmentPackages.purpose, 'REGULAR'),
          eq(assessmentPackages.status, 'PUBLISHED'),
          sql`public.package_can_distribute(${assessmentPackages.id})`,
          packageRuntimeEligibility(),
        ),
      )
      .orderBy(
        asc(assessmentPackages.isDemo),
        desc(assessmentPackages.packageVersion),
        desc(assessmentPackages.id),
      )
      .limit(1);
    if (!row || !(await this.supportedPolicy(row.scoringPolicyVersionId, row.isDemo)))
      return undefined;
    return row;
  }
  private async supportedPolicy(id: string | null, synthetic: boolean) {
    if (!id) return false;
    const [policy] = await getDatabase()
      .db.select()
      .from(scoringPolicyVersions)
      .where(eq(scoringPolicyVersions.id, id));
    const configuration = policy?.configuration as Record<string, unknown> | null;
    return (
      policy?.status === 'PUBLISHED' &&
      policy.version === 1 &&
      (policy.policyCode === 'PRETEST_PRD_V06' ||
        (synthetic &&
          allowSyntheticContent() &&
          (policy.policyCode === 'NUMORA-ASSESSMENT-MOCK-V1-PRETEST' ||
            (policy.policyCode.startsWith('PRETEST_PG_DEMO_') &&
              configuration?.testOnly === true &&
              configuration?.questionCount === 20))))
    );
  }
  private async state(studentId: string, chapterId: string) {
    const chapter = await this.readyChapter(chapterId);
    const db = getDatabase().db;
    const [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.chapterIdAtStart, chapterId),
          eq(assessmentAttempts.assessmentType, 'PRETEST'),
          sql`${assessmentAttempts.status} in ('IN_PROGRESS','SUBMITTED','GRADED')`,
        ),
      )
      .orderBy(desc(assessmentAttempts.startedAt))
      .limit(1);
    const [skipped] = await db
      .select()
      .from(pretestChapterStates)
      .where(
        and(
          eq(pretestChapterStates.studentId, studentId),
          eq(pretestChapterStates.chapterId, chapterId),
        ),
      );
    const selected = await this.package(chapterId);
    const [pinned] = attempt
      ? await db
          .select({ isDemo: assessmentPackages.isDemo })
          .from(assessmentPackages)
          .where(eq(assessmentPackages.id, attempt.packageId))
      : [];
    const completed = attempt && attempt.status !== 'IN_PROGRESS';
    return {
      chapterId,
      chapterTitle: chapter.name,
      state: completed
        ? 'completed'
        : attempt
          ? 'inProgress'
          : skipped
            ? 'skipped'
            : selected
              ? 'available'
              : 'unavailable',
      attemptId: attempt?.id ?? null,
      canStart: !completed && (!!attempt || !!selected),
      canSkip: !completed,
      skipped: !!skipped,
      isDemo: pinned?.isDemo ?? selected?.isDemo ?? false,
    };
  }
  async chapter(auth: string | undefined, chapterId: string) {
    return this.state(await this.student(auth), chapterId);
  }
  private lock(tx: Transaction, studentId: string, chapterId: string) {
    return tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${chapterId}))`,
    );
  }
  private async unlock(
    tx: Transaction,
    studentId: string,
    chapterId: string,
    initialLevel: number,
    attemptId?: string,
  ) {
    const rows = await tx
      .select({
        id: levels.id,
        title: levels.description,
        number: levels.levelNumber,
        subId: subchapters.id,
        subTitle: subchapters.name,
      })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .where(
        and(
          eq(subchapters.chapterId, chapterId),
          eq(subchapters.status, 'READY'),
          eq(levels.status, 'READY'),
          sql`${levels.levelNumber} <= ${initialLevel}`,
        ),
      )
      .orderBy(asc(subchapters.displayOrder), asc(levels.levelNumber));
    const now = await databaseTime(tx);
    for (const row of rows)
      await tx
        .insert(levelProgress)
        .values({
          studentId,
          levelId: row.id,
          unlockedAt: now,
          unlockSource: attemptId ? 'PRETEST' : 'PRETEST_SKIP',
          unlockingAttemptId: attemptId ?? null,
        })
        .onConflictDoUpdate({
          target: [levelProgress.studentId, levelProgress.levelId],
          set: {
            unlockedAt: sql`coalesce(${levelProgress.unlockedAt}, ${now.toISOString()}::timestamptz)`,
            unlockSource: sql`coalesce(${levelProgress.unlockSource}, ${attemptId ? 'PRETEST' : 'PRETEST_SKIP'})`,
            unlockingAttemptId: sql`coalesce(${levelProgress.unlockingAttemptId}, ${attemptId ?? null}::uuid)`,
          },
        });
    const children = await tx
      .select({ id: subchapters.id })
      .from(subchapters)
      .where(and(eq(subchapters.chapterId, chapterId), eq(subchapters.status, 'READY')));
    return {
      complete:
        children.length > 0 &&
        children.every(
          (child) => rows.filter((row) => row.subId === child.id).length === initialLevel,
        ),
      levels: rows.map((row) => ({
        id: row.id,
        title: `${row.subTitle} · ${row.title ?? `Level ${row.number}`}`,
      })),
    };
  }
  async skip(auth: string | undefined, chapterId: string) {
    const studentId = await this.student(auth);
    await this.readyChapter(chapterId);
    await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx, studentId, chapterId);
      const [completed] = await tx
        .select()
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.studentId, studentId),
            eq(assessmentAttempts.chapterIdAtStart, chapterId),
            eq(assessmentAttempts.assessmentType, 'PRETEST'),
            sql`${assessmentAttempts.status} in ('SUBMITTED','GRADED')`,
          ),
        );
      if (completed)
        throw new ConflictException(problem('PRETEST_COMPLETED', 'Pretest bab ini sudah selesai.'));
      const [inserted] = await tx
        .insert(pretestChapterStates)
        .values({ studentId, chapterId })
        .onConflictDoNothing()
        .returning();
      await this.unlock(tx, studentId, chapterId, 1);
      if (inserted)
        await tx.insert(analyticsOutbox).values({
          eventName: 'pretest_skipped',
          actorUserId: studentId,
          entityType: 'chapter',
          entityId: chapterId,
          correlationId: chapterId,
          payload: { chapterId },
        });
    });
    return this.state(studentId, chapterId);
  }
  async start(auth: string | undefined, chapterId: string) {
    const studentId = await this.student(auth);
    await this.readyChapter(chapterId);
    const attemptId = await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx, studentId, chapterId);
      const [existing] = await tx
        .select()
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.studentId, studentId),
            eq(assessmentAttempts.chapterIdAtStart, chapterId),
            eq(assessmentAttempts.assessmentType, 'PRETEST'),
            sql`${assessmentAttempts.status} in ('IN_PROGRESS','SUBMITTED','GRADED')`,
          ),
        );
      if (existing) {
        const [pinned] = await tx
          .select({ isDemo: assessmentPackages.isDemo })
          .from(assessmentPackages)
          .where(eq(assessmentPackages.id, existing.packageId));
        if (pinned?.isDemo && !allowSyntheticContent())
          throw new ServiceUnavailableException(
            problem(
              'SYNTHETIC_CONTENT_FORBIDDEN',
              'Paket Pretest belum tersedia di lingkungan ini.',
            ),
          );
        if (existing.status !== 'IN_PROGRESS')
          throw new ConflictException(
            problem('PRETEST_COMPLETED', 'Pretest bab ini sudah selesai dan tidak dapat diulang.'),
          );
        return existing.id;
      }
      const selected = await this.package(chapterId);
      if (!selected)
        throw new ServiceUnavailableException(
          problem(
            'PRETEST_CONTENT_PENDING',
            'Paket Pretest belum tersedia. Kamu tetap bisa Skip dan mulai Drill.',
          ),
        );
      const rows = await tx
        .select({ item: packageItems, version: questionVersions, questionStatus: questions.status })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .innerJoin(questions, eq(questions.id, questionVariants.questionId))
        .where(eq(packageItems.packageId, selected.id))
        .orderBy(asc(packageItems.displayOrder));
      if (
        rows.length !== 20 ||
        rows.some(
          (row) =>
            row.version.questionType !== 'SINGLE_CHOICE' ||
            row.version.contentStatus !== 'READY' ||
            row.questionStatus !== 'READY',
        )
      )
        throw new ServiceUnavailableException(
          problem('PRETEST_CONTENT_PENDING', 'Pretest memerlukan tepat 20 soal PG siap.'),
        );
      rows.forEach((row) => decodeAssessmentContent(row.version));
      const [attempt] = await tx
        .insert(assessmentAttempts)
        .values({
          studentId,
          packageId: selected.id,
          assessmentType: 'PRETEST',
          chapterIdAtStart: chapterId,
          scoringPolicyVersionId: selected.scoringPolicyVersionId,
        })
        .returning();
      await tx.insert(attemptItems).values(
        rows.map(({ item }) => ({
          attemptId: attempt!.id,
          packageId: selected.id,
          packageItemId: item.id,
          questionVersionId: item.questionVersionId,
          displayOrder: item.displayOrder,
          maxPoints: item.maxPoints,
        })),
      );
      await tx.insert(analyticsOutbox).values({
        eventName: 'pretest_started',
        actorUserId: studentId,
        entityType: 'assessmentAttempt',
        entityId: attempt!.id,
        correlationId: attempt!.id,
        payload: { chapterId, packageId: selected.id, isDemo: selected.isDemo },
      });
      return attempt!.id;
    });
    return this.present(studentId, attemptId);
  }
  private async owned(studentId: string, attemptId: string) {
    const [row] = await getDatabase()
      .db.select({
        attempt: assessmentAttempts,
        chapterTitle: chapters.name,
        isDemo: assessmentPackages.isDemo,
      })
      .from(assessmentAttempts)
      .innerJoin(chapters, eq(chapters.id, assessmentAttempts.chapterIdAtStart))
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .where(
        and(
          eq(assessmentAttempts.id, attemptId),
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.assessmentType, 'PRETEST'),
        ),
      );
    if (!row) throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Pretest tidak ditemukan.'));
    return row;
  }
  private rows(attemptId: string) {
    return getDatabase()
      .db.select({
        item: attemptItems,
        version: questionVersions,
        answer: attemptAnswers.answer,
        revision: attemptAnswers.revision,
      })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attemptId))
      .orderBy(asc(attemptItems.displayOrder));
  }
  private async present(studentId: string, attemptId: string) {
    const row = await this.owned(studentId, attemptId);
    const active = row.attempt.status === 'IN_PROGRESS';
    return {
      id: attemptId,
      chapterId: row.attempt.chapterIdAtStart!,
      chapterTitle: row.chapterTitle,
      isDemo: row.isDemo,
      status: active ? 'inProgress' : 'completed',
      startedAt: row.attempt.startedAt.toISOString(),
      questions: active
        ? (await this.rows(attemptId)).map(({ item, version, answer, revision }) => ({
            ...presentAssessmentQuestion(
              decodeAssessmentContent(version),
              item.id,
              answer,
              version.id,
            ),
            revision: revision ?? 0,
          }))
        : [],
    };
  }
  async attempt(auth: string | undefined, attemptId: string) {
    return this.present(await this.student(auth), attemptId);
  }
  async saveAnswer(
    auth: string | undefined,
    attemptId: string,
    questionId: string,
    input: unknown,
    expectedRevision: number,
  ) {
    const studentId = await this.student(auth);
    return getDatabase().db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.id, attemptId),
            eq(assessmentAttempts.studentId, studentId),
            eq(assessmentAttempts.assessmentType, 'PRETEST'),
          ),
        )
        .for('update');
      if (!attempt)
        throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Pretest tidak ditemukan.'));
      if (attempt.status !== 'IN_PROGRESS')
        throw new ConflictException(problem('PRETEST_COMPLETED', 'Pretest sudah selesai.'));
      const [row] = await tx
        .select({
          item: attemptItems,
          version: questionVersions,
          answer: attemptAnswers.answer,
          revision: attemptAnswers.revision,
        })
        .from(attemptItems)
        .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
        .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
        .where(and(eq(attemptItems.id, questionId), eq(attemptItems.attemptId, attemptId)));
      if (!row)
        throw new NotFoundException(
          problem('QUESTION_NOT_FOUND', 'Soal tidak ditemukan pada Pretest ini.'),
        );
      const content = decodeAssessmentContent(row.version);
      let answer;
      try {
        answer = normalizeAssessmentAnswer(content, input);
      } catch (error) {
        if (error instanceof AssessmentFinalizationError)
          throw new BadRequestException(problem(error.code, error.message));
        throw error;
      }
      const previous = normalizeAssessmentAnswer(content, row.answer ?? null);
      if (row.revision !== null && JSON.stringify(previous) === JSON.stringify(answer))
        return {
          questionInstanceId: questionId,
          answer,
          revision: row.revision,
          selectedOptionId: answer && 'optionId' in answer ? answer.optionId : null,
        };
      if (!Number.isInteger(expectedRevision) || expectedRevision !== (row.revision ?? 0))
        throw new ConflictException(
          problem(
            'ANSWER_REVISION_CONFLICT',
            'Jawaban diperbarui di tab atau perangkat lain. Muat ulang sesi untuk melanjutkan.',
          ),
        );
      const revision = expectedRevision + 1;
      await tx
        .insert(attemptAnswers)
        .values({ attemptItemId: questionId, answer: answer ?? { optionId: null }, revision })
        .onConflictDoUpdate({
          target: attemptAnswers.attemptItemId,
          set: { answer: answer ?? { optionId: null }, revision, savedAt: await databaseTime(tx) },
        });
      return {
        questionInstanceId: questionId,
        answer,
        revision,
        selectedOptionId: answer && 'optionId' in answer ? answer.optionId : null,
      };
    });
  }
  async submit(auth: string | undefined, attemptId: string) {
    const studentId = await this.student(auth);
    const owned = await this.owned(studentId, attemptId);
    await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx, studentId, owned.attempt.chapterIdAtStart!);
      const [attempt] = await tx
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId))
        .for('update');
      if (attempt!.status === 'GRADED' || attempt!.status === 'SUBMITTED') return;
      if (attempt!.status !== 'IN_PROGRESS')
        throw new ConflictException(problem('ATTEMPT_NOT_ACTIVE', 'Pretest tidak aktif.'));
      const rows = await tx
        .select({ item: attemptItems, version: questionVersions, answer: attemptAnswers.answer })
        .from(attemptItems)
        .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
        .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
        .where(eq(attemptItems.attemptId, attemptId));
      if (
        !(await this.supportedPolicy(attempt!.scoringPolicyVersionId, owned.isDemo)) ||
        rows.length !== 20 ||
        rows.some((row) => row.version.questionType !== 'SINGLE_CHOICE')
      )
        throw new ServiceUnavailableException(
          problem('PRETEST_SCORING_PENDING', 'Konten dan penilaian Pretest resmi belum disahkan.'),
        );
      let correctCount = 0;
      const now = await databaseTime(tx);
      for (const row of rows) {
        const content = decodeAssessmentContent(row.version);
        const answer = normalizeAssessmentAnswer(content, row.answer ?? null);
        const correct =
          answer &&
          'optionId' in answer &&
          'optionId' in content.answerKey &&
          answer.optionId === content.answerKey.optionId;
        if (correct) correctCount++;
        await tx
          .insert(attemptAnswers)
          .values({
            attemptItemId: row.item.id,
            answer: answer ?? { optionId: null },
            awardedPoints: correct ? row.item.maxPoints : '0',
            gradedAt: now,
          })
          .onConflictDoUpdate({
            target: attemptAnswers.attemptItemId,
            set: { awardedPoints: correct ? row.item.maxPoints : '0', gradedAt: now },
          });
      }
      const initialLevel = pretestInitialLevel(correctCount);
      const unlocked = await this.unlock(
        tx,
        studentId,
        attempt!.chapterIdAtStart!,
        initialLevel,
        attemptId,
      );
      const pretestResult = {
        correctCount,
        initialLevel,
        mappingStatus: unlocked.complete ? ('applied' as const) : ('unavailable' as const),
        unlockedLevels: unlocked.levels,
      };
      await tx
        .update(assessmentAttempts)
        .set({
          status: 'GRADED',
          finishedAt: now,
          rawPoints: String(correctCount),
          score0To100: String(correctCount * 5),
          pretestResult,
        })
        .where(eq(assessmentAttempts.id, attemptId));
      await tx.insert(analyticsOutbox).values({
        eventName: 'pretest_completed',
        actorUserId: studentId,
        entityType: 'assessmentAttempt',
        entityId: attemptId,
        correlationId: attemptId,
        occurredAt: now,
        payload: {
          chapterId: attempt!.chapterIdAtStart,
          correctCount,
          initialLevel,
          isDemo: owned.isDemo,
        },
      });
    });
    return this.presentResult(studentId, attemptId);
  }
  private async presentResult(studentId: string, attemptId: string) {
    const row = await this.owned(studentId, attemptId);
    if (!['GRADED', 'SUBMITTED'].includes(row.attempt.status))
      throw new ConflictException(problem('PRETEST_RESULT_PENDING', 'Pretest belum dikumpulkan.'));
    const result = row.attempt.pretestResult;
    return {
      attemptId,
      chapterId: row.attempt.chapterIdAtStart!,
      chapterTitle: row.chapterTitle,
      isDemo: row.isDemo,
      score: row.attempt.score0To100 === null ? null : Number(row.attempt.score0To100),
      correctCount: result?.correctCount ?? null,
      questionCount: (await this.rows(attemptId)).length,
      initialLevel: result?.initialLevel ?? null,
      mappingStatus: result?.mappingStatus ?? 'unavailable',
      unlockedLevels: result?.unlockedLevels ?? [],
      completedAt: row.attempt.finishedAt?.toISOString() ?? null,
    };
  }
  async result(auth: string | undefined, attemptId: string) {
    return this.presentResult(await this.student(auth), attemptId);
  }
}
