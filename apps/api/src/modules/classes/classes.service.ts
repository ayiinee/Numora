import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  auditLogs,
  classes,
  classMemberships,
  classStudentBans,
  getDatabase,
  schools,
  teacherSchoolMemberships,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { generateClassJoinCode, isJoinCodeCollision } from './join-code';

@Injectable()
export class ClassesService {
  constructor(private readonly identity: IdentityService) {}

  private async teacher(authorization?: string) {
    const profile = await this.identity.me(authorization);
    if (profile.role !== 'TEACHER' || !profile.teacherVerified) {
      throw new ForbiddenException({
        code: 'TEACHER_ACCESS_REQUIRED',
        detail: 'Akses Guru terverifikasi diperlukan.',
      });
    }
    return profile.id;
  }

  async create(authorization: string | undefined, name: string, schoolId?: string) {
    if (!name.trim())
      throw new ConflictException({
        code: 'CLASS_NAME_REQUIRED',
        detail: 'Nama Class wajib diisi.',
      });
    const teacherId = await this.teacher(authorization);
    const { db } = getDatabase();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await db.transaction(async (tx) => {
          const [membership] = await tx
            .select({ schoolId: teacherSchoolMemberships.schoolId })
            .from(teacherSchoolMemberships)
            .innerJoin(schools, eq(schools.id, teacherSchoolMemberships.schoolId))
            .where(
              and(
                eq(teacherSchoolMemberships.teacherUserId, teacherId),
                isNull(teacherSchoolMemberships.endedAt),
                eq(schools.status, 'ACTIVE'),
                schoolId ? eq(schools.id, schoolId) : undefined,
              ),
            )
            .for('share')
            .limit(1);
          if (!membership)
            throw new ForbiddenException({
              code: 'SCHOOL_FORBIDDEN',
              detail: 'Sekolah aktif dan verifikasi Guru diperlukan.',
            });
          const [created] = await tx
            .insert(classes)
            .values({
              schoolId: membership.schoolId,
              teacherUserId: teacherId,
              name: name.trim(),
              joinCode: generateClassJoinCode(),
            })
            .returning({ id: classes.id, name: classes.name, joinCode: classes.joinCode });
          await tx.insert(auditLogs).values({
            actorUserId: teacherId,
            action: 'class_created',
            entityType: 'class',
            entityId: created!.id,
          });
          return created!;
        });
      } catch (error) {
        if (!isJoinCodeCollision(error)) throw error;
      }
    }
    throw new ServiceUnavailableException({
      code: 'CLASS_CODE_GENERATION_UNAVAILABLE',
      detail: 'Kode kelas belum dapat dibuat. Coba lagi.',
    });
  }

  async join(authorization: string | undefined, joinCode: string) {
    const profile = await this.identity.me(authorization);
    if (profile.role !== 'STUDENT')
      throw new ForbiddenException({ code: 'STUDENT_REQUIRED', detail: 'Akses Siswa diperlukan.' });
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode })
        .from(classes)
        .innerJoin(schools, eq(schools.id, classes.schoolId))
        .where(
          and(
            eq(classes.joinCode, joinCode.trim().toUpperCase()),
            isNull(classes.archivedAt),
            eq(schools.status, 'ACTIVE'),
          ),
        )
        .for('share')
        .limit(1);
      if (!target)
        throw new NotFoundException({ code: 'CLASS_NOT_FOUND', detail: 'Kode Class tidak valid.' });
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, profile.id))
        .for('no key update');
      const [ban] = await tx
        .select({ id: classStudentBans.id })
        .from(classStudentBans)
        .where(
          and(
            eq(classStudentBans.classId, target.id),
            eq(classStudentBans.studentUserId, profile.id),
            isNull(classStudentBans.unbannedAt),
          ),
        );
      if (ban)
        throw new ForbiddenException({
          code: 'CLASS_BANNED',
          detail: 'Akses kelas diblokir sampai Guru melakukan unban.',
        });
      const memberships = await tx
        .select({ classId: classMemberships.classId })
        .from(classMemberships)
        .where(
          and(eq(classMemberships.studentUserId, profile.id), isNull(classMemberships.leftAt)),
        );
      if (memberships.some((m) => m.classId === target.id)) return { class: target, joined: true };
      if (memberships.length >= 5)
        throw new ConflictException({
          code: 'CLASS_LIMIT_REACHED',
          detail: 'Siswa hanya dapat memiliki maksimal 5 kelas aktif.',
        });
      const [created] = await tx
        .insert(classMemberships)
        .values({ classId: target.id, studentUserId: profile.id })
        .onConflictDoNothing()
        .returning({ id: classMemberships.id });
      if (!created)
        throw new ConflictException({
          code: 'CLASS_MEMBERSHIP_CONFLICT',
          detail: 'Keanggotaan kelas berubah. Coba lagi.',
        });
      await tx.insert(auditLogs).values({
        actorUserId: profile.id,
        action: 'student_joined_class',
        entityType: 'class',
        entityId: target.id,
      });
      return { class: target, joined: true };
    });
  }

  async leave(authorization: string | undefined, classId: string) {
    const profile = await this.identity.me(authorization);
    if (profile.role !== 'STUDENT') throw new ForbiddenException('Akses Siswa diperlukan.');
    return getDatabase().db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, profile.id))
        .for('no key update');
      const ended = await tx
        .update(classMemberships)
        .set({
          leftAt: sql`greatest(clock_timestamp(),${classMemberships.joinedAt})`,
          endReason: 'LEFT',
        })
        .where(
          and(
            eq(classMemberships.classId, classId),
            eq(classMemberships.studentUserId, profile.id),
            isNull(classMemberships.leftAt),
          ),
        )
        .returning({ id: classMemberships.id });
      if (ended.length)
        await tx
          .insert(auditLogs)
          .values({
            actorUserId: profile.id,
            action: 'student_left_class',
            entityType: 'class',
            entityId: classId,
          });
      return { left: true };
    });
  }

  async takeover(authorization: string | undefined, joinCode: string) {
    const teacherId = await this.teacher(authorization);
    return getDatabase().db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(classes)
        .where(and(eq(classes.joinCode, joinCode.trim().toUpperCase()), isNull(classes.archivedAt)))
        .for('no key update');
      if (!target) throw new NotFoundException('Kelas tidak ditemukan.');
      const [verified] = await tx
        .select({ id: teacherSchoolMemberships.id })
        .from(teacherSchoolMemberships)
        .innerJoin(schools, eq(schools.id, teacherSchoolMemberships.schoolId))
        .where(
          and(
            eq(teacherSchoolMemberships.teacherUserId, teacherId),
            eq(teacherSchoolMemberships.schoolId, target.schoolId),
            isNull(teacherSchoolMemberships.endedAt),
            eq(schools.status, 'ACTIVE'),
          ),
        )
        .for('share');
      if (!verified)
        throw new ForbiddenException({
          code: 'SCHOOL_FORBIDDEN',
          detail: 'Verifikasi sekolah kelas diperlukan.',
        });
      if (target.teacherUserId === teacherId)
        return { id: target.id, name: target.name, joinCode: target.joinCode };
      if (target.teacherUserId !== null)
        throw new ConflictException({
          code: 'CLASS_HAS_TEACHER',
          detail: 'Kelas masih memiliki Guru aktif.',
        });
      await tx
        .update(classes)
        .set({ teacherUserId: teacherId, updatedAt: new Date() })
        .where(eq(classes.id, target.id));
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: teacherId,
          action: 'class_taken_over',
          entityType: 'class',
          entityId: target.id,
          metadata: { schoolId: target.schoolId },
        });
      return { id: target.id, name: target.name, joinCode: target.joinCode };
    });
  }

  async setBan(
    authorization: string | undefined,
    classId: string,
    studentId: string,
    banned: boolean,
  ) {
    const teacherId = await this.teacher(authorization);
    return getDatabase().db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.id, classId),
            eq(classes.teacherUserId, teacherId),
            isNull(classes.archivedAt),
          ),
        )
        .for('no key update');
      if (!target)
        throw new ForbiddenException({ code: 'CLASS_FORBIDDEN', detail: 'Akses kelas ditolak.' });
      const [verified] = await tx
        .select({ id: teacherSchoolMemberships.id })
        .from(teacherSchoolMemberships)
        .innerJoin(schools, eq(schools.id, teacherSchoolMemberships.schoolId))
        .where(
          and(
            eq(teacherSchoolMemberships.teacherUserId, teacherId),
            eq(teacherSchoolMemberships.schoolId, target.schoolId),
            isNull(teacherSchoolMemberships.endedAt),
            eq(schools.status, 'ACTIVE'),
          ),
        )
        .for('share');
      if (!verified) throw new ForbiddenException('Verifikasi sekolah diperlukan.');
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, studentId))
        .for('no key update');
      const [existing] = await tx
        .select()
        .from(classStudentBans)
        .where(
          and(
            eq(classStudentBans.classId, classId),
            eq(classStudentBans.studentUserId, studentId),
            isNull(classStudentBans.unbannedAt),
          ),
        );
      if (!!existing === banned) return { banned };
      if (banned) {
        const [active] = await tx
          .select({ id: classMemberships.id })
          .from(classMemberships)
          .where(
            and(
              eq(classMemberships.classId, classId),
              eq(classMemberships.studentUserId, studentId),
              isNull(classMemberships.leftAt),
            ),
          );
        if (!active) throw new NotFoundException('Siswa bukan anggota aktif kelas.');
        await tx
          .insert(classStudentBans)
          .values({ classId, studentUserId: studentId, bannedByUserId: teacherId });
      } else {
        await tx
          .update(classStudentBans)
          .set({
            unbannedAt: sql`greatest(clock_timestamp(),${classStudentBans.bannedAt})`,
            unbannedByUserId: teacherId,
          })
          .where(eq(classStudentBans.id, existing!.id));
      }
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: teacherId,
          action: banned ? 'class_student_banned' : 'class_student_unbanned',
          entityType: 'class',
          entityId: classId,
          metadata: { studentId },
        });
      return { banned };
    });
  }

  async list(authorization?: string) {
    const teacherId = await this.teacher(authorization);
    const { db } = getDatabase();
    const items = await db
      .select({ id: classes.id, name: classes.name, joinCode: classes.joinCode })
      .from(classes)
      .innerJoin(
        teacherSchoolMemberships,
        and(
          eq(teacherSchoolMemberships.teacherUserId, classes.teacherUserId),
          eq(teacherSchoolMemberships.schoolId, classes.schoolId),
          isNull(teacherSchoolMemberships.endedAt),
        ),
      )
      .innerJoin(schools, eq(schools.id, classes.schoolId))
      .where(
        and(
          eq(classes.teacherUserId, teacherId),
          isNull(classes.archivedAt),
          eq(schools.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(classes.name), asc(classes.id));
    return { items };
  }

  async students(authorization: string | undefined, classId: string) {
    const teacherId = await this.teacher(authorization);
    const { db } = getDatabase();
    const [ownedClass] = await db
      .select({
        id: classes.id,
        name: classes.name,
        schoolId: classes.schoolId,
        teacherUserId: classes.teacherUserId,
        archivedAt: classes.archivedAt,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!ownedClass || ownedClass.archivedAt) {
      throw new NotFoundException({ code: 'CLASS_NOT_FOUND', detail: 'Class tidak ditemukan.' });
    }
    if (ownedClass.teacherUserId !== teacherId) {
      throw new ForbiddenException({ code: 'CLASS_FORBIDDEN', detail: 'Akses Class ditolak.' });
    }
    const [membership] = await db
      .select({ id: teacherSchoolMemberships.id })
      .from(teacherSchoolMemberships)
      .where(
        and(
          eq(teacherSchoolMemberships.teacherUserId, teacherId),
          eq(teacherSchoolMemberships.schoolId, ownedClass.schoolId),
          isNull(teacherSchoolMemberships.endedAt),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ForbiddenException({ code: 'SCHOOL_FORBIDDEN', detail: 'Akses sekolah ditolak.' });
    }
    const [activeSchool] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(and(eq(schools.id, ownedClass.schoolId), eq(schools.status, 'ACTIVE')))
      .limit(1);
    if (!activeSchool) {
      throw new ForbiddenException({ code: 'SCHOOL_FORBIDDEN', detail: 'Sekolah tidak aktif.' });
    }
    const items = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentUserId))
      .where(
        and(
          eq(classMemberships.classId, classId),
          isNull(classMemberships.leftAt),
          eq(users.role, 'STUDENT'),
        ),
      )
      .orderBy(asc(users.displayName), asc(users.id));
    return { class: { id: ownedClass.id, name: ownedClass.name }, items };
  }
}
