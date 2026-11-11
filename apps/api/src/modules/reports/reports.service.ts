import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import {
  attemptAnswers,
  attemptItems,
  auditLogs,
  getDatabase,
  learningVideos,
  questionReportCases,
  questionReports,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { adminMutation, type AdminTransaction } from '../audit/admin-mutation';
import { ContentLifecycleService } from '../content/content-lifecycle.service';
import type {
  AdminReportDetailDto,
  AdminReportQueryDto,
  AdminReportsDto,
  ResolveReportDto,
} from './reports.dto';

function questionSources(tx: Pick<AdminTransaction, 'select'>) {
  return tx
    .select({
      id: questionReports.id,
      category: questionReports.category,
      details: questionReports.details,
      reportedAt: questionReports.reportedAt,
      legacyFollowUp: questionReports.followUp,
    })
    .from(questionReports)
    .innerJoin(attemptAnswers, eq(attemptAnswers.id, questionReports.attemptAnswerId))
    .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId));
}

function caseBySource(tx: Pick<AdminTransaction, 'select'>, id: string) {
  return tx
    .select({ case: questionReportCases })
    .from(questionReports)
    .innerJoin(attemptAnswers, eq(attemptAnswers.id, questionReports.attemptAnswerId))
    .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
    .innerJoin(
      questionReportCases,
      eq(questionReportCases.questionVersionId, attemptItems.questionVersionId),
    )
    .where(eq(questionReports.id, id));
}

