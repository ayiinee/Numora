import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, count, desc, eq } from 'drizzle-orm';
import { getDatabase, questionReports, videoReports } from '@tka/database';
import { adminMutation } from '../audit/admin-mutation';
import type { AdminReportQueryDto, AdminReportsDto, ResolveReportDto } from './reports.dto';

@Injectable()
export class ReportsService {
  async list(page: AdminReportQueryDto): Promise<AdminReportsDto> {
    const { db } = getDatabase();
    const questionWhere = page.status ? eq(questionReports.status, page.status) : undefined;
    const videoWhere = page.status ? eq(videoReports.status, page.status) : undefined;
    const [q, v, questionTotal, videoTotal] = await Promise.all([
      page.kind === 'VIDEO'
        ? Promise.resolve([] as (typeof questionReports.$inferSelect)[])
        : db
            .select()
            .from(questionReports)
            .where(questionWhere)
            .orderBy(desc(questionReports.reportedAt), asc(questionReports.id))
            .limit(page.offset + page.limit + 1),
      page.kind === 'QUESTION'
        ? Promise.resolve([] as (typeof videoReports.$inferSelect)[])
        : db
            .select()
            .from(videoReports)
            .where(videoWhere)
            .orderBy(desc(videoReports.reportedAt), asc(videoReports.id))
            .limit(page.offset + page.limit + 1),
      page.kind === 'VIDEO'
        ? Promise.resolve(0)
        : db
            .select({ total: count() })
            .from(questionReports)
            .where(questionWhere)
            .then((rows) => rows[0]!.total),
      page.kind === 'QUESTION'
        ? Promise.resolve(0)
        : db
            .select({ total: count() })
            .from(videoReports)
            .where(videoWhere)
            .then((rows) => rows[0]!.total),
    ]);
    return {
      total: questionTotal + videoTotal,
      items: [
        ...q.map((r) => ({
          id: r.id,
          kind: 'QUESTION' as const,
          referenceId: r.attemptAnswerId,
          category: r.category,
          details: r.details,
          status: r.status,
          followUp: r.followUp,
          reportedAt: r.reportedAt.toISOString(),
        })),
        ...v.map((r) => ({
          id: r.id,
          kind: 'VIDEO' as const,
          referenceId: r.mappingId,
          category: r.category,
          details: r.details,
          status: r.status,
          followUp: r.followUp,
          reportedAt: r.reportedAt.toISOString(),
        })),
      ]
        .sort(
          (a, b) =>
            b.reportedAt.localeCompare(a.reportedAt) ||
            a.kind.localeCompare(b.kind) ||
            a.id.localeCompare(b.id),
        )
        .slice(page.offset, page.offset + page.limit),
    };
  }
  update(actor: string, kind: 'QUESTION' | 'VIDEO', id: string, body: ResolveReportDto) {
    return adminMutation(
      actor,
      'report_updated',
      kind === 'QUESTION' ? 'question_report' : 'video_report',
      async (tx) => {
        const table = kind === 'QUESTION' ? questionReports : videoReports;
        const [row] = await tx
          .update(table)
          .set({ status: body.status, followUp: body.followUp.trim() })
          .where(eq(table.id, id))
          .returning({ id: table.id });
        if (!row) throw new NotFoundException('Laporan tidak ditemukan.');
        return row;
      },
    );
  }
}
