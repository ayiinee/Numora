import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  analyticsOutbox,
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  chapters,
  classMemberships,
  getDatabase,
  levelProgress,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
} from '@tka/database';
import { databaseTime, recordDomainEvent, saveChoiceWithEvent } from '@tka/assessment-engine';
import { and, asc, desc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { curatedVideoRecommendations } from '../content/curated-video-recommendations';
import { recordSupportEvent } from '../reports/support-events';
import {
  decodeSingleChoiceVersion,
  DRILL_POLICY_CODE,
  DRILL_POLICY_VERSION,
  DRILL_QUESTION_COUNT,
  explanationAvailable,
  presentActiveQuestion,
  scoreDrill,
  selectedOptionId,
  selectDrillPackage,
} from './drill.policy';

const problem = (code: string, detail: string) => ({ code, detail });

@Injectable()
export class DrillAssessmentService {
  constructor(private readonly identity: IdentityService) {}

  private async student(authorization?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return user.id;
  }

  async start(authorization: string | undefined, levelId: string) {
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    const attemptId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${levelId}))`);
      const [level] = await tx
        .select({
          id: levels.id,
          levelNumber: levels.levelNumber,
          chapterId: subchapters.chapterId,
          subchapterId: subchapters.id,
        })
        .from(levels)
        .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
        .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
        .where(and(
          eq(levels.id, levelId),
          eq(levels.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ))
        .limit(1);
      if (!level) throw new NotFoundException(problem('LEVEL_NOT_FOUND', 'Level tidak ditemukan.'));
      if (level.levelNumber !== 1) {
        const [access] = await tx
          .select({ id: levelProgress.id })
          .from(levelProgress)
          .where(and(
            eq(levelProgress.studentId, studentId),
            eq(levelProgress.levelId, levelId),
            isNotNull(levelProgress.unlockedAt),
          ))
          .limit(1);
        if (!access) throw new ForbiddenException(problem('LEVEL_LOCKED', 'Level masih terkunci.'));
      }
      const [existing] = await tx
        .select({ id: assessmentAttempts.id })
        .from(assessmentAttempts)
        .where(and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.levelIdAtStart, levelId),
          eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.status, 'IN_PROGRESS'),
        ))
        .limit(1);
      if (existing) return existing.id;

      const availablePackages = await tx
        .select({
          id: assessmentPackages.id,
          isDemo: assessmentPackages.isDemo,
          variantIndex: assessmentPackages.variantIndex,
          scoringPolicyVersionId: assessmentPackages.scoringPolicyVersionId,
          policyCode: scoringPolicyVersions.policyCode,
          policyVersion: scoringPolicyVersions.version,
        })
        .from(assessmentPackages)
        .innerJoin(
          scoringPolicyVersions,
          eq(scoringPolicyVersions.id, assessmentPackages.scoringPolicyVersionId),
        )
        .where(and(
          eq(assessmentPackages.assessmentType, 'DRILL'),
          eq(assessmentPackages.levelId, levelId),
          eq(assessmentPackages.status, 'PUBLISHED'),
          or(isNull(assessmentPackages.releaseAt), lte(assessmentPackages.releaseAt, new Date())),
        ))
        .orderBy(asc(assessmentPackages.variantIndex), asc(assessmentPackages.id));
      const packages = availablePackages.filter((item) =>
        item.policyCode === DRILL_POLICY_CODE && item.policyVersion === DRILL_POLICY_VERSION,
      );
      if (!packages.length)
        throw new ServiceUnavailableException(
          problem('DRILL_PACKAGE_UNAVAILABLE', 'Paket Drill belum tersedia.'),
        );
      const [last] = await tx
        .select({ id: assessmentAttempts.id, packageId: assessmentAttempts.packageId })
        .from(assessmentAttempts)
        .where(and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.levelIdAtStart, levelId),
          eq(assessmentAttempts.assessmentType, 'DRILL'),
          eq(assessmentAttempts.status, 'GRADED'),
        ))
        .orderBy(desc(assessmentAttempts.finishedAt), desc(assessmentAttempts.id))
        .limit(1);
      const selected = selectDrillPackage(packages, last?.packageId);
      if (!selected)
        throw new ServiceUnavailableException(
          problem('DRILL_VARIANT_UNAVAILABLE', 'Varian Drill berikutnya belum tersedia.'),
        );

      const items = await tx
        .select({
          packageItemId: packageItems.id,
          displayOrder: packageItems.displayOrder,
          maxPoints: packageItems.maxPoints,
          questionVersionId: questionVersions.id,
          questionType: questionVersions.questionType,
          contentStatus: questionVersions.contentStatus,
          questionStatus: questions.status,
          stem: questionVersions.stem,
          optionsOrStatements: questionVersions.optionsOrStatements,
          answerKey: questionVersions.answerKey,
          explanation: questionVersions.explanation,
        })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .innerJoin(questions, eq(questions.id, questionVariants.questionId))
        .where(eq(packageItems.packageId, selected.id))
        .orderBy(asc(packageItems.displayOrder));
      if (items.length !== DRILL_QUESTION_COUNT ||
          items.some((item) => Number(item.maxPoints) !== 1))
        throw new ServiceUnavailableException(
          problem('DRILL_PACKAGE_INVALID', 'Paket Drill harus berisi 10 soal bernilai satu poin.'),
        );
      items.forEach(decodeSingleChoiceVersion);
      if (items.some((item) =>
        item.contentStatus === 'ARCHIVED' || item.questionStatus === 'ARCHIVED' ||
        (!selected.isDemo && (item.contentStatus !== 'READY' || item.questionStatus !== 'READY')),
      )) {
        throw new ServiceUnavailableException(
          problem('DRILL_CONTENT_NOT_READY', 'Konten Drill belum disetujui atau telah diarsipkan.'),
        );
      }
      const [membership] = await tx
        .select({ classId: classMemberships.classId })
        .from(classMemberships)
        .where(and(
          eq(classMemberships.studentUserId, studentId),
          isNull(classMemberships.leftAt),
        ))
        .limit(1);
      const [attempt] = await tx
        .insert(assessmentAttempts)
        .values({
          studentId,
          packageId: selected.id,
          assessmentType: 'DRILL',
          chapterIdAtStart: level.chapterId,
          levelIdAtStart: levelId,
          classIdAtStart: membership?.classId ?? null,
          scoringPolicyVersionId: selected.scoringPolicyVersionId,
        })
        .returning({ id: assessmentAttempts.id });
      if (!attempt) throw new Error('Attempt creation failed.');
      await tx.insert(attemptItems).values(items.map((item) => ({
        attemptId: attempt.id,
        packageId: selected.id,
        packageItemId: item.packageItemId,
        questionVersionId: item.questionVersionId,
        displayOrder: item.displayOrder,
        maxPoints: item.maxPoints,
      })));
      await recordDomainEvent(tx, attempt.id, { eventName: 'drill_started', questionCount: items.length },
        await databaseTime(tx));
      // PROPOSED Data mapping, gated off by default; retry creation and event are atomic.
      if (last) await recordSupportEvent(tx, {
        id: attempt.id, actorUserId: studentId, eventName: 'level_retry',
        entityType: 'assessment_attempt', entityId: attempt.id, correlationId: attempt.id,
        payload: { assessmentType: 'DRILL', packageId: selected.id, levelId, subchapterId: level.subchapterId, chapterId: level.chapterId, previousAttemptId: last.id },
      });
      return attempt.id;
    });
    return this.attemptForStudent(studentId, attemptId);
  }

  private async questionRows(attemptId: string) {
    const { db } = getDatabase();
    return db
      .select({
        id: attemptItems.id,
        displayOrder: attemptItems.displayOrder,
        maxPoints: attemptItems.maxPoints,
        questionType: questionVersions.questionType,
        stem: questionVersions.stem,
        optionsOrStatements: questionVersions.optionsOrStatements,
        answerKey: questionVersions.answerKey,
        explanation: questionVersions.explanation,
        answer: attemptAnswers.answer,
        awardedPoints: attemptAnswers.awardedPoints,
      })
      .from(attemptItems)
      .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attemptId))
      .orderBy(asc(attemptItems.displayOrder));
  }

  private async attemptForStudent(studentId: string, attemptId: string) {
    const { db } = getDatabase();
    const [attempt] = await db
      .select({
        id: assessmentAttempts.id,
        studentId: assessmentAttempts.studentId,
        levelId: assessmentAttempts.levelIdAtStart,
        levelTitle: sql<string>`coalesce(${levels.description}, 'Level ' || ${levels.levelNumber})`,
        status: assessmentAttempts.status,
        startedAt: assessmentAttempts.startedAt,
        isDemo: assessmentPackages.isDemo,
      })
      .from(assessmentAttempts)
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .innerJoin(levels, eq(levels.id, assessmentAttempts.levelIdAtStart))
      .where(and(
        eq(assessmentAttempts.id, attemptId),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
      ))
      .limit(1);
    if (!attempt || attempt.studentId !== studentId || !attempt.levelId)
      throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Drill tidak ditemukan.'));
    if (attempt.status !== 'IN_PROGRESS' && attempt.status !== 'GRADED')
      throw new ConflictException(problem('ATTEMPT_NOT_ACTIVE', 'Drill tidak aktif.'));
    const rows = attempt.status === 'GRADED' ? [] : await this.questionRows(attemptId);
    return {
      id: attempt.id,
      levelId: attempt.levelId,
      levelTitle: attempt.levelTitle,
      status: attempt.status === 'GRADED' ? ('completed' as const) : ('inProgress' as const),
      startedAt: attempt.startedAt.toISOString(),
      isDemo: attempt.isDemo,
      questions: rows.map((row) => presentActiveQuestion({
        id: row.id,
        ...decodeSingleChoiceVersion(row),
        selectedOptionId: selectedOptionId(row.answer),
      })),
    };
  }

  async attempt(authorization: string | undefined, attemptId: string) {
    return this.attemptForStudent(await this.student(authorization), attemptId);
  }

  async saveAnswer(
    authorization: string | undefined,
    attemptId: string,
    questionInstanceId: string,
    optionId: string | null,
  ) {
    if (optionId !== null &&
        (typeof optionId !== 'string' || !['A', 'B', 'C', 'D'].includes(optionId))) {
      throw new BadRequestException(problem('OPTION_INVALID', 'optionId harus A-D atau null.'));
    }
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [attempt] = await tx
        .select({
          studentId: assessmentAttempts.studentId,
          assessmentType: assessmentAttempts.assessmentType,
          status: assessmentAttempts.status,
        })
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId))
        .for('update')
        .limit(1);
      if (!attempt || attempt.studentId !== studentId || attempt.assessmentType !== 'DRILL')
        throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Drill tidak ditemukan.'));
      if (attempt.status !== 'IN_PROGRESS')
        throw new ConflictException(problem('ATTEMPT_COMPLETED', 'Drill sudah selesai.'));
      const [item] = await tx
        .select({
          id: attemptItems.id,
          questionType: questionVersions.questionType,
          stem: questionVersions.stem,
          optionsOrStatements: questionVersions.optionsOrStatements,
          answerKey: questionVersions.answerKey,
          explanation: questionVersions.explanation,
        })
        .from(attemptItems)
        .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
        .where(and(
          eq(attemptItems.id, questionInstanceId),
          eq(attemptItems.attemptId, attemptId),
        ))
        .limit(1);
      if (!item)
        throw new NotFoundException(problem('QUESTION_NOT_FOUND', 'Soal tidak ditemukan pada Drill ini.'));
      const content = decodeSingleChoiceVersion(item);
      if (optionId !== null && !content.options.some((option) => option.id === optionId))
        throw new ConflictException(problem('OPTION_INVALID', 'Pilihan jawaban tidak tersedia.'));
      await saveChoiceWithEvent(tx, { attemptId, questionInstanceId: item.id, optionId,
        now: await databaseTime(tx) });
      return { questionInstanceId, selectedOptionId: optionId };
    });
  }

  async submit(authorization: string | undefined, attemptId: string) {
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId))
        .for('update')
        .limit(1);
      if (!attempt || attempt.studentId !== studentId || attempt.assessmentType !== 'DRILL')
        throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Drill tidak ditemukan.'));
      if (attempt.status === 'GRADED') return;
      if (attempt.status !== 'IN_PROGRESS')
        throw new ConflictException(problem('ATTEMPT_NOT_ACTIVE', 'Drill tidak aktif.'));
      if (!attempt.levelIdAtStart) throw new Error('Drill attempt level is missing.');

      const rows = await tx
        .select({
          id: attemptItems.id,
          maxPoints: attemptItems.maxPoints,
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
        .where(eq(attemptItems.attemptId, attemptId));
      if (rows.length !== DRILL_QUESTION_COUNT)
        throw new ServiceUnavailableException(problem('DRILL_PACKAGE_INVALID', 'Paket Drill tidak lengkap.'));
      const graded = rows.map((row) => {
        const content = decodeSingleChoiceVersion(row);
        const correct = selectedOptionId(row.answer) === content.correctOptionId;
        return { ...row, correct, awardedPoints: correct ? Number(row.maxPoints) : 0 };
      });
      const correctCount = graded.filter((item) => item.correct).length;
      const scored = scoreDrill(correctCount, graded.length);
      const [level] = await tx
        .select()
        .from(levels)
        .where(eq(levels.id, attempt.levelIdAtStart))
        .limit(1);
      if (!level) throw new Error('Attempt level is missing.');
      const [next] = scored.mastered
        ? await tx
            .select({ id: levels.id })
            .from(levels)
            .where(and(
              eq(levels.subchapterId, level.subchapterId),
              eq(levels.levelNumber, level.levelNumber + 1),
              eq(levels.status, 'READY'),
            ))
            .limit(1)
        : [];
      const now = await databaseTime(tx);
      for (const item of graded) {
        await tx
          .insert(attemptAnswers)
          .values({
            attemptItemId: item.id,
            answer: item.answer ?? { optionId: null },
            savedAt: now,
            awardedPoints: String(item.awardedPoints),
            gradedAt: now,
          })
          .onConflictDoUpdate({
            target: attemptAnswers.attemptItemId,
            set: { awardedPoints: String(item.awardedPoints), gradedAt: now },
          });
      }
      await tx
        .update(assessmentAttempts)
        .set({
          status: 'GRADED',
          finishedAt: now,
          rawPoints: String(correctCount),
          score0To100: String(scored.score),
          stars: scored.stars,
          unlockedLevelId: next?.id ?? null,
        })
        .where(eq(assessmentAttempts.id, attemptId));
      await tx
        .insert(levelProgress)
        .values({
          studentId,
          levelId: attempt.levelIdAtStart,
          unlockedAt: now,
          latestScore: scored.score,
          bestScore: scored.score,
          bestStars: scored.stars,
          completedAt: scored.mastered ? now : null,
          completionAttemptId: scored.mastered ? attemptId : null,
        })
        .onConflictDoUpdate({
          target: [levelProgress.studentId, levelProgress.levelId],
          set: {
            unlockedAt: sql`coalesce(${levelProgress.unlockedAt}, ${now.toISOString()}::timestamptz)`,
            latestScore: scored.score,
            bestScore: sql`greatest(coalesce(${levelProgress.bestScore}, 0), ${scored.score})`,
            bestStars: scored.stars === null
              ? sql`${levelProgress.bestStars}`
              : sql`greatest(coalesce(${levelProgress.bestStars}, 0), ${scored.stars})`,
            completedAt: scored.mastered
              ? sql`coalesce(${levelProgress.completedAt}, ${now.toISOString()}::timestamptz)`
              : sql`${levelProgress.completedAt}`,
            completionAttemptId: scored.mastered
              ? sql`coalesce(${levelProgress.completionAttemptId}, ${attemptId}::uuid)`
              : sql`${levelProgress.completionAttemptId}`,
          },
        });
      if (next) {
        const unlocked = await tx
          .insert(levelProgress)
          .values({
            studentId,
            levelId: next.id,
            unlockedAt: now,
            unlockSource: 'DRILL',
            unlockingAttemptId: attemptId,
          })
          .onConflictDoUpdate({
            target: [levelProgress.studentId, levelProgress.levelId],
            set: {
              unlockedAt: sql`coalesce(${levelProgress.unlockedAt}, ${now.toISOString()}::timestamptz)`,
              unlockSource: sql`case when ${levelProgress.unlockedAt} is null then 'DRILL' else ${levelProgress.unlockSource} end`,
              unlockingAttemptId: sql`coalesce(${levelProgress.unlockingAttemptId}, ${attemptId}::uuid)`,
            },
            setWhere: isNull(levelProgress.unlockedAt),
          }).returning({ id: levelProgress.id });
        if (unlocked.length) await recordDomainEvent(tx, attemptId,
          { eventName: 'level_unlocked', unlockedLevelId: next.id }, now);
      }
      const [packageRow] = await tx
        .select({ isDemo: assessmentPackages.isDemo })
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, attempt.packageId))
        .limit(1);
      await recordDomainEvent(tx, attemptId, { eventName: 'drill_submitted',
        submissionType: 'manual', questionCount: rows.length,
        answeredCount: rows.filter(row => selectedOptionId(row.answer) !== null).length,
      }, now);
      await tx.insert(analyticsOutbox).values({
        eventName: 'drill_completed',
        actorUserId: studentId,
        entityType: 'assessmentAttempt',
        entityId: attemptId, correlationId: attemptId, occurredAt: now,
        payload: { score: scored.score, mastered: scored.mastered, isDemo: packageRow?.isDemo ?? false },
      });
    });
    return this.resultForStudent(studentId, attemptId);
  }

  private async resultForStudent(studentId: string, attemptId: string) {
    const { db } = getDatabase();
    const [attempt] = await db
      .select({
        id: assessmentAttempts.id,
        studentId: assessmentAttempts.studentId,
        levelId: assessmentAttempts.levelIdAtStart,
        levelTitle: sql<string>`coalesce(${levels.description}, 'Level ' || ${levels.levelNumber})`,
        subchapterId: levels.subchapterId,
        status: assessmentAttempts.status,
        completedAt: assessmentAttempts.finishedAt,
        score: assessmentAttempts.score0To100,
        rawPoints: assessmentAttempts.rawPoints,
        stars: assessmentAttempts.stars,
        unlockedLevelId: assessmentAttempts.unlockedLevelId,
        isDemo: assessmentPackages.isDemo,
      })
      .from(assessmentAttempts)
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .innerJoin(levels, eq(levels.id, assessmentAttempts.levelIdAtStart))
      .where(and(
        eq(assessmentAttempts.id, attemptId),
        eq(assessmentAttempts.assessmentType, 'DRILL'),
      ))
      .limit(1);
    if (!attempt || attempt.studentId !== studentId || !attempt.levelId)
      throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Drill tidak ditemukan.'));
    if (attempt.status !== 'GRADED' || !attempt.completedAt || attempt.score === null)
      throw new ConflictException(problem('RESULT_PENDING', 'Hasil Drill belum tersedia.'));
    const [counts] = await db
      .select({
        questionCount: sql<number>`count(*)::integer`,
        correctCount: sql<number>`count(*) filter (where ${attemptAnswers.awardedPoints} > 0)::integer`,
      })
      .from(attemptItems)
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptItemId, attemptItems.id))
      .where(eq(attemptItems.attemptId, attemptId))
      .limit(1);
    const available = explanationAvailable(attempt.completedAt);
    const rows = available ? await this.questionRows(attemptId) : [];
    const score = Number(attempt.score);
    const rawPoints = Number(attempt.rawPoints ?? counts?.correctCount ?? 0);
    const recommendations = score < 80
      ? await curatedVideoRecommendations(db, attempt.subchapterId)
      : [];
    return {
      attemptId: attempt.id,
      levelId: attempt.levelId,
      levelTitle: attempt.levelTitle,
      score,
      rawPoints,
      correctCount: counts?.correctCount ?? 0,
      questionCount: counts?.questionCount ?? 0,
      mastered: score >= 80,
      stars: attempt.stars,
      unlockedLevelId: attempt.unlockedLevelId,
      isDemo: attempt.isDemo,
      explanationState: available ? ('available' as const) : ('expired' as const),
      recommendations,
      questions: rows.map((row) => ({
        questionInstanceId: row.id,
        ...decodeSingleChoiceVersion(row),
        selectedOptionId: selectedOptionId(row.answer),
      })),
    };
  }

  async result(authorization: string | undefined, attemptId: string) {
    return this.resultForStudent(await this.student(authorization), attemptId);
  }
}
