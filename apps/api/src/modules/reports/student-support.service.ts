import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { curatedVideoRecommendations } from '../content/curated-video-recommendations';
import { and, eq, sql } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  drillAttempts,
  getDatabase,
  levels,
  learningVideos,
  questionReports,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { DrillAssessmentService } from '../learning/drill-assessment.service';
import { recordSupportEvent } from './support-events';
import type {
  StudentQuestionReportDto,
  StudentVideoReportDto,
  StudentVideosDto,
  LearningInteractionDto,
} from './student-support.dto';

type SupportReader = Pick<ReturnType<typeof getDatabase>['db'], 'select'>;

@Injectable()
export class StudentSupportService {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(DrillAssessmentService) private readonly drillResults: DrillAssessmentService,
  ) {}
  async interaction(authorization: string | undefined, body: LearningInteractionDto) {
    const studentId = await this.student(authorization);
    if (process.env.SUPPORT_ANALYTICS_ENABLED !== 'true') return { state: 'policyPending' };
    const allowed =
      body.eventName === 'tryout_opened'
        ? []
        : body.eventName === 'tryout_detail_viewed'
          ? ['packageId']
          : body.eventName === 'video_clicked'
            ? ['attemptId', 'mappingId']
            : ['attemptId'];
    if (
      ['attemptId', 'mappingId', 'packageId'].some(
        (key) => !allowed.includes(key) && body[key as keyof LearningInteractionDto] !== undefined,
      )
    )
      throw new BadRequestException('Konteks event tidak sesuai.');
    const { db } = getDatabase();
    let entityType = 'student';
    let entityId = studentId;
    let payload: Record<string, unknown> = {};
    if (body.eventName === 'tryout_detail_viewed') {
      if (!body.packageId) throw new BadRequestException('Paket diperlukan.');
      const [pkg] = await db
        .select()
        .from(assessmentPackages)
        .where(
          and(
            eq(assessmentPackages.id, body.packageId),
            eq(assessmentPackages.assessmentType, 'TRYOUT'),
            eq(assessmentPackages.status, 'PUBLISHED'),
          ),
        );
      if (!pkg || !pkg.releaseAt || pkg.releaseAt > new Date())
        throw new NotFoundException('Paket tidak ditemukan.');
      entityType = 'assessment_package';
      entityId = pkg.id;
      payload = { packageVersion: pkg.packageVersion };
    } else if (body.eventName !== 'tryout_opened') {
      if (!body.attemptId) throw new BadRequestException('Attempt diperlukan.');
      const [attempt] = await db
        .select({
          id: assessmentAttempts.id,
          status: assessmentAttempts.status,
          levelId: assessmentPackages.levelId,
          packageId: assessmentPackages.id,
        })
        .from(assessmentAttempts)
        .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
        .where(
          and(
            eq(assessmentAttempts.id, body.attemptId),
            eq(assessmentAttempts.studentId, studentId),
            eq(assessmentAttempts.assessmentType, 'DRILL'),
          ),
        );
      if (!attempt) throw new NotFoundException('Drill tidak ditemukan.');
      if (body.eventName === 'explanation_viewed') {
        const result = await this.drillResults.result(authorization, attempt.id);
        if (result.explanationState !== 'available')
          throw new ForbiddenException('Pembahasan belum tersedia.');
      } else if (body.eventName === 'video_clicked') {
        if (
          !body.mappingId ||
          !(await this.recommendations(studentId, attempt.id)).items.some(
            (v) => v.mappingId === body.mappingId,
          )
        )
          throw new NotFoundException('Rekomendasi tidak ditemukan.');
      }
      const [level] = attempt.levelId
        ? await db.select().from(levels).where(eq(levels.id, attempt.levelId))
        : [];
      entityType = 'assessment_attempt';
      entityId = attempt.id;
      payload = {
        assessmentType: 'DRILL',
        packageId: attempt.packageId,
        levelId: attempt.levelId,
        subchapterId: level?.subchapterId ?? null,
        ...(body.eventName === 'video_clicked' ? { mappingId: body.mappingId } : {}),
      };
      if (body.eventName === 'video_clicked') {
        const [mapping] = await db
          .select()
          .from(videoSubchapterMappings)
          .where(eq(videoSubchapterMappings.id, body.mappingId!));
        if (!mapping) throw new NotFoundException('Pemetaan tidak ditemukan.');
        payload.videoId = mapping.videoId;
      }
    }
    await db.transaction((tx) =>
      recordSupportEvent(tx, {
        id: body.clientRequestId,
        actorUserId: studentId,
        eventName: body.eventName,
        entityType,
        entityId,
        correlationId: body.attemptId ?? body.packageId,
        payload,
      }),
    );
    return { state: 'recorded' };
  }
  private async student(authorization?: string) {
    const profile = await this.identity.me(authorization);
    if (profile.role !== 'STUDENT' || profile.status !== 'ACTIVE')
      throw new ForbiddenException('Akses Student diperlukan.');
    return profile.id;
  }
  private async drill(studentId: string, attemptId: string, db: SupportReader = getDatabase().db) {
    const [canonical] = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.id, attemptId),
          eq(assessmentAttempts.studentId, studentId),
          eq(assessmentAttempts.assessmentType, 'DRILL'),
        ),
      );
    if (canonical) {
      if (canonical.status !== 'GRADED' || canonical.score0To100 === null)
        throw new ConflictException({
          code: 'RESULT_PENDING',
          detail: 'Hasil Drill belum tersedia.',
        });
      const [pkg] = await db
        .select({ levelId: assessmentPackages.levelId })
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, canonical.packageId));
      return { score: Number(canonical.score0To100), levelId: pkg?.levelId };
    }
    // Read-only compatibility for existing Drill results; no forged canonical answer references.
    const [legacy] = await db
      .select()
      .from(drillAttempts)
      .where(and(eq(drillAttempts.id, attemptId), eq(drillAttempts.studentId, studentId)));
    if (!legacy) throw new NotFoundException('Drill tidak ditemukan.');
    if (legacy.status !== 'COMPLETED' || legacy.score === null)
      throw new ConflictException({
        code: 'RESULT_PENDING',
        detail: 'Hasil Drill belum tersedia.',
      });
    return { score: legacy.score, levelId: legacy.levelId };
  }
  private async recommendations(
    studentId: string,
    attemptId: string,
    db: SupportReader = getDatabase().db,
  ): Promise<StudentVideosDto> {
    const attempt = await this.drill(studentId, attemptId, db);
    if (attempt.score >= 80 || !attempt.levelId) return { items: [] };
    const [level] = await db.select().from(levels).where(eq(levels.id, attempt.levelId));
    if (!level) return { items: [] };
    const items = await curatedVideoRecommendations(db, level.subchapterId);
    return {
      items: items.map(({ mappingId, title, url, source }) => ({ mappingId, title, url, source })),
    };
  }
  async videos(authorization: string | undefined, attemptId: string) {
    return this.recommendations(await this.student(authorization), attemptId);
  }
  async questionReport(authorization: string | undefined, body: StudentQuestionReportDto) {
    const studentId = await this.student(authorization);
    return getDatabase().db.transaction(async (tx) => {
      const id = body.clientRequestId ?? randomUUID();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'question-report:' + id}))`);
      const [existing] = await tx.select().from(questionReports).where(eq(questionReports.id, id));
      if (existing) {
        if (
          existing.reporterStudentId !== studentId ||
          existing.attemptAnswerId === null ||
          existing.category !== body.category.trim() ||
          (existing.details ?? '') !== (body.details?.trim() ?? '')
        )
          throw new ConflictException('ID pengiriman laporan sudah digunakan.');
        const [answer] = await tx
          .select()
          .from(attemptAnswers)
          .where(eq(attemptAnswers.id, existing.attemptAnswerId));
        if (answer?.attemptItemId !== body.attemptItemId)
          throw new ConflictException('ID pengiriman laporan sudah digunakan.');
        return { id };
      }
      const [item] = await tx
        .select({
          id: attemptItems.id,
          attemptId: attemptItems.attemptId,
          questionVersionId: attemptItems.questionVersionId,
          levelId: assessmentAttempts.levelIdAtStart,
          chapterId: assessmentAttempts.chapterIdAtStart,
        })
        .from(attemptItems)
        .innerJoin(assessmentAttempts, eq(assessmentAttempts.id, attemptItems.attemptId))
        .where(
          and(eq(attemptItems.id, body.attemptItemId), eq(assessmentAttempts.studentId, studentId)),
        );
      if (!item)
        throw new NotFoundException({
          code: 'REPORT_ITEM_NOT_FOUND',
          detail: 'Pelaporan soal belum tersedia untuk latihan ini.',
        });
      const [answer] = await tx
        .select({ id: attemptAnswers.id })
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptItemId, item.id));
      if (!answer)
        throw new ConflictException({
          code: 'REPORT_ANSWER_UNAVAILABLE',
          detail: 'Pelaporan soal belum tersedia untuk jawaban ini.',
        });
      const created = (
        await tx
          .insert(questionReports)
          .values({
            id,
            reporterStudentId: studentId,
            attemptAnswerId: answer.id,
            category: body.category.trim(),
            details: body.details?.trim(),
          })
          .returning({ id: questionReports.id })
      )[0]!;
      const [level] = item.levelId
        ? await tx.select().from(levels).where(eq(levels.id, item.levelId))
        : [];
      await recordSupportEvent(tx, {
        id: randomUUID(),
        actorUserId: studentId,
        eventName: 'question_reported',
        entityType: 'question_report',
        entityId: created.id,
        correlationId: id,
        payload: {
          attemptItemId: item.id,
          attemptId: item.attemptId,
          questionVersionId: item.questionVersionId,
          levelId: item.levelId,
          chapterId: item.chapterId,
          subchapterId: level?.subchapterId ?? null,
          category: body.category.trim(),
        },
      });
      return created;
    });
  }
  async videoReport(authorization: string | undefined, body: StudentVideoReportDto) {
    const studentId = await this.student(authorization);
    return getDatabase().db.transaction(async (tx) => {
      const id = body.clientRequestId ?? randomUUID();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'video-report:' + id}))`);
      const [existing] = await tx.select().from(videoReports).where(eq(videoReports.id, id));
      if (existing) {
        if (
          existing.reporterStudentId !== studentId ||
          existing.mappingId !== body.mappingId ||
          (existing.attemptContext !== null &&
            existing.attemptContext.attemptId !== body.attemptId) ||
          existing.category !== body.category.trim() ||
          (existing.details ?? '') !== (body.details?.trim() ?? '')
        )
          throw new ConflictException('ID pengiriman laporan sudah digunakan.');
        // Even an already accepted retry must not bypass ownership of its assessment context.
        await this.drill(studentId, body.attemptId, tx);
        return { id };
      }
      const recommended = await this.recommendations(studentId, body.attemptId, tx);
      if (!recommended.items.some((item) => item.mappingId === body.mappingId))
        throw new NotFoundException('Rekomendasi video tidak ditemukan.');
      const attempt = await this.drill(studentId, body.attemptId, tx);
      const [mapping] = await tx
        .select()
        .from(videoSubchapterMappings)
        .where(eq(videoSubchapterMappings.id, body.mappingId))
        .for('share');
      if (!mapping) throw new NotFoundException('Pemetaan tidak ditemukan.');
      const [target] = await tx
        .select()
        .from(learningVideos)
        .where(eq(learningVideos.id, mapping.videoId))
        .for('share');
      if (!target) throw new NotFoundException('Video tidak ditemukan.');
      const context = {
        attemptId: body.attemptId,
        levelId: attempt.levelId ?? null,
        subchapterId: mapping.subchapterId,
        videoId: mapping.videoId,
      };
      const created = (
        await tx
          .insert(videoReports)
          .values({
            id,
            reporterStudentId: studentId,
            mappingId: body.mappingId,
            attemptContext: context,
            targetSnapshot: {
              title: target.title,
              url: target.url,
              source: target.source,
              videoId: target.id,
              subchapterId: mapping.subchapterId,
              recommendationOrder: mapping.recommendationOrder,
            },
            category: body.category.trim(),
            details: body.details?.trim(),
          })
          .returning({ id: videoReports.id })
      )[0]!;
      await recordSupportEvent(tx, {
        id: randomUUID(),
        actorUserId: studentId,
        eventName: 'video_reported',
        entityType: 'video_report',
        entityId: created.id,
        correlationId: id,
        payload: { ...context, mappingId: body.mappingId, category: body.category.trim() },
      });
      return created;
    });
  }
}
