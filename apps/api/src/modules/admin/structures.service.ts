import { Inject, Injectable } from '@nestjs/common';
import { getDatabase, schools } from '@tka/database';
import { ilike, or, sql } from 'drizzle-orm';
import type { AdminAccountQueryDto } from './accounts.dto';
import type { AdminClassQueryDto } from './operations.dto';
import { AdminOperationsService } from './operations.service';
@Injectable()
export class AdminStructuresService {
  constructor(
    @Inject(AdminOperationsService) private readonly operations: AdminOperationsService,
  ) {}
  async schools(query: AdminAccountQueryDto) {
    const term = query.search?.trim().replace(/[\\%_]/g, '\\$&');
    const rows = await getDatabase()
      .db.select({
        id: schools.id,
        code: schools.code,
        name: schools.name,
        status: schools.status,
        classCount: sql<number>`(select count(*)::int from classes c where c.school_id=schools.id and c.archived_at is null)`,
        activeTeacherCount: sql<number>`(select count(distinct m.teacher_user_id)::int from teacher_school_memberships m join users u on u.id=m.teacher_user_id where m.school_id=schools.id and m.ended_at is null and u.status='ACTIVE' and schools.status='ACTIVE')`,
        availableCredentialCount: sql<number>`(select count(*)::int from teacher_verification_tokens t where t.school_id=schools.id and t.used_at is null and t.revoked_at is null and t.expires_at>statement_timestamp())`,
        usedCredentialCount: sql<number>`(select count(*)::int from teacher_verification_tokens t where t.school_id=schools.id and t.used_at is not null)`,
        expiredCredentialCount: sql<number>`(select count(*)::int from teacher_verification_tokens t where t.school_id=schools.id and t.used_at is null and t.revoked_at is null and t.expires_at<=statement_timestamp())`,
        revokedCredentialCount: sql<number>`(select count(*)::int from teacher_verification_tokens t where t.school_id=schools.id and t.used_at is null and t.revoked_at is not null)`,
        studentCount: sql<number>`(select count(distinct m.student_user_id)::int from class_memberships m join classes c on c.id=m.class_id where c.school_id=schools.id and m.left_at is null)`,
      })
      .from(schools)
      .where(
        term ? or(ilike(schools.name, `%${term}%`), ilike(schools.code, `%${term}%`)) : undefined,
      )
      .orderBy(schools.name, schools.id)
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async classes(query: AdminClassQueryDto) {
    const page = await this.operations.classes(query);
    // Explicit output projection: no individual identifiers, credential fields, or student answers.
    return {
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        studentCount: row.studentCount,
        teacherActive: row.teacherActive,
        createdAt: row.createdAt,
        archivedAt: row.archivedAt,
      })),
      nextOffset: page.nextOffset,
    };
  }
}
