import type { AdminRole } from '../identity/admin-capabilities';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  classes,
  classMemberships,
  getDatabase,
  schools,
  teacherSchoolMemberships,
  users,
} from '@tka/database';
import type {
  AdminClassDto,
  AdminClassQueryDto,
  AdminUserDto,
  AdminUserQueryDto,
  AdminRosterQueryDto,
} from './operations.dto';
import type { ContentPageDto } from '../content/content.dto';
// Correlated SELECT expressions retain explicit qualifiers even in Drizzle's single-table mode.
const schoolAffiliation = sql<boolean>`exists (select 1 from class_memberships m where m.student_user_id = users.id and m.left_at is null)`;
const verifiedTeacher = sql<boolean>`users.status = 'ACTIVE' and exists (select 1 from teacher_school_memberships m join schools s on s.id=m.school_id where m.teacher_user_id=users.id and m.ended_at is null and s.status='ACTIVE')`;

function search(value?: string) {
  return value?.trim() ? `%${value.trim().replace(/[\\%_]/g, '\\$&')}%` : undefined;
}
const userFields = {
  id: users.id,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};
function userDto(
  row:
    | typeof users.$inferSelect
    | { id: string; displayName: string; role: string; status: string; createdAt: Date },
): AdminUserDto {
  return {
    id: row.id,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminOperationsService {
  async users(query: AdminUserQueryDto, role: AdminRole) {
    if (role !== 'SUPER_ADMIN' && query.role === 'ADMIN')
      throw new ForbiddenException({
        code: 'ADMIN_PERMISSION_REQUIRED',
        detail: 'Data akun Admin hanya tersedia untuk Super Admin.',
      });
    const term = search(query.search);
    const rows = await getDatabase()
      .db.select(userFields)
      .from(users)
      .where(
        and(
          term ? ilike(users.displayName, term) : undefined,
          role === 'SUPER_ADMIN' ? undefined : inArray(users.role, ['STUDENT', 'TEACHER']),
          query.role ? eq(users.role, query.role) : undefined,
          query.status ? eq(users.status, query.status) : undefined,
          query.affiliation
            ? and(
                eq(users.role, 'STUDENT'),
                query.affiliation === 'SCHOOL'
                  ? schoolAffiliation
                  : sql`not (${schoolAffiliation})`,
              )
            : undefined,
          query.schoolId
            ? sql`((users.role='TEACHER' and exists (select 1 from teacher_school_memberships m where m.teacher_user_id=users.id and m.school_id=${query.schoolId} and m.ended_at is null)) or (users.role='STUDENT' and exists (select 1 from class_memberships m join classes c on c.id=m.class_id where m.student_user_id=users.id and c.school_id=${query.schoolId} and m.left_at is null)))`
            : undefined,
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map(userDto),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async user(id: string, role: AdminRole) {
    const [row] = await getDatabase()
      .db.select({
        ...userFields,
        email: users.email,
        affiliated: schoolAffiliation,
        verified: verifiedTeacher,
      })
      .from(users)
      .where(eq(users.id, id));
    if (!row || (role !== 'SUPER_ADMIN' && row.role === 'ADMIN'))
      throw new NotFoundException('Pengguna tidak ditemukan.');
    return {
      ...userDto(row),
      email: row.email,
      affiliation:
        row.role === 'STUDENT'
          ? row.affiliated
            ? ('SCHOOL' as const)
            : ('MANDIRI' as const)
          : null,
      teacherVerified: row.role === 'TEACHER' ? row.verified : null,
    };
  }
  async memberships(id: string, role: AdminRole, query: ContentPageDto) {
    const profile = await this.user(id, role);
    const rows =
      profile.role === 'STUDENT'
        ? await getDatabase()
            .db.select({
              id: classMemberships.id,
              schoolId: schools.id,
              schoolName: schools.name,
              classId: classes.id,
              className: classes.name,
              startedAt: classMemberships.joinedAt,
              endedAt: classMemberships.leftAt,
              active: sql<boolean>`${classMemberships.leftAt} is null`,
            })
            .from(classMemberships)
            .innerJoin(classes, eq(classes.id, classMemberships.classId))
            .innerJoin(schools, eq(schools.id, classes.schoolId))
            .where(eq(classMemberships.studentUserId, id))
            .orderBy(desc(classMemberships.joinedAt), desc(classMemberships.id))
            .limit(query.limit + 1)
            .offset(query.offset)
        : profile.role === 'TEACHER'
          ? await getDatabase()
              .db.select({
                id: teacherSchoolMemberships.id,
                schoolId: schools.id,
                schoolName: schools.name,
                classId: sql<string | null>`null`,
                className: sql<string | null>`null`,
                startedAt: teacherSchoolMemberships.verifiedAt,
                endedAt: teacherSchoolMemberships.endedAt,
                active: sql<boolean>`${teacherSchoolMemberships.endedAt} is null and ${schools.status}='ACTIVE' and ${profile.status}='ACTIVE'`,
              })
              .from(teacherSchoolMemberships)
              .innerJoin(schools, eq(schools.id, teacherSchoolMemberships.schoolId))
              .where(eq(teacherSchoolMemberships.teacherUserId, id))
              .orderBy(desc(teacherSchoolMemberships.verifiedAt), desc(teacherSchoolMemberships.id))
              .limit(query.limit + 1)
              .offset(query.offset)
          : [];
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
      })),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async roster(id: string, query: AdminRosterQueryDto) {
    await this.class(id);
    const term = search(query.search);
    const rows = await getDatabase()
      .db.select({
        ...userFields,
        membershipId: classMemberships.id,
        joinedAt: classMemberships.joinedAt,
        leftAt: classMemberships.leftAt,
      })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentUserId))
      .where(
        and(
          eq(classMemberships.classId, id),
          term ? ilike(users.displayName, term) : undefined,
          query.state === 'former'
            ? isNotNull(classMemberships.leftAt)
            : query.state === 'active'
              ? isNull(classMemberships.leftAt)
              : undefined,
        ),
      )
      .orderBy(desc(classMemberships.joinedAt), desc(classMemberships.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        ...userDto(row),
        membershipId: row.membershipId,
        joinedAt: row.joinedAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null,
      })),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  private classQuery() {
    return getDatabase()
      .db.select({
        id: classes.id,
        name: classes.name,
        schoolId: classes.schoolId,
        schoolName: schools.name,
        teacherId: classes.teacherUserId,
        teacherName: users.displayName,
        teacherActive: sql<boolean>`coalesce(${users.status}='ACTIVE' and exists (select 1 from ${teacherSchoolMemberships} where ${teacherSchoolMemberships.teacherUserId}=${users.id} and ${teacherSchoolMemberships.schoolId}=${classes.schoolId} and ${teacherSchoolMemberships.endedAt} is null) and ${schools.status}='ACTIVE', false)`,
        createdAt: classes.createdAt,
        archivedAt: classes.archivedAt,
        studentCount: sql<number>`(select count(*)::int from ${classMemberships} where ${classMemberships.classId} = ${classes.id} and ${classMemberships.leftAt} is null)`,
      })
      .from(classes)
      .innerJoin(schools, eq(schools.id, classes.schoolId))
      .leftJoin(users, eq(users.id, classes.teacherUserId));
  }
  async classes(query: AdminClassQueryDto) {
    const term = search(query.search);
    const rows = await this.classQuery()
      .where(
        and(
          term ? ilike(classes.name, term) : undefined,
          query.schoolId ? eq(classes.schoolId, query.schoolId) : undefined,
          query.teacherId ? eq(classes.teacherUserId, query.teacherId) : undefined,
          query.state === 'active'
            ? isNull(classes.archivedAt)
            : query.state === 'archived'
              ? isNotNull(classes.archivedAt)
              : undefined,
        ),
      )
      .orderBy(desc(classes.createdAt), desc(classes.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map((r): AdminClassDto => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        archivedAt: r.archivedAt?.toISOString() ?? null,
      })),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async class(id: string): Promise<AdminClassDto> {
    const [row] = await this.classQuery().where(eq(classes.id, id));
    if (!row) throw new NotFoundException('Kelas tidak ditemukan.');
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
}
