import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { analyticsOutbox, classMemberships, feedback, getDatabase, users } from '@tka/database';
import { ClassesService } from '../classes/classes.service';
import { IdentityService } from '../identity/identity.service';

const problem = (code: string, detail: string) => ({ code, detail });

@Injectable()
export class FeedbackService {
  constructor(
    private readonly identity: IdentityService,
    private readonly classes: ClassesService,
  ) {}

  private async teacherStudent(
    authorization: string | undefined,
    classId: string,
    studentId: string,
  ) {
    const owned = await this.classes.students(authorization, classId);
    const student = owned.items.find((item) => item.id === studentId);
    if (!student) {
      throw new NotFoundException(
        problem('STUDENT_NOT_FOUND', 'Student tidak ditemukan pada Class ini.'),
      );
    }
    return { classId: owned.class.id, studentId };
  }

  private async studentId(authorization?: string) {
    const profile = await this.identity.me(authorization);
    if (profile.role !== 'STUDENT' || profile.status !== 'ACTIVE') {
      throw new ForbiddenException(problem('STUDENT_REQUIRED', 'Akses Siswa diperlukan.'));
    }
    return profile.id;
  }

  private serialize(row: { id: string; body: string; sentAt: Date; readAt: Date | null }) {
    return {
      id: row.id,
      body: row.body,
      sentAt: row.sentAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    };
  }

  async send(
    authorization: string | undefined,
    classId: string,
    studentId: string,
    body: string,
    clientRequestId?: string,
  ) {
    const target = await this.teacherStudent(authorization, classId, studentId);
    const teacher = await this.identity.me(authorization);
    if (teacher.role !== 'TEACHER' || !teacher.teacherVerified) {
      throw new ForbiddenException(
        problem('TEACHER_ACCESS_REQUIRED', 'Akses Guru terverifikasi diperlukan.'),
      );
    }
    const normalizedBody = body.trim();
    if (!normalizedBody || normalizedBody.length > 1000) {
      throw new BadRequestException(problem('FEEDBACK_BODY_INVALID', 'Feedback harus 1–1.000 karakter.'));
    }

    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ id: classMemberships.id })
        .from(classMemberships)
        .innerJoin(users, eq(users.id, classMemberships.studentUserId))
        .where(and(
          eq(classMemberships.classId, target.classId),
          eq(classMemberships.studentUserId, target.studentId),
          isNull(classMemberships.leftAt),
          eq(users.role, 'STUDENT'),
          eq(users.status, 'ACTIVE'),
        ))
        .for('share')
        .limit(1);
      if (!membership) {
        throw new NotFoundException(
          problem('STUDENT_NOT_FOUND', 'Student tidak ditemukan pada Class ini.'),
        );
      }

      const feedbackId = clientRequestId ?? randomUUID();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'feedback:' + feedbackId}))`);
      const [existing] = await tx.select().from(feedback).where(eq(feedback.id, feedbackId)).limit(1);
      if (existing) {
        if (
          existing.teacherId !== teacher.id || existing.studentId !== target.studentId ||
          existing.classIdAtSend !== target.classId || existing.body !== normalizedBody
        ) {
          throw new ConflictException('ID pengiriman feedback sudah digunakan.');
        }
        return { id: existing.id, sentAt: existing.sentAt, readAt: existing.readAt };
      }

      const [created] = await tx
        .insert(feedback)
        .values({
          id: feedbackId,
          teacherId: teacher.id,
          studentId: target.studentId,
          classIdAtSend: target.classId,
          body: normalizedBody,
        })
        .returning({ id: feedback.id, sentAt: feedback.sentAt, readAt: feedback.readAt });
      if (!created) throw new Error('Feedback insert returned no row.');
      await tx.insert(analyticsOutbox).values({
        eventName: 'feedback_sent',
        actorUserId: teacher.id,
        entityType: 'feedback',
        entityId: created.id,
        payload: { classIdAtSend: target.classId },
      });
      return created;
    });
  }

  async forTeacher(
    authorization: string | undefined,
    classId: string,
    studentId: string,
  ) {
    const target = await this.teacherStudent(authorization, classId, studentId);
    const { db } = getDatabase();
    const rows = await db
      .select({ id: feedback.id, body: feedback.body, sentAt: feedback.sentAt, readAt: feedback.readAt })
      .from(feedback)
      .where(and(
        eq(feedback.teacherId, (await this.identity.me(authorization)).id),
        eq(feedback.classIdAtSend, target.classId),
        eq(feedback.studentId, target.studentId),
      ))
      .orderBy(desc(feedback.sentAt), desc(feedback.id));
    return { items: rows.map((row) => this.serialize(row)) };
  }

  async forStudent(authorization?: string) {
    const studentId = await this.studentId(authorization);
    const { db } = getDatabase();
    const rows = await db
      .select({ id: feedback.id, body: feedback.body, sentAt: feedback.sentAt, readAt: feedback.readAt })
      .from(feedback)
      .where(eq(feedback.studentId, studentId))
      .orderBy(desc(feedback.sentAt), desc(feedback.id));
    return { items: rows.map((row) => this.serialize(row)) };
  }

  async markRead(authorization: string | undefined, feedbackId: string) {
    const studentId = await this.studentId(authorization);
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(feedback)
        .where(and(eq(feedback.id, feedbackId), eq(feedback.studentId, studentId)))
        .for('update')
        .limit(1);
      if (!row) {
        throw new NotFoundException(problem('FEEDBACK_NOT_FOUND', 'Feedback tidak ditemukan.'));
      }
      if (row.readAt) return this.serialize(row);

      const readAt = new Date();
      const [updated] = await tx
        .update(feedback)
        .set({ readAt })
        .where(and(eq(feedback.id, feedbackId), eq(feedback.studentId, studentId), isNull(feedback.readAt)))
        .returning({ id: feedback.id, body: feedback.body, sentAt: feedback.sentAt, readAt: feedback.readAt });
      if (!updated) throw new Error('Feedback read transition failed.');
      await tx.insert(analyticsOutbox).values({
        eventName: 'feedback_read',
        actorUserId: studentId,
        entityType: 'feedback',
        entityId: feedbackId,
        payload: { classIdAtSend: row.classIdAtSend },
      });
      return this.serialize(updated);
    });
  }
}