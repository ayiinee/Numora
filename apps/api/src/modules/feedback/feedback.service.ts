import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  enqueueNotification,
  classes,
  classMemberships,
  feedback,
  getDatabase,
  schools,
  teacherSchoolMemberships,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { AssessmentHistoryService } from '../learning/assessment-history.service';
import type { ContentPageDto } from '../content/content.dto';
import type { CreateFeedbackDto, FeedbackDto } from './feedback.dto';
import { randomUUID } from 'node:crypto';
import { recordSupportEvent } from '../reports/support-events';

type Reader = Pick<ReturnType<typeof getDatabase>['db'], 'select'>;

@Injectable()
export class FeedbackService {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AssessmentHistoryService) private readonly history: AssessmentHistoryService,
  ) {}
  private async actor(auth: string | undefined, role: 'TEACHER' | 'STUDENT') {
    const user = await this.identity.me(auth);
    if (
      user.status !== 'ACTIVE' ||
      user.role !== role ||
      (role === 'TEACHER' && !user.teacherVerified)
    )
      throw new ForbiddenException('Akses akun aktif dan peran yang sesuai diperlukan.');
    return user.id;
  }
  private async ownedStudent(db: Reader, teacherId: string, classId: string, studentId: string) {
    const [owned] = await db
      .select({ id: classMemberships.id })
      .from(classes)
      .innerJoin(schools, eq(schools.id, classes.schoolId))
      .innerJoin(
        teacherSchoolMemberships,
        and(
          eq(teacherSchoolMemberships.teacherUserId, classes.teacherUserId),
          eq(teacherSchoolMemberships.schoolId, classes.schoolId),
          isNull(teacherSchoolMemberships.endedAt),
        ),
      )
      .innerJoin(classMemberships, eq(classMemberships.classId, classes.id))
      .innerJoin(users, eq(users.id, classMemberships.studentUserId))
      .where(
        and(
          eq(classes.id, classId),
          eq(classes.teacherUserId, teacherId),
          isNull(classes.archivedAt),
          eq(schools.status, 'ACTIVE'),
          eq(classMemberships.studentUserId, studentId),
          isNull(classMemberships.leftAt),
          eq(users.role, 'STUDENT'),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .for('share')
      .limit(1);
    if (!owned)
      throw new NotFoundException({
        code: 'FEEDBACK_RECIPIENT_NOT_FOUND',
        detail: 'Siswa kelas yang berhak tidak ditemukan.',
      });
  }
  async create(
    auth: string | undefined,
    classId: string,
    studentId: string,
    body: CreateFeedbackDto,
  ) {
    const teacherId = await this.actor(auth, 'TEACHER');
    return getDatabase().db.transaction(async (tx) => {
      await this.ownedStudent(tx, teacherId, classId, studentId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'feedback:' + body.clientRequestId}))`,
      );
      const [existing] = await tx
        .select()
        .from(feedback)
        .where(eq(feedback.id, body.clientRequestId));
      if (existing) {
        if (
          existing.teacherId !== teacherId ||
          existing.studentId !== studentId ||
          existing.classIdAtSend !== classId ||
          existing.body !== body.body.trim()
        )
          throw new ConflictException({
            code: 'FEEDBACK_REQUEST_CONFLICT',
            detail: 'ID pengiriman sudah digunakan untuk feedback lain.',
          });
        return { id: existing.id };
      }
      const [created] = await tx
        .insert(feedback)
        .values({
          id: body.clientRequestId,
          teacherId,
          studentId,
          classIdAtSend: classId,
          body: body.body.trim(),
        })
        .returning({ id: feedback.id });
      await recordSupportEvent(tx, {
        id: randomUUID(),
        actorUserId: teacherId,
        eventName: 'feedback_sent',
        entityType: 'feedback',
        entityId: created!.id,
        correlationId: body.clientRequestId,
        payload: { classId, studentId },
      });
      await enqueueNotification(tx, {
        kind: 'FEEDBACK_RECEIVED',
        sourceId: created!.id,
        recipientId: studentId,
      });
      return created!;
    });
  }
  private async list(
    studentId: string,
    page: ContentPageDto,
    teacherId?: string,
    classId?: string,
  ) {
    const rows = await getDatabase()
      .db.select({ feedback, teacherName: users.displayName })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.teacherId))
      .where(
        and(
          eq(feedback.studentId, studentId),
          teacherId ? eq(feedback.teacherId, teacherId) : undefined,
          classId ? eq(feedback.classIdAtSend, classId) : undefined,
        ),
      )
      .orderBy(desc(feedback.sentAt), desc(feedback.id))
      .limit(page.limit + 1)
      .offset(page.offset);
    return {
      items: rows.slice(0, page.limit).map(({ feedback: f, teacherName }): FeedbackDto => ({
        id: f.id,
        classId: f.classIdAtSend,
        studentId: f.studentId,
        teacherName,
        body: f.body,
        sentAt: f.sentAt.toISOString(),
        readAt: f.readAt?.toISOString() ?? null,
      })),
      nextOffset: rows.length > page.limit ? page.offset + page.limit : null,
    };
  }
  async teacherList(
    auth: string | undefined,
    classId: string,
    studentId: string,
    page: ContentPageDto,
  ) {
    const teacherId = await this.actor(auth, 'TEACHER');
    await this.ownedStudent(getDatabase().db, teacherId, classId, studentId);
    return this.list(studentId, page, teacherId, classId);
  }
  async studentList(auth: string | undefined, page: ContentPageDto) {
    return this.list(await this.actor(auth, 'STUDENT'), page);
  }
  async summary(auth: string | undefined) {
    const studentId = await this.actor(auth, 'STUDENT');
    const [unread] = await getDatabase()
      .db.select({ count: count() })
      .from(feedback)
      .where(and(eq(feedback.studentId, studentId), isNull(feedback.readAt)));
    return {
      unreadCount: unread!.count,
      latest: (await this.list(studentId, { limit: 3, offset: 0 })).items,
    };
  }
  async markRead(auth: string | undefined, id: string) {
    const studentId = await this.actor(auth, 'STUDENT');
    return getDatabase().db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(feedback)
        .where(and(eq(feedback.id, id), eq(feedback.studentId, studentId)))
        .for('update');
      if (!row) throw new NotFoundException('Feedback tidak ditemukan.');
      if (row.readAt) return { id: row.id, readAt: row.readAt.toISOString() };
      const [updated] = await tx
        .update(feedback)
        .set({ readAt: sql`now()` })
        .where(eq(feedback.id, id))
        .returning({ readAt: feedback.readAt });
      await recordSupportEvent(tx, {
        id: randomUUID(),
        actorUserId: studentId,
        eventName: 'feedback_read',
        entityType: 'feedback',
        entityId: id,
        payload: { classId: row.classIdAtSend },
      });
      return { id, readAt: updated!.readAt!.toISOString() };
    });
  }
  async teacherHistory(
    auth: string | undefined,
    classId: string,
    studentId: string,
    cursor?: string,
  ) {
    const teacherId = await this.actor(auth, 'TEACHER');
    await this.ownedStudent(getDatabase().db, teacherId, classId, studentId);
    return this.history.listForStudent(studentId, { cursor, classId });
  }
}
