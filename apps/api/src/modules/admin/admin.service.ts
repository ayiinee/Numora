import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
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
import type { AdminAuditListDto, AdminAuditQueryDto, AdminDashboardDto } from './admin.controller';
import { adminCapabilities, type AdminRole } from '../identity/admin-capabilities';

@Injectable()
export class AdminService {
  async dashboard(role: AdminRole): Promise<AdminDashboardDto> {
    const { db } = getDatabase();
    const content = adminCapabilities(role).includes('ANALYTICS_CONTENT');
    const empty = Promise.resolve([{ count: 0 }]);
    const [s, c, q, v, qr, vr] = await Promise.all([
      db.select({ count: count() }).from(schools),
      content ? db.select({ count: count() }).from(chapters) : empty,
      content ? db.select({ count: count() }).from(questions) : empty,
      content
        ? db
            .select({ count: count() })
            .from(questionVersions)
            .where(eq(questionVersions.contentStatus, 'READY'))
        : empty,
      content
        ? db
            .select({ count: count() })
            .from(questionReports)
            .where(inArray(questionReports.status, ['OPEN', 'IN_REVIEW']))
        : empty,
      content
        ? db
            .select({ count: count() })
            .from(videoReports)
            .where(inArray(videoReports.status, ['OPEN', 'IN_REVIEW']))
        : empty,
    ]);
    return {
      schools: s[0]!.count,
      chapters: content ? c[0]!.count : null,
      questions: content ? q[0]!.count : null,
      readyVersions: content ? v[0]!.count : null,
      openReports: content ? qr[0]!.count + vr[0]!.count : null,
    };
  }
  async audit(page: AdminAuditQueryDto, role: AdminRole): Promise<AdminAuditListDto> {
    const rows = await getDatabase()
      .db.select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          role === 'SUPER_ADMIN'
            ? undefined
            : inArray(
                auditLogs.entityType,
                role === 'OPERATIONS'
                  ? [
                      'school',
                      'teacher_verification_token',
                      'class',
                      'class_membership',
                      'teacher_school_membership',
                    ]
                  : [
                      'chapter',
                      'subchapter',
                      'competency',
                      'level',
                      'question',
                      'question_version',
                      'question_variant',
                      'assessment_package',
                      'drill_package',
                      'tryout_package',
                      'question_report',
                      'video_report',
                      'video',
                      'video_mapping',
                      'content_import',
                      'content_media_upload',
                      'content_preview_session',
                      'irt_request',
                      'irt_batch',
                    ],
              ),
          page.action ? eq(auditLogs.action, page.action) : undefined,
          page.entityType ? eq(auditLogs.entityType, page.entityType) : undefined,
          page.actorId ? eq(auditLogs.actorUserId, page.actorId) : undefined,
          page.from ? gte(auditLogs.createdAt, new Date(page.from)) : undefined,
          page.to ? lte(auditLogs.createdAt, new Date(page.to)) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(page.limit)
      .offset(page.offset);
    // Metadata from legacy token events is deliberately excluded from this general list.
    return { items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  }
}
