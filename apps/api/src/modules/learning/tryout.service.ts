import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  currentTryoutPackage,
  tryoutBatchCloseAt,
  publishedTryoutAttemptResults,
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
  scoringPolicyVersions,
  xpLedger,
} from '@tka/database';
import {
  AssessmentFinalizationError,
  databaseTime,
  finalizeTryout,
  saveAssessmentAnswerWithEvent,
  decodeAssessmentContent,
  normalizeAssessmentAnswer,
  presentAssessmentQuestion,
  presentAssessmentReview,
  TRYOUT_XP_POLICY,
  TRYOUT_REWARD_POLICY,
} from '@tka/assessment-engine';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { TryoutReleaseService } from './tryout-release.service';
import { tryoutAttemptDeadline } from './tryout.policy';

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

  private currentPackage() {
    return currentTryoutPackage();
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
      isDemo: current.isDemo,
      closeAt: current.closeAt?.toISOString() ?? null,
      resultDueAt: current.closeAt
        ? new Date(current.closeAt.getTime() + 72 * 3600 * 1000).toISOString()
        : null,
    };
  }

  private async packageMetadata(studentId: string, pack: typeof assessmentPackages.$inferSelect) {
    const db = getDatabase().db;
    const now = await databaseTime(db);
    const current = await this.currentPackage();
    let [attempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.packageId, pack.id),
          eq(assessmentAttempts.assessmentType, 'TRYOUT'),
        ),
      )
      .limit(1);
    if (attempt?.status === 'IN_PROGRESS') {
      await this.finalizeForStudent(studentId, attempt.id, 'automatic');
      [attempt] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attempt.id));
    }
    const past =
      pack.status === 'CLOSED' ||
      pack.status === 'ARCHIVED' ||
      (pack.closeAt ?? tryoutBatchCloseAt(pack.releaseAt!)) <= now;
    const ongoing = !past && current?.id === pack.id;
    const released =
      attempt?.status === 'GRADED' &&
      (await this.releases.releasedPackageIds([pack.id])).has(pack.id);
    const [count] = await db
      .select({ total: sql<number>`count(*)::integer` })
      .from(packageItems)
      .where(eq(packageItems.packageId, pack.id));
    return {
      id: pack.id,
      title: pack.name,
      releaseAt: pack.releaseAt!.toISOString(),
      closeAt: pack.closeAt?.toISOString() ?? null,
      resultDueAt: pack.closeAt
        ? new Date(pack.closeAt.getTime() + 72 * 3600 * 1000).toISOString()
        : null,
      questionCount: count?.total ?? 0,
      durationSeconds: pack.durationSeconds,
      isDemo: pack.isDemo,
      attemptId: attempt?.id ?? null,
      periodState: past
        ? ('past' as const)
        : ongoing
          ? ('ongoing' as const)
          : ('unavailable' as const),
      state: attempt
        ? attempt.status === 'IN_PROGRESS' && ongoing
          ? ('inProgress' as const)
          : released
            ? ('resultReady' as const)
            : ('waitingIrt' as const)
        : ongoing
          ? ('open' as const)
          : ('unavailable' as const),
      eligible: ongoing && !attempt,
    };
  }
  async packages(authorization?: string, cursor?: string) {
    const studentId = await this.student(authorization);
    const db = getDatabase().db;
    const now = await databaseTime(db);
    let cursorClause;
    if (cursor) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))
        throw new BadRequestException(problem('CURSOR_INVALID', 'Cursor paket tidak valid.'));
      const [anchor] = await db
        .select({ id: assessmentPackages.id, releaseAt: assessmentPackages.releaseAt })
        .from(assessmentPackages)
        .where(
          and(
            eq(assessmentPackages.id, cursor),
            eq(assessmentPackages.assessmentType, 'TRYOUT'),
            eq(assessmentPackages.purpose, 'REGULAR'),
            sql`${assessmentPackages.status} in ('PUBLISHED','CLOSED','ARCHIVED')`,
            sql`${assessmentPackages.releaseAt} <= ${now.toISOString()}::timestamptz`,
          ),
        );
      if (!anchor?.releaseAt)
        throw new BadRequestException(problem('CURSOR_INVALID', 'Cursor paket tidak tersedia.'));
      cursorClause = sql`(${assessmentPackages.releaseAt}, ${assessmentPackages.id}) < (${anchor.releaseAt.toISOString()}::timestamptz, ${anchor.id}::uuid)`;
    }
    const rows = await db
      .select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.purpose, 'REGULAR'),
          sql`${assessmentPackages.status} in ('PUBLISHED','CLOSED','ARCHIVED')`,
          sql`${assessmentPackages.releaseAt} <= ${now.toISOString()}::timestamptz`,
          cursorClause,
        ),
      )
      .orderBy(desc(assessmentPackages.releaseAt), desc(assessmentPackages.id))
      .limit(21);
    const page = rows.slice(0, 20);
    return {
      packages: await Promise.all(page.map((row) => this.packageMetadata(studentId, row))),
      nextCursor: rows.length > 20 ? page.at(-1)!.id : null,
    };
  }
  async packageDetail(authorization: string | undefined, packageId: string) {
    const studentId = await this.student(authorization);
    const db = getDatabase().db;
    const now = await databaseTime(db);
    const [pack] = await db
      .select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.id, packageId),
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.purpose, 'REGULAR'),
          sql`${assessmentPackages.status} in ('PUBLISHED','CLOSED','ARCHIVED')`,
          sql`${assessmentPackages.releaseAt} <= ${now.toISOString()}::timestamptz`,
        ),
      );
    if (!pack)
      throw new NotFoundException(
        problem('TRYOUT_PACKAGE_NOT_FOUND', 'Paket Tryout tidak ditemukan.'),
      );
    return this.packageMetadata(studentId, pack);
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
        closeAt: assessmentPackages.closeAt,
        isDemo: assessmentPackages.isDemo,
        deadlineAt: assessmentAttempts.deadlineAt,
        xpPolicyVersion: assessmentAttempts.tryoutXpPolicyVersion,
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
    if (rows.length)
      await getDatabase().db.execute(
        sql`select public.record_assessment_delivery(${attemptId}::uuid, false)`,
      );
    return {
      id: attempt.id,
      packageId: attempt.packageId,
      packageTitle: attempt.title,
      closeAt: attempt.closeAt?.toISOString() ?? null,
      resultDueAt: attempt.closeAt
        ? new Date(attempt.closeAt.getTime() + 72 * 3600_000).toISOString()
        : null,
      isDemo: attempt.isDemo,
      status: attempt.status === 'IN_PROGRESS' ? ('inProgress' as const) : ('submitted' as const),
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      serverTime: (await databaseTime(getDatabase().db)).toISOString(),
      xp: await this.storedXp(attemptId),
      xpPolicyVersion: attempt.xpPolicyVersion,
      questions: rows.map((row) =>
        presentAssessmentQuestion(decodeAssessmentContent(row), row.id, row.answer),
      ),
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
      const [policy] = await tx
        .select()
        .from(scoringPolicyVersions)
        .where(eq(scoringPolicyVersions.id, current.scoringPolicyVersionId));
      if (
        !current.isDemo &&
        (policy?.policyCode !== TRYOUT_REWARD_POLICY ||
          policy.version !== 1 ||
          policy.status !== 'PUBLISHED')
      )
        throw new ServiceUnavailableException(
          problem('TRYOUT_POLICY_OLD', 'Terbitkan versi paket dengan kebijakan PRD v0.6.'),
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
        (!current.isDemo && items.length !== 30) ||
        items.some((item) => item.contentStatus !== 'READY' || item.questionStatus !== 'READY')
      )
        throw new ServiceUnavailableException(
          problem('TRYOUT_CONTENT_NOT_READY', 'Konten Tryout belum siap.'),
        );
      if (!current.isDemo && items.some((item) => item.questionType !== 'SINGLE_CHOICE'))
        throw new ServiceUnavailableException(
          problem('PGK_SCORING_PENDING', 'Rubrik penilaian PGK belum disahkan.'),
        );
      items.forEach(decodeAssessmentContent);
      const now = await databaseTime(tx);
      if (current.closeAt && current.closeAt <= now)
        throw new ConflictException(
          problem('TRYOUT_PACKAGE_UNAVAILABLE', 'Batch Tryout sudah ditutup.'),
        );
      const deadlineAt = tryoutAttemptDeadline(now, current.durationSeconds, current.closeAt);
      if (!deadlineAt)
        throw new ServiceUnavailableException(
          problem('TRYOUT_DEADLINE_MISSING', 'Durasi atau akhir batch wajib ditentukan.'),
        );
      const [attempt] = await tx
        .insert(assessmentAttempts)
        .values({
          studentId,
          packageId,
          assessmentType: 'TRYOUT',
          tryoutXpPolicyVersion: items.some((item) => item.questionType !== 'SINGLE_CHOICE')
            ? null
            : TRYOUT_XP_POLICY.version,
          classIdAtStart: membership?.classId ?? null,
          scoringPolicyVersionId: current.scoringPolicyVersionId,
          startedAt: now,
          deadlineAt,
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
        entityId: attempt.id,
        correlationId: attempt.id,
        occurredAt: now,
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
    input: unknown,
  ) {
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
      if (attempt.deadlineAt && attempt.deadlineAt <= (await databaseTime(tx)))
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
      const content = decodeAssessmentContent(item);
      let answer;
      try {
        answer = normalizeAssessmentAnswer(
          content,
          typeof input === 'string' ? { optionId: input } : input,
        );
      } catch (error) {
        if (error instanceof AssessmentFinalizationError)
          throw new BadRequestException(problem(error.code, error.message));
        throw error;
      }
      const now = await databaseTime(tx);
      if (attempt.deadlineAt && attempt.deadlineAt <= now)
        throw new ConflictException(problem('TRYOUT_DEADLINE_PASSED', 'Waktu Tryout sudah habis.'));
      try {
        await saveAssessmentAnswerWithEvent(tx, {
          attemptId,
          questionInstanceId: item.id,
          answer,
          questionFormat: content.type,
          now,
          deadlineAt: attempt.deadlineAt,
        });
      } catch (error) {
        if (error instanceof AssessmentFinalizationError && error.code === 'TRYOUT_DEADLINE_PASSED')
          throw new ConflictException(problem(error.code, error.message));
        throw error;
      }
      return {
        questionInstanceId,
        answer,
        selectedOptionId: answer && 'optionId' in answer ? answer.optionId : null,
      };
    });
  }

  private async finalizeForStudent(
    studentId: string,
    attemptId: string,
    kind: 'manual' | 'automatic',
  ) {
    try {
      return await finalizeTryout({ kind, studentId, attemptId });
    } catch (error) {
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
    const studentId = await this.student(authorization);
    await this.finalizeForStudent(studentId, attemptId, 'manual');
    const attempt = await this.forStudent(studentId, attemptId);
    return {
      state: 'waitingIrt' as const,
      xp: await this.storedXp(attemptId),
      xpPolicyVersion: attempt.xpPolicyVersion,
    };
  }

  private async storedXp(attemptId: string) {
    const [reward] = await getDatabase()
      .db.select({ xp: xpLedger.xpAmount })
      .from(xpLedger)
      .where(eq(xpLedger.attemptId, attemptId))
      .limit(1);
    return reward?.xp ?? null;
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
    const canonical = (await publishedTryoutAttemptResults([attemptId])).get(attemptId);
    const rows = await this.questionRows(attemptId);
    if (rows.length)
      await db.execute(sql`select public.record_assessment_delivery(${attemptId}::uuid, true)`);
    const xp = await this.storedXp(attemptId);
    return {
      attemptId,
      packageTitle: attempt.title,
      xp,
      xpPolicyVersion: attempt.xpPolicyVersion,
      score: canonical?.score ?? Number(score?.score ?? 0),
      correctCount: rows.filter(
        (row) => row.awardedPoints !== null && Number(row.awardedPoints) === Number(row.maxPoints),
      ).length,
      questionCount: rows.length,
      resultMethod: canonical?.resultMethod ?? null,
      resultMethodReason: canonical?.reason ?? null,
      xpDetail:
        xp === null ||
        rows.some((row) => row.questionType !== 'SINGLE_CHOICE')
          ? null
          : {
              calculationMode: 'FULL_CORRECT_ONLY' as const,
              fullCorrectCount: rows.filter(
                (row) => Number(row.awardedPoints) === Number(row.maxPoints),
              ).length,
              partialCorrectEquivalent: 0,
              correctEquivalent: rows.filter(
                (row) => Number(row.awardedPoints) === Number(row.maxPoints),
              ).length,
              fallbackReason: null,
            },
      explanation: rows.map((row) =>
        presentAssessmentReview(
          decodeAssessmentContent(row),
          row.id,
          row.answer,
          row.awardedPoints,
          row.maxPoints,
        ),
      ),
    };
  }
}
