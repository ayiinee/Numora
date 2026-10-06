import type { AdminRole } from '../identity/admin-capabilities';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { classes, classMemberships, getDatabase, schools, users } from '@tka/database';
import type {
  AdminClassDto,
  AdminClassQueryDto,
  AdminUserDto,
  AdminUserQueryDto,
} from './operations.dto';

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
    const [row] = await getDatabase().db.select(userFields).from(users).where(eq(users.id, id));
    if (!row || (role !== 'SUPER_ADMIN' && row.role === 'ADMIN'))
      throw new NotFoundException('Pengguna tidak ditemukan.');
    return userDto(row);
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
