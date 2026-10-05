import { randomUUID } from 'node:crypto';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  analyticsOutbox,
  assessmentAttempts,
  assessmentPackages,
  classes,
  classMemberships,
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
import { AdminModule } from '../admin/admin.module';
import { FeedbackModule } from './feedback.module';

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)('feedback and Admin operations over HTTP/PostgreSQL', () => {
  let app: INestApplication;
  let base: string;
  let classId: string;
  let schoolId: string;
  const profiles = new Map<
    string,
    {
      id: string;
      role: string;
      adminRole?: 'SUPER_ADMIN';
      status: string;
      teacherVerified: boolean;
    }
  >();
  const studentId = () => profiles.get('student')!.id;
  const path = () => `classes/${classId}/students/${studentId()}/feedback`;
  const suffix = randomUUID().slice(0, 8);
  const analyticsBefore = process.env.SUPPORT_ANALYTICS_ENABLED;
  async function request(path: string, token = 'teacher', method = 'GET', body?: object) {
    return fetch(`${base}/${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  beforeAll(async () => {
    if (
      !url ||
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1'].includes(new URL(url).hostname)
    )
      throw Error('Only an isolated localhost test database is allowed.');
    process.env.DATABASE_URL = url;
    process.env.SUPPORT_ANALYTICS_ENABLED = 'true'; // TEST ONLY proposed contract.
    const db = getDatabase().db;
    for (const token of ['admin', 'teacher', 'otherTeacher', 'student', 'otherStudent']) {
      const role =
        token === 'admin'
          ? 'ADMIN'
          : token.toLowerCase().includes('teacher')
            ? 'TEACHER'
            : 'STUDENT';
      const [user] = await db
        .insert(users)
        .values({
          authUserId: randomUUID(),
          role,
          displayName: `TEST ${suffix} ${token}`,
          email: `${suffix}-${token}@example.test`,
        })
        .returning();
      profiles.set(token, {
        id: user!.id,
        role,
        ...(role === 'ADMIN' ? { adminRole: 'SUPER_ADMIN' as const } : {}),
        status: 'ACTIVE',
        teacherVerified: role === 'TEACHER',
      });
    }
    profiles.set('unverified', { ...profiles.get('teacher')!, teacherVerified: false });
    profiles.set('disabled', { ...profiles.get('teacher')!, status: 'DISABLED' });
    const [school] = await db
      .insert(schools)
      .values({ code: `FB-${suffix}`, name: 'TEST school' })
      .returning();
    schoolId = school!.id;
    for (const token of ['teacher', 'otherTeacher']) {
      const now = new Date();
      const [verification] = await db
        .insert(teacherVerificationTokens)
        .values({
          schoolId,
          tokenHash: randomUUID(),
          createdByUserId: profiles.get('admin')!.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
          usedAt: now,
          usedByUserId: profiles.get(token)!.id,
        })
        .returning();
      await db.insert(teacherSchoolMemberships).values({
        schoolId,
        teacherUserId: profiles.get(token)!.id,
        verificationTokenId: verification!.id,
      });
    }
    const [ownClass] = await db
      .insert(classes)
      .values({
        schoolId,
        teacherUserId: profiles.get('teacher')!.id,
        name: `TEST class ${suffix}`,
        joinCode: randomUUID(),
      })
      .returning();
    classId = ownClass!.id;
    await db.insert(classMemberships).values({ classId, studentUserId: studentId() });
    const module = await Test.createTestingModule({ imports: [FeedbackModule, AdminModule] })
      .overrideProvider(IdentityService)
      .useValue({
        me: async (auth?: string) => {
          const profile = profiles.get(auth?.replace(/^Bearer /, '') ?? '');
          if (!profile) throw new UnauthorizedException();
          return profile;
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  }, 30_000);
  afterAll(async () => {
    if (analyticsBefore === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
    else process.env.SUPPORT_ANALYTICS_ENABLED = analyticsBefore;
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('rejects invalid roles, verification, disabled accounts and foreign-class recipients', async () => {
    const body = { clientRequestId: randomUUID(), body: 'TEST feedback' };
    expect((await request(path(), '', 'POST', body)).status).toBe(401);
    for (const token of ['student', 'admin', 'unverified', 'disabled'])
      expect((await request(path(), token, 'POST', body)).status).toBe(403);
    expect((await request(path(), 'otherTeacher', 'POST', body)).status).toBe(404);
    expect(
      (
        await request(
          `classes/${classId}/students/${profiles.get('otherStudent')!.id}/feedback`,
          'teacher',
          'POST',
          body,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `classes/${classId}/students/${studentId()}/assessment-results`,
          'otherTeacher',
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(`classes/${classId}/students/${studentId()}/assessment-results`, 'teacher'))
        .status,
    ).toBe(200);
  });
  it('enforces body/input limits and creates exactly one feedback across concurrent retries', async () => {
    for (const body of ['', '   ', 'a'.repeat(1001)])
      expect(
        (await request(path(), 'teacher', 'POST', { clientRequestId: randomUUID(), body })).status,
      ).toBe(400);
    expect(
      (
        await request(path(), 'teacher', 'POST', {
          body: 'TEST',
          clientRequestId: randomUUID(),
          teacherId: profiles.get('otherTeacher')!.id,
        })
      ).status,
    ).toBe(400);
    const body = { clientRequestId: randomUUID(), body: 'a'.repeat(1000) };
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => request(path(), 'teacher', 'POST', body)),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(
      await getDatabase().db.select().from(feedback).where(eq(feedback.id, body.clientRequestId)),
    ).toHaveLength(1);
    expect(
      await getDatabase()
        .db.select()
        .from(analyticsOutbox)
        .where(eq(analyticsOutbox.entityId, body.clientRequestId)),
    ).toHaveLength(1);
    expect((await request(path(), 'teacher', 'POST', { ...body, body: 'Edited' })).status).toBe(
      409,
    );
    const list = await (await request(path())).json();
    expect(list.items[0]).toMatchObject({
      id: body.clientRequestId,
      classId,
      studentId: studentId(),
      readAt: null,
    });
  });
  it('limits Teacher history and cursors to the current owned class, including previous-school records', async () => {
    const db = getDatabase().db;
    const [formerClass] = await db
      .insert(classes)
      .values({
        schoolId,
        teacherUserId: profiles.get('otherTeacher')!.id,
        name: `TEST former ${suffix}`,
        joinCode: randomUUID(),
      })
      .returning();
    const attempts = [];
    for (const historicalClass of [classId, formerClass!.id]) {
      const [pkg] = await db
        .insert(assessmentPackages)
        .values({
          familyCode: `TEST-HISTORY-${randomUUID()}`,
          packageVersion: 1,
          name: 'TEST history package',
          assessmentType: 'TRYOUT',
          isDemo: true,
        })
        .returning();
      const [attempt] = await db
        .insert(assessmentAttempts)
        .values({
          studentId: studentId(),
          packageId: pkg!.id,
          assessmentType: 'TRYOUT',
          classIdAtStart: historicalClass,
          status: 'SUBMITTED',
          startedAt: new Date(Date.now() - 1000),
          finishedAt: new Date(),
        })
        .returning();
      attempts.push(attempt!);
    }
    const historyPath = `classes/${classId}/students/${studentId()}/assessment-results`;
    const response = await request(historyPath);
    expect(response.status).toBe(200);
    expect(
      (await response.json()).records.map((record: { attemptId: string }) => record.attemptId),
    ).toEqual([attempts[0]!.id]);
    expect((await request(`${historyPath}?cursor=${attempts[1]!.id}`)).status).toBe(404);
  });
  it('scopes Student inbox and preserves the first read time on concurrent mark-read', async () => {
    const id = randomUUID();
    await request(path(), 'teacher', 'POST', { clientRequestId: id, body: 'TEST read' });
    expect((await request(`students/me/feedback/${id}/read`, 'otherStudent', 'POST')).status).toBe(
      404,
    );
    expect((await request('students/me/feedback', 'teacher')).status).toBe(403);
    expect((await (await request('students/me/feedback', 'otherStudent')).json()).items).toEqual(
      [],
    );
    const reads = await Promise.all(
      Array.from({ length: 6 }, async () =>
        (await request(`students/me/feedback/${id}/read`, 'student', 'POST')).json(),
      ),
    );
    expect(new Set(reads.map((r) => r.readAt)).size).toBe(1);
    const events = await getDatabase()
      .db.select()
      .from(analyticsOutbox)
      .where(eq(analyticsOutbox.entityId, id));
    expect(events.map((event) => event.eventName).sort()).toEqual([
      'feedback_read',
      'feedback_sent',
    ]);
    expect(events.every((event) => !JSON.stringify(event.payload).includes('TEST read'))).toBe(
      true,
    );
    const summary = await (await request('students/me/feedback/summary', 'student')).json();
    expect(summary.latest).toHaveLength(2);
    expect(summary.unreadCount).toBe(1);
    const page = await (await request('students/me/feedback?limit=1', 'student')).json();
    expect(page.items).toHaveLength(1);
    expect(page.nextOffset).toBe(1);
    expect(
      (await (await request('students/me/feedback?limit=1&offset=1', 'student')).json()).items[0]
        .id,
    ).not.toBe(page.items[0].id);
  });
  it('protects every Admin read route, validates filters and omits auth/email/join secrets', async () => {
    for (const route of [
      'admin/users',
      `admin/users/${studentId()}`,
      'admin/classes',
      `admin/classes/${classId}`,
    ]) {
      expect((await request(route, '')).status).toBe(401);
      for (const token of ['student', 'teacher', 'disabled'])
        expect((await request(route, token)).status).toBe(403);
      expect((await request(route, 'admin')).status).toBe(200);
    }
    const usersPage = await (
      await request(`admin/users?search=${suffix}&role=STUDENT&limit=1`, 'admin')
    ).json();
    expect(usersPage.items).toHaveLength(1);
    expect(usersPage.nextOffset).toBe(1);
    expect(Object.keys(usersPage.items[0]).sort()).toEqual([
      'createdAt',
      'displayName',
      'id',
      'role',
      'status',
    ]);
    const detail = await (await request(`admin/classes/${classId}`, 'admin')).json();
    expect(detail.studentCount).toBe(1);
    expect(detail.joinCode).toBeUndefined();
    expect(
      (
        await (await request(`admin/classes?schoolId=${schoolId}&state=active`, 'admin')).json()
      ).items.map((r: { id: string }) => r.id),
    ).toContain(classId);
    expect((await request('admin/users?role=OWNER', 'admin')).status).toBe(400);
    expect((await request('admin/classes?schoolId=bad', 'admin')).status).toBe(400);
    expect((await request(`admin/users/${randomUUID()}`, 'admin')).status).toBe(404);
  });
});
