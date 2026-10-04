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
  classMemberships,
  getDatabase,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
} from '@tka/database';
import { AssessmentFinalizationError, databaseTime, finalizeTryout, saveChoiceWithEvent } from '@tka/assessment-engine';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { selectedOptionId } from './drill.policy';
import { decodeSingleChoice } from './single-choice.policy';
import { isJakartaMondayMidnight } from './tryout.policy';
import { TryoutReleaseService } from './tryout-release.service';

const problem = (code: string, detail: string) => ({ code, detail });

@Injectable()
export class TryoutService {
  constructor(
    private readonly identity: IdentityService,
    private readonly releases: TryoutReleaseService,
  ) {}

  private async student(authorization?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Student diperlukan.'));
    return user.id;
  }

  private async currentPackage() {
    const { db } = getDatabase();
    const now = await databaseTime(db);
    const [row] = await db
      .select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.purpose, 'REGULAR'),
          sql`public.package_can_distribute(${assessmentPackages.id})`,
          eq(assessmentPackages.status, 'PUBLISHED'),
          lte(assessmentPackages.releaseAt, now),
        ),
      )
      .orderBy(desc(assessmentPackages.releaseAt), desc(assessmentPackages.id))
      .limit(1);
    if (
      !row ||
      !row.releaseAt ||
      !isJakartaMondayMidnight(row.releaseAt) ||
      (row.closeAt && row.closeAt <= now)
    )
      return null;
    return row;
  }

  async current(authorization?: string) {
    const studentId = await this.student(authorization);
    const current = await this.currentPackage();
    if (!current) return { state: 'unavailable' as const };
    const { db } = getDatabase();
    let [attempt] = await db
      .select({ id: assessmentAttempts.id, status: assessmentAttempts.status })
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.packageId, current.id),
          eq(assessmentAttempts.assessmentType, 'TRYOUT'),
        ),
      )
      .limit(1);
    if (attempt?.status === 'IN_PROGRESS') {
      await this.finalizeForStudent(studentId, attempt.id, 'automatic');
      attempt = await this.forStudent(studentId, attempt.id);
    }
    const released =
      attempt?.status === 'GRADED'
        ? (await this.releases.releasedPackageIds([current.id])).has(current.id)
        : false;
    const [count] = await db
      .select({ total: sql<number>`count(*)::integer` })
      .from(packageItems)
      .where(eq(packageItems.packageId, current.id));
    return {
      id: current.id,
      title: current.name,
      releaseAt: current.releaseAt!.toISOString(),
      state: !attempt
        ? ('open' as const)
        : attempt.status === 'IN_PROGRESS'
          ? ('inProgress' as const)
          : released
            ? ('resultReady' as const)
            : ('waitingIrt' as const),
      eligible: !attempt,
      attemptId: attempt?.id ?? null,
      questionCount: count?.total ?? 0,
      durationSeconds: current.durationSeconds,
    };
  }

  private async questionRows(attemptId: string) {
    const { db } = getDatabase();
    return db
      .select({
        id: attemptItems.id,
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

  private async forStudent(studentId: string, attemptId: string) {
    const { db } = getDatabase();
    const [attempt] = await db
      .select({
        id: assessmentAttempts.id,
        studentId: assessmentAttempts.studentId,
        assessmentType: assessmentAttempts.assessmentType,
        status: assessmentAttempts.status,
        packageId: assessmentAttempts.packageId,
        title: assessmentPackages.name,
        deadlineAt: assessmentAttempts.deadlineAt,
      })
      .from(assessmentAttempts)
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .where(eq(assessmentAttempts.id, attemptId))
      .limit(1);
    if (!attempt || attempt.studentId !== studentId || attempt.assessmentType !== 'TRYOUT')
      throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Tryout tidak ditemukan.'));
    return attempt;
  }

  private async presentAttempt(studentId: string, attemptId: string) {
    let attempt = await this.forStudent(studentId, attemptId);
    if (attempt.status === 'IN_PROGRESS') {
      await this.finalizeForStudent(studentId, attemptId, 'automatic');
      attempt = await this.forStudent(studentId, attemptId);
    }
    const rows = attempt.status === 'IN_PROGRESS' ? await this.questionRows(attemptId) : [];
    if (rows.length) await getDatabase().db.execute(sql`select public.record_assessment_delivery(${attemptId}::uuid, false)`);
    return {
      id: attempt.id,
      packageId: attempt.packageId,
      packageTitle: attempt.title,
      status: attempt.status === 'IN_PROGRESS' ? ('inProgress' as const) : ('submitted' as const),
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      serverTime: (await databaseTime(getDatabase().db)).toISOString(),
      questions: rows.map((row) => {
        const content = decodeSingleChoice(row);
        return {
          questionInstanceId: row.id,
          stem: content.stem,
          options: content.options,
          selectedOptionId: selectedOptionId(row.answer),
        };
      }),
    };
  }

  async start(authorization: string | undefined, packageId: string) {
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    const attemptId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${packageId}))`,
      );
      const current = await this.currentPackage();
      if (!current || current.id !== packageId)
        throw new ConflictException(
          problem('TRYOUT_PACKAGE_UNAVAILABLE', 'Paket Tryout ini tidak berjalan.'),
        );
      const [membership] = await tx
        .select({ classId: classMemberships.classId })
        .from(classMemberships)
        .where(and(eq(classMemberships.studentUserId, studentId), isNull(classMemberships.leftAt)))
        .limit(1);
      const [existing] = await tx
        .select({ id: assessmentAttempts.id })
        .from(assessmentAttempts)
        .where(
          and(
            eq(assessmentAttempts.studentId, studentId),
            eq(assessmentAttempts.packageId, packageId),
            eq(assessmentAttempts.assessmentType, 'TRYOUT'),
          ),
        )
        .limit(1);
      if (existing) return existing.id;
      if (!current.scoringPolicyVersionId)
        throw new ServiceUnavailableException(
          problem('TRYOUT_POLICY_MISSING', 'Kebijakan Tryout belum tersedia.'),
        );
      const items = await tx
        .select({
          id: packageItems.id,
          displayOrder: packageItems.displayOrder,
          questionVersionId: packageItems.questionVersionId,
          maxPoints: packageItems.maxPoints,
          contentStatus: questionVersions.contentStatus,
          questionStatus: questions.status,
          questionType: questionVersions.questionType,
          stem: questionVersions.stem,
          optionsOrStatements: questionVersions.optionsOrStatements,
          answerKey: questionVersions.answerKey,
          explanation: questionVersions.explanation,
        })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .innerJoin(questions, eq(questions.id, questionVariants.questionId))
        .where(eq(packageItems.packageId, packageId))
        .orderBy(asc(packageItems.displayOrder));
      if (
        !items.length ||
        items.some((item) => item.contentStatus !== 'READY' || item.questionStatus !== 'READY')
      )
        throw new ServiceUnavailableException(
          problem('TRYOUT_CONTENT_NOT_READY', 'Konten Tryout belum siap.'),
        );
      items.forEach(decodeSingleChoice);
      const now = await databaseTime(tx);
      const [attempt] = await tx
        .insert(assessmentAttempts)
        .values({
          studentId,
          packageId,
          assessmentType: 'TRYOUT',
          classIdAtStart: membership?.classId ?? null,
          scoringPolicyVersionId: current.scoringPolicyVersionId,
          startedAt: now,
          deadlineAt: current.durationSeconds
            ? new Date(now.getTime() + current.durationSeconds * 1000)
            : null,
        })
        .returning({ id: assessmentAttempts.id });
      if (!attempt) throw new Error('Tryout attempt creation failed.');
      await tx.insert(attemptItems).values(
        items.map((item) => ({
          attemptId: attempt.id,
          packageId,
          packageItemId: item.id,
          questionVersionId: item.questionVersionId,
          displayOrder: item.displayOrder,
          maxPoints: item.maxPoints,
        })),
      );
      await tx.insert(analyticsOutbox).values({
        eventName: 'tryout_started',
        actorUserId: studentId,
        entityType: 'assessmentAttempt',
        entityId: attempt.id, correlationId: attempt.id, occurredAt: now,
        payload: { packageId },
      });
      return attempt.id;
    });
    return this.presentAttempt(studentId, attemptId);
  }

  async attempt(authorization: string | undefined, attemptId: string) {
    return this.presentAttempt(await this.student(authorization), attemptId);
  }

  async saveAnswer(
    authorization: string | undefined,
    attemptId: string,
    questionInstanceId: string,
    optionId: string | null,
  ) {
    if (optionId !== null && (typeof optionId !== 'string' || !optionId.trim()))
      throw new BadRequestException(problem('OPTION_INVALID', 'optionId tidak valid.'));
    const studentId = await this.student(authorization);
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attemptId))
        .for('update')
        .limit(1);
      if (!attempt || attempt.studentId !== studentId || attempt.assessmentType !== 'TRYOUT')
        throw new NotFoundException(problem('ATTEMPT_NOT_FOUND', 'Tryout tidak ditemukan.'));
      if (attempt.status !== 'IN_PROGRESS')
        throw new ConflictException(problem('ATTEMPT_COMPLETED', 'Tryout sudah selesai.'));
      if (attempt.deadlineAt && attempt.deadlineAt <= await databaseTime(tx))
        throw new ConflictException(problem('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.'));
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
        .where(and(eq(attemptItems.id, questionInstanceId), eq(attemptItems.attemptId, attemptId)))
        .limit(1);
      if (!item)
        throw new NotFoundException(
          problem('QUESTION_NOT_FOUND', 'Soal tidak ditemukan pada Tryout ini.'),
        );
      if (
        optionId !== null &&
        !decodeSingleChoice(item).options.some((option) => option.id === optionId)
      )
        throw new ConflictException(problem('OPTION_INVALID', 'Pilihan jawaban tidak tersedia.'));
      const now = await databaseTime(tx);
      if (attempt.deadlineAt && attempt.deadlineAt <= now)
        throw new ConflictException(problem('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.'));
      try {
        await saveChoiceWithEvent(tx, { attemptId, questionInstanceId: item.id, optionId, now,
          deadlineAt: attempt.deadlineAt });
      } catch (error) {
        if (error instanceof AssessmentFinalizationError && error.code === 'TRYOUT_DEADLINE_PASSED')
          throw new ConflictException(problem(error.code, error.message));
        throw error;
      }
      return { questionInstanceId, selectedOptionId: optionId };
    });
  }

  private async finalizeForStudent(studentId: string, attemptId: string, kind: 'manual' | 'automatic') {
    try { return await finalizeTryout({ kind, studentId, attemptId }); }
    catch (error) {
      if (error instanceof AssessmentFinalizationError) {
        const detail = problem(error.code, error.message);
        if (error.code === 'ATTEMPT_NOT_FOUND') throw new NotFoundException(detail);
        if (error.code === 'ATTEMPT_NOT_ACTIVE') throw new ConflictException(detail);
        throw new ServiceUnavailableException(detail);
      }
      throw error;
    }
  }

  async submit(authorization: string | undefined, attemptId: string) {
    await this.finalizeForStudent(await this.student(authorization), attemptId, 'manual');
    return { state: 'waitingIrt' as const };
  }

  async result(authorization: string | undefined, attemptId: string) {
    const studentId = await this.student(authorization);
    const attempt = await this.forStudent(studentId, attemptId);
    if (
      attempt.status !== 'GRADED' ||
      !(await this.releases.releasedPackageIds([attempt.packageId])).has(attempt.packageId)
    )
      throw new ConflictException(
        problem('TRYOUT_RESULT_PENDING', 'Hasil Tryout menunggu rilis IRT.'),
      );
    const { db } = getDatabase();
    const [score] = await db
      .select({ rawPoints: assessmentAttempts.rawPoints, score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId))
      .limit(1);
    const rows = await this.questionRows(attemptId);
    if (rows.length) await db.execute(sql`select public.record_assessment_delivery(${attemptId}::uuid, true)`);
    return {
      attemptId,
      packageTitle: attempt.title,
      score: Number(score?.score ?? 0),
      correctCount: rows.filter((row) => Number(row.awardedPoints) > 0).length,
      questionCount: rows.length,
      explanation: rows.map((row) => {
        const content = decodeSingleChoice(row);
        return {
          questionInstanceId: row.id,
          stem: content.stem,
          selectedOptionId: selectedOptionId(row.answer),
          correctOptionId: content.correctOptionId,
          explanation: content.explanation,
        };
      }),
    };
  }
}