@Injectable()
export class ReportsService {
  constructor(@Inject(ContentLifecycleService) private readonly content: ContentLifecycleService) {}
  async list(page: AdminReportQueryDto): Promise<AdminReportsDto> {
    const { db } = getDatabase();
    const sourceFilters = (table: typeof questionReports | typeof videoReports) => [
      page.category ? eq(table.category, page.category) : undefined,
      page.from ? gte(table.reportedAt, new Date(page.from)) : undefined,
      page.to ? lte(table.reportedAt, new Date(page.to)) : undefined,
    ];
    const matchingSource = questionSources(db)
      .where(
        and(
          eq(attemptItems.questionVersionId, questionReportCases.questionVersionId),
          ...sourceFilters(questionReports),
        ),
      )
      .orderBy(desc(questionReports.reportedAt), desc(questionReports.id))
      .limit(1)
      .as('matching_source');
    const cases = () =>
      db
        .select({
          id: questionReportCases.id,
          kind: sql<'QUESTION' | 'VIDEO'>`'QUESTION'::text`.as('kind'),
          referenceId: questionReportCases.questionVersionId,
          category: matchingSource.category,
          details: matchingSource.details,
          status: questionReportCases.status,
          followUp: questionReportCases.followUp,
          reportedAt: matchingSource.reportedAt,
          reportCount: sql<number>`(select count(*) from question_reports r
            join attempt_answers a on a.id = r.attempt_answer_id
            join attempt_items i on i.id = a.attempt_item_id
            where i.question_version_id = ${questionReportCases.questionVersionId})`.mapWith(
            Number,
          ),
        })
        .from(questionReportCases)
        .innerJoinLateral(matchingSource, sql`true`)
        .where(
          and(
            page.kind === 'VIDEO' ? sql`false` : undefined,
            page.status ? eq(questionReportCases.status, page.status) : undefined,
          ),
        );
    const videos = () =>
      db
        .select({
          id: videoReports.id,
          kind: sql<'QUESTION' | 'VIDEO'>`'VIDEO'::text`.as('kind'),
          referenceId: videoReports.mappingId,
          category: videoReports.category,
          details: videoReports.details,
          status: videoReports.status,
          followUp: videoReports.followUp,
          reportedAt: videoReports.reportedAt,
          reportCount: sql<number>`1`,
        })
        .from(videoReports)
        .where(
          and(
            page.kind === 'QUESTION' ? sql`false` : undefined,
            page.status ? eq(videoReports.status, page.status) : undefined,
            ...sourceFilters(videoReports),
          ),
        );
    const combined = () => unionAll(cases(), videos());
    const [rows, [total]] = await Promise.all([
      combined()
        .orderBy(desc(sql`reported_at`), asc(sql`kind`), asc(sql`id`))
        .limit(page.limit + 1)
        .offset(page.offset),
      db.select({ total: count() }).from(combined().as('filtered_reports')),
    ]);
    return {
      total: total!.total,
      items: rows
        .slice(0, page.limit)
        .map((r) => ({ ...r, reportedAt: r.reportedAt.toISOString() })),
      nextOffset: rows.length > page.limit ? page.offset + page.limit : null,
    };
  }
  async detail(kind: 'QUESTION' | 'VIDEO', id: string): Promise<AdminReportDetailDto> {
    const { db } = getDatabase();
    if (kind === 'QUESTION') {
      const { reportCase, sources, history } = await db.transaction(
        async (tx) => {
          const [row] = await caseBySource(tx, id);
          if (!row) throw new NotFoundException('Laporan tidak ditemukan.');
          const reportCase = row.case;
          const versionFilter = eq(attemptItems.questionVersionId, reportCase.questionVersionId);
          const sources = await questionSources(tx)
            .where(versionFilter)
            .orderBy(desc(questionReports.reportedAt), desc(questionReports.id));
          const sourceIds = tx
            .select({ id: questionReports.id })
            .from(questionReports)
            .innerJoin(attemptAnswers, eq(attemptAnswers.id, questionReports.attemptAnswerId))
            .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
            .where(versionFilter);
          const history = await tx
            .select({
              id: auditLogs.id,
              status: sql<string>`${auditLogs.metadata}->>'status'`,
              reason: sql<string | null>`${auditLogs.metadata}->>'reason'`,
              revisionQuestionVersionId: sql<
                string | null
              >`${auditLogs.metadata}->>'revisionQuestionVersionId'`,
              recordedAt: auditLogs.createdAt,
            })
            .from(auditLogs)
            .where(
              or(
                and(
                  eq(auditLogs.entityType, 'question_report_case'),
                  eq(auditLogs.entityId, reportCase.id),
                  inArray(auditLogs.action, ['report_case_updated', 'report_case_reopened']),
                ),
                and(
                  eq(auditLogs.entityType, 'question_report'),
                  eq(auditLogs.action, 'report_updated'),
                  inArray(auditLogs.entityId, sourceIds),
                ),
              ),
            )
            .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
          return { reportCase, sources, history };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
      const latest = sources[0]!;
      return {
        id: reportCase.id,
        kind,
        referenceId: reportCase.questionVersionId,
        category: latest.category,
        details: latest.details,
        status: reportCase.status,
        followUp: reportCase.followUp,
        reportedAt: latest.reportedAt.toISOString(),
        reportCount: sources.length,
        question: await this.content.get(reportCase.questionVersionId),
        video: null,
        revisionQuestionVersionId: reportCase.revisionQuestionVersionId,
        caseRevision: reportCase.revision,
        sourceReports: sources.map((source) => ({
          ...source,
          reportedAt: source.reportedAt.toISOString(),
        })),
        history: history.map((entry) => ({ ...entry, recordedAt: entry.recordedAt.toISOString() })),
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
      reportCount: 1,
      caseRevision: null,
      sourceReports: [],
      history: [],
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
    const followUp = body.followUp?.trim() || null;
    if (kind === 'QUESTION') {
      if (body.status !== 'IN_REVIEW' && !followUp)
        throw new BadRequestException('Isi alasan sebelum menutup kasus.');
      return adminMutation(
        actor,
        'report_case_updated',
        'question_report_case',
        async (tx) => {
          const [row] = await caseBySource(tx, id).for('update', { of: questionReportCases });
          if (!row) throw new NotFoundException('Laporan tidak ditemukan.');
          const reportCase = row.case;
          if (reportCase.revision !== body.expectedRevision)
            throw new ConflictException({
              code: 'REPORT_CASE_CHANGED',
              detail:
                'Kasus telah berubah. Muat ulang dan periksa laporan terbaru sebelum menyimpan.',
            });
          const closing = body.status === 'RESOLVED' || body.status === 'REJECTED';
          if (
            !(reportCase.status === 'OPEN' && body.status === 'IN_REVIEW') &&
            !(reportCase.status === 'IN_REVIEW' && closing)
          )
            throw new ConflictException({
              code: 'REPORT_CASE_TRANSITION_INVALID',
              detail: 'Mulai tinjauan sebelum menutup kasus.',
            });
          const revisionId = body.revisionQuestionVersionId;
          if (revisionId) {
            if (!closing) throw new BadRequestException('Hubungkan revisi saat menutup kasus.');
            const lineage = await tx.execute<{ linked: boolean }>(sql`
            with recursive lineage as (
              select id, revised_from_question_version_id, array[id] path from question_versions where id = ${revisionId}::uuid
              union all
              select q.id, q.revised_from_question_version_id, l.path || q.id
              from question_versions q join lineage l on q.id = l.revised_from_question_version_id
              where not q.id = any(l.path)
            )
            select exists(select 1 from lineage where id = ${reportCase.questionVersionId}::uuid and id <> ${revisionId}::uuid) linked
          `);
            if (!lineage[0]?.linked)
              throw new BadRequestException({
                code: 'REPORT_REVISION_LINEAGE_MISMATCH',
                detail: 'Versi revisi harus berasal dari versi soal yang dilaporkan.',
              });
          }
          await tx
            .update(questionReportCases)
            .set({
              status: body.status,
              followUp,
              revisionQuestionVersionId: revisionId ?? null,
              revision: reportCase.revision + 1,
            })
            .where(eq(questionReportCases.id, reportCase.id));
          return { id: reportCase.id };
        },
        {
          status: body.status,
          reason: followUp,
          ...(body.revisionQuestionVersionId
            ? { revisionQuestionVersionId: body.revisionQuestionVersionId }
            : {}),
        },
      );
    }
    if (body.revisionQuestionVersionId)
      throw new BadRequestException('Revisi soal hanya dapat dihubungkan ke laporan soal.');
    if (!followUp) throw new BadRequestException('Isi catatan tindak lanjut laporan.');
    return adminMutation(
      actor,
      'report_updated',
      'video_report',
      async (tx) => {
        const [updated] = await tx
          .update(videoReports)
          .set({ status: body.status, followUp })
          .where(eq(videoReports.id, id))
          .returning({ id: videoReports.id });
        if (!updated) throw new NotFoundException('Laporan tidak ditemukan.');
        return { id };
      },
      { status: body.status, reason: followUp },
    );
  }
}
