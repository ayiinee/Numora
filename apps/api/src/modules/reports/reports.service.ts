import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import {
  attemptAnswers,
  attemptItems,
  getDatabase,
  learningVideos,
  questionReports,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { adminMutation } from '../audit/admin-mutation';
import { ContentLifecycleService } from '../content/content-lifecycle.service';
import type {
  AdminReportDetailDto,
  AdminReportQueryDto,
  AdminReportsDto,
  ResolveReportDto,
} from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(@Inject(ContentLifecycleService) private readonly content: ContentLifecycleService) {}
  async list(page: AdminReportQueryDto): Promise<AdminReportsDto> {
    const { db } = getDatabase();
    const query = (
      table: typeof questionReports | typeof videoReports,
      kind: 'QUESTION' | 'VIDEO',
    ) =>
      db
        .select({
          id: table.id,
          kind: sql<'QUESTION' | 'VIDEO'>`${kind}`.as('kind'),
          referenceId: 'attemptAnswerId' in table ? table.attemptAnswerId : table.mappingId,
          category: table.category,
          details: table.details,
          status: table.status,
          followUp: table.followUp,
          reportedAt: table.reportedAt,
        })
        .from(table)
        .where(
          and(
            page.kind && page.kind !== kind ? sql`false` : undefined,
            page.status ? eq(table.status, page.status) : undefined,
            page.category ? eq(table.category, page.category) : undefined,
            page.from ? gte(table.reportedAt, new Date(page.from)) : undefined,
            page.to ? lte(table.reportedAt, new Date(page.to)) : undefined,
          ),
        );
    const rows = await unionAll(query(questionReports, 'QUESTION'), query(videoReports, 'VIDEO'))
      .orderBy(desc(sql`reported_at`), desc(sql`id`))
      .limit(page.limit + 1)
      .offset(page.offset);
    return {
      items: rows
        .slice(0, page.limit)
        .map((r) => ({ ...r, reportedAt: r.reportedAt.toISOString() })),
      nextOffset: rows.length > page.limit ? page.offset + page.limit : null,
    };
  }
  async detail(kind: 'QUESTION' | 'VIDEO', id: string): Promise<AdminReportDetailDto> {
    const { db } = getDatabase();
    if (kind === 'QUESTION') {
      const [r] = await db
        .select({ report: questionReports, versionId: attemptItems.questionVersionId })
        .from(questionReports)
        .innerJoin(attemptAnswers, eq(attemptAnswers.id, questionReports.attemptAnswerId))
        .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
        .where(eq(questionReports.id, id));
      if (!r) throw new NotFoundException('Laporan tidak ditemukan.');
      return {
        id,
        kind,
        referenceId: r.report.attemptAnswerId,
        category: r.report.category,
        details: r.report.details,
        status: r.report.status,
        followUp: r.report.followUp,
        reportedAt: r.report.reportedAt.toISOString(),
        question: await this.content.get(r.versionId),
        video: null,
        revisionQuestionVersionId: r.report.revisionQuestionVersionId,
      };
    }
    const [r] = await db
      .select({ report: videoReports, mapping: videoSubchapterMappings, video: learningVideos })
      .from(videoReports)
      .innerJoin(videoSubchapterMappings, eq(videoSubchapterMappings.id, videoReports.mappingId))
      .innerJoin(learningVideos, eq(learningVideos.id, videoSubchapterMappings.videoId))
      .where(eq(videoReports.id, id));
    if (!r) throw new NotFoundException('Laporan tidak ditemukan.');
    return {
      id,
      kind,
      referenceId: r.report.mappingId,
      category: r.report.category,
      details: r.report.details,
      status: r.report.status,
      followUp: r.report.followUp,
      reportedAt: r.report.reportedAt.toISOString(),
      question: null,
      revisionQuestionVersionId: null,
      video: {
        ...(r.report.targetSnapshot ?? {
          title: r.video.title,
          url: r.video.url,
          source: r.video.source,
          videoId: r.video.id,
          subchapterId: r.mapping.subchapterId,
          recommendationOrder: r.mapping.recommendationOrder,
        }),
        evidence: r.report.targetSnapshot ? 'REPORT_SNAPSHOT' : 'CURRENT_METADATA',
      },
    };
  }
  update(actor: string, kind: 'QUESTION' | 'VIDEO', id: string, body: ResolveReportDto) {
    return adminMutation(
      actor,
      'report_updated',
      kind === 'QUESTION' ? 'question_report' : 'video_report',
      async (tx) => {
        const table = kind === 'QUESTION' ? questionReports : videoReports;
        const [previous] = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.id, id))
          .for('update');
        if (!previous) throw new NotFoundException('Laporan tidak ditemukan.');
        if (body.revisionQuestionVersionId) {
          if (kind !== 'QUESTION')
            throw new BadRequestException('Revisi soal hanya dapat dihubungkan ke laporan soal.');
          const [target] = await tx
            .select({ versionId: attemptItems.questionVersionId })
            .from(questionReports)
            .innerJoin(attemptAnswers, eq(attemptAnswers.id, questionReports.attemptAnswerId))
            .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
            .where(eq(questionReports.id, id));
          const lineage = await tx.execute<{ linked: boolean }>(
            sql`with recursive lineage as (select id,revised_from_question_version_id,ARRAY[id] path from question_versions where id=${body.revisionQuestionVersionId}::uuid union all select q.id,q.revised_from_question_version_id,l.path||q.id from question_versions q join lineage l on q.id=l.revised_from_question_version_id where not q.id=ANY(l.path)) select exists(select 1 from lineage where id=${target?.versionId}::uuid and id<>${body.revisionQuestionVersionId}::uuid) linked`,
          );
          if (!lineage[0]?.linked)
            throw new BadRequestException({ code: 'REPORT_REVISION_LINEAGE_MISMATCH' });
        }
        await tx
          .update(table)
          .set({
            status: body.status,
            followUp: body.followUp.trim(),
            ...(kind === 'QUESTION' && body.revisionQuestionVersionId
              ? { revisionQuestionVersionId: body.revisionQuestionVersionId }
              : {}),
          })
          .where(eq(table.id, id));
        return { id };
      },
      {
        status: body.status,
        reason: body.followUp.trim(),
        ...(body.revisionQuestionVersionId
          ? { revisionQuestionVersionId: body.revisionQuestionVersionId }
          : {}),
      },
    );
  }
}
