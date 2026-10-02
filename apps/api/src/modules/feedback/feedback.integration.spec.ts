import { randomUUID } from 'node:crypto';
import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import {
  analyticsOutbox,
  classMemberships,
  classes,
  closeDatabaseConnection,
  feedback,
  getDatabase,
  schools,
  teacherSchoolMemberships,
  teacherVerificationTokens,
  users,
} from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { FeedbackModule } from './feedback.module';

const databaseSuite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
databaseSuite('Teacher feedback API with PostgreSQL', () => {
  let app: INestApplication;
  let base: string;
  let adminId: string;
  let teacherAId: string;
  let teacherBId: string;
  let studentAId: string;
  let studentBId: string;
  let schoolId: string;
  let classAId: string;
  let classBId: string;
  let sentFeedbackId: string;
  const suffix = randomUUID().slice(0, 8);
  const token = (name: string) => `Bearer ${name}`;

  async function request(path: string, method = 'GET', body?: object, actor = 'studentA') {
    return fetch(`${base}/${path}`, {
      method,
      headers: {
        Authorization: token(actor),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl || process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(new URL(testUrl).hostname)) {
      throw new Error('Only an isolated local TEST_DATABASE_URL is permitted.');
    }
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const profiles = await db.insert(users).values([
      { authUserId: randomUUID(), role: 'ADMIN', displayName: `TEST admin ${suffix}`, email: `feedback-admin-${suffix}@example.test` },
      { authUserId: randomUUID(), role: 'TEACHER', displayName: `TEST teacher A ${suffix}`, email: `feedback-teacher-a-${suffix}@example.test` },
      { authUserId: randomUUID(), role: 'TEACHER', displayName: `TEST teacher B ${suffix}`, email: `feedback-teacher-b-${suffix}@example.test` },
      { authUserId: randomUUID(), role: 'STUDENT', displayName: `TEST student A ${suffix}`, email: `feedback-student-a-${suffix}@example.test` },
      { authUserId: randomUUID(), role: 'STUDENT', displayName: `TEST student B ${suffix}`, email: `feedback-student-b-${suffix}@example.test` },
    ]).returning({ id: users.id });
    adminId = profiles[0]!.id;
    teacherAId = profiles[1]!.id;
    teacherBId = profiles[2]!.id;
    studentAId = profiles[3]!.id;
    studentBId = profiles[4]!.id;

    const [school] = await db.insert(schools).values({
      code: `FEEDBACK-${suffix}`,
      name: `TEST feedback school ${suffix}`,
      status: 'ACTIVE',
    }).returning({ id: schools.id });
    schoolId = school!.id;

    for (const [index, teacherId] of [teacherAId, teacherBId].entries()) {
      const now = new Date();
      const [verificationToken] = await db.insert(teacherVerificationTokens).values({
        schoolId,
        tokenHash: `TEST-feedback-${suffix}-${index}`,
        createdByUserId: adminId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        usedAt: now,
        usedByUserId: teacherId,
      }).returning({ id: teacherVerificationTokens.id });
      await db.insert(teacherSchoolMemberships).values({
        teacherUserId: teacherId,
        schoolId,
        verificationTokenId: verificationToken!.id,
        verifiedAt: now,
      });
    }

    const createdClasses = await db.insert(classes).values([
      { schoolId, teacherUserId: teacherAId, name: `TEST class A ${suffix}`, joinCode: `FEEDA${suffix}` },
      { schoolId, teacherUserId: teacherBId, name: `TEST class B ${suffix}`, joinCode: `FEEDB${suffix}` },
    ]).returning({ id: classes.id });
    classAId = createdClasses[0]!.id;
    classBId = createdClasses[1]!.id;
    await db.insert(classMemberships).values([
      { classId: classAId, studentUserId: studentAId },
      { classId: classBId, studentUserId: studentBId },
    ]);

    const module = await Test.createTestingModule({ imports: [FeedbackModule] })
      .overrideProvider(IdentityService)
      .useValue({
        me: async (authorization?: string) => {
          const actor = authorization?.replace(/^Bearer /, '');
          const profilesByActor: Record<string, { id: string; role: string; status: string; teacherVerified: boolean | null }> = {
            teacherA: { id: teacherAId, role: 'TEACHER', status: 'ACTIVE', teacherVerified: true },
            teacherB: { id: teacherBId, role: 'TEACHER', status: 'ACTIVE', teacherVerified: true },
            studentA: { id: studentAId, role: 'STUDENT', status: 'ACTIVE', teacherVerified: null },
            studentB: { id: studentBId, role: 'STUDENT', status: 'ACTIVE', teacherVerified: null },
            admin: { id: adminId, role: 'ADMIN', status: 'ACTIVE', teacherVerified: null },
          };
          const profile = actor ? profilesByActor[actor] : undefined;
          if (!profile) throw new UnauthorizedException();
          return profile;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app?.close();
    if (teacherAId && teacherBId) {
      const { db } = getDatabase();
      const fixtureFeedback = await db.select({ id: feedback.id }).from(feedback).where(inArray(feedback.teacherId, [teacherAId, teacherBId]));
      const feedbackIds = fixtureFeedback.map((row) => row.id);
      if (feedbackIds.length) {
        await db.delete(analyticsOutbox).where(inArray(analyticsOutbox.entityId, feedbackIds));
        await db.delete(feedback).where(inArray(feedback.id, feedbackIds));
      }
      if (classAId && classBId) await db.delete(classMemberships).where(inArray(classMemberships.classId, [classAId, classBId]));
      await db.delete(classes).where(inArray(classes.id, [classAId, classBId]));
      await db.delete(teacherSchoolMemberships).where(inArray(teacherSchoolMemberships.teacherUserId, [teacherAId, teacherBId]));
      await db.delete(teacherVerificationTokens).where(eq(teacherVerificationTokens.schoolId, schoolId));
      await db.delete(schools).where(eq(schools.id, schoolId));
      await db.delete(users).where(inArray(users.id, [adminId, teacherAId, teacherBId, studentAId, studentBId]));
    }
    await closeDatabaseConnection();
  });

  it('sends one-way feedback only from a verified class Teacher to an active class Student', async () => {
    const clientRequestId = randomUUID();
    const responses = await Promise.all(Array.from({ length: 2 }, () => request(
      `classes/${classAId}/students/${studentAId}/feedback`,
      'POST',
      { clientRequestId, body: '  DEMO feedback note  ' },
      'teacherA',
    )));
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(responses.map((response) => response.json())) as {
      id: string; sentAt: string; readAt: string | null;
    }[];
    expect(results[0]).toEqual(results[1]);
    const result = results[0]!;
    sentFeedbackId = result.id;
    expect(result.readAt).toBeNull();
    const [stored] = await getDatabase().db.select().from(feedback).where(eq(feedback.id, result.id));
    expect(stored).toMatchObject({
      teacherId: teacherAId,
      studentId: studentAId,
      classIdAtSend: classAId,
      body: 'DEMO feedback note',
      readAt: null,
    });
    const [event] = await getDatabase().db.select().from(analyticsOutbox).where(eq(analyticsOutbox.entityId, result.id));
    expect(event).toMatchObject({ eventName: 'feedback_sent', actorUserId: teacherAId, entityType: 'feedback' });
    expect(event!.payload).not.toHaveProperty('body');
    expect(await getDatabase().db.select().from(feedback).where(eq(feedback.id, clientRequestId))).toHaveLength(1);
    expect((await request(
      `classes/${classAId}/students/${studentAId}/feedback`,
      'POST',
      { clientRequestId, body: 'Different note' },
      'teacherA',
    )).status).toBe(409);
  });

  it('rejects cross-class, non-Teacher, and invalid feedback requests', async () => {
    expect((await request(`classes/${classBId}/students/${studentBId}/feedback`, 'POST', { body: 'No access' }, 'teacherA')).status).toBe(403);
    expect((await request(`classes/${classAId}/students/${studentBId}/feedback`, 'POST', { body: 'No membership' }, 'teacherA')).status).toBe(404);
    expect((await request(`classes/${classAId}/students/${studentAId}/feedback`, 'POST', { body: 'Student cannot send' }, 'studentA')).status).toBe(403);
    expect((await request(`classes/${classAId}/students/${studentAId}/feedback`, 'POST', { body: '   ' }, 'teacherA')).status).toBe(400);
    expect((await request(`classes/${classAId}/students/${studentAId}/feedback`, 'POST', { body: 'x'.repeat(1001) }, 'teacherA')).status).toBe(400);
  });

  it('shows read state to the sending Teacher and exposes only the Student’s own feedback', async () => {
    const teacherList = await request(`classes/${classAId}/students/${studentAId}/feedback`, 'GET', undefined, 'teacherA');
    expect(teacherList.status).toBe(200);
    expect(await teacherList.json()).toMatchObject({ items: [{ id: sentFeedbackId, body: 'DEMO feedback note', readAt: null }] });
    expect((await request(`classes/${classAId}/students/${studentAId}/feedback`, 'GET', undefined, 'teacherB')).status).toBe(403);
    expect(await (await request('students/me/feedback', 'GET', undefined, 'studentA')).json()).toMatchObject({
      items: [{ id: sentFeedbackId, readAt: null }],
    });
    expect(await (await request('students/me/feedback', 'GET', undefined, 'studentB')).json()).toEqual({ items: [] });
  });

  it('lets the recipient mark feedback read once and hides it from other students', async () => {
    expect((await request(`students/me/feedback/${sentFeedbackId}/read`, 'PATCH', undefined, 'studentB')).status).toBe(404);
    const first = await request(`students/me/feedback/${sentFeedbackId}/read`, 'PATCH', undefined, 'studentA');
    expect(first.status).toBe(200);
    const readResult = await first.json() as { readAt: string | null };
    expect(readResult.readAt).toBeTruthy();
    const second = await request(`students/me/feedback/${sentFeedbackId}/read`, 'PATCH', undefined, 'studentA');
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(readResult);

    const events = await getDatabase().db.select().from(analyticsOutbox).where(and(
      eq(analyticsOutbox.entityId, sentFeedbackId),
      eq(analyticsOutbox.eventName, 'feedback_read'),
    ));
    expect(events).toHaveLength(1);
    const teacherList = await request(`classes/${classAId}/students/${studentAId}/feedback`, 'GET', undefined, 'teacherA');
    expect(await teacherList.json()).toMatchObject({ items: [{ id: sentFeedbackId, readAt: readResult.readAt }] });
  });
});
