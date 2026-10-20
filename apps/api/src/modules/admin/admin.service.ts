import { Injectable } from '@nestjs/common';
import { count, desc, eq, inArray } from 'drizzle-orm';
import {
  auditLogs,
  chapters,
  getDatabase,
  questions,
  questionVersions,
  questionReports,
  videoReports,
  schools,
} from '@tka/database';
import type { ContentPageDto } from '../content/content.dto';
import type { AdminAuditListDto, AdminDashboardDto } from './admin.controller';

@Injectable()
export class AdminService {
  async dashboard(): Promise<AdminDashboardDto> {
    const { db } = getDatabase();
    const [s, c, q, v, qr, vr] = await Promise.all([
      db.select({ count: count() }).from(schools),
      db.select({ count: count() }).from(chapters),
      db.select({ count: count() }).from(questions),
      db
        .select({ count: count() })
        .from(questionVersions)
        .where(eq(questionVersions.contentStatus, 'READY')),
      db
        .select({ count: count() })
        .from(questionReports)
        .where(inArray(questionReports.status, ['OPEN', 'IN_REVIEW'])),
      db
        .select({ count: count() })
        .from(videoReports)
        .where(inArray(videoReports.status, ['OPEN', 'IN_REVIEW'])),
    ]);
    return {
      schools: s[0]!.count,
      chapters: c[0]!.count,
      questions: q[0]!.count,
      readyVersions: v[0]!.count,
      openReports: qr[0]!.count + vr[0]!.count,
    };
  }
  async audit(page: ContentPageDto): Promise<AdminAuditListDto> {
    const { db } = getDatabase();
    const [rows, [total]] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          actorUserId: auditLogs.actorUserId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(page.limit)
        .offset(page.offset),
      db.select({ total: count() }).from(auditLogs),
    ]);
    // Metadata from legacy token events is deliberately excluded from this general list.
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: total!.total,
    };
  }
}
