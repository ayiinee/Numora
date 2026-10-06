import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  classMemberships,
  classes,
  closeDatabaseConnection,
  getDatabase,
  teacherSchoolMemberships,
  users,
  auditLogs,
} from '@tka/database';
import { eq, sql } from 'drizzle-orm';
import { AdminOperationsService } from './operations.service';
import { AdminStructuresService } from './structures.service';
import { SchoolsService } from '../schools/schools.service';
import { AdminService } from './admin.service';
import { AdminAnalyticsService } from './analytics.service';
import type { IdentityService } from '../identity/identity.service';
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('admin operations readers and limited structure in PostgreSQL', () => {
  afterAll(closeDatabaseConnection);
  it('preserves address, credential actor, membership history and classes without active teachers', async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { db } = getDatabase(),
      suffix = randomUUID();
    const [admin] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'ADMIN',
        adminRole: 'OPERATIONS',
        displayName: 'Ops',
        email: `ops-${suffix}@example.test`,
      })
      .returning();
    const [teacher] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'TEACHER',
        displayName: `Teacher ${suffix}`,
        email: `teacher-${suffix}@example.test`,
      })
      .returning();
    const [student] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'STUDENT',
        displayName: `Student ${suffix}`,
        email: `student-${suffix}@example.test`,
      })
      .returning();
    const identity = {
      me: async (token?: string) =>
        token === 'teacher'
          ? { id: teacher!.id, role: 'TEACHER', status: 'ACTIVE' }
          : { id: admin!.id, role: 'ADMIN', adminRole: 'OPERATIONS', status: 'ACTIVE' },
    } as unknown as IdentityService;
    const schoolService = new SchoolsService(identity),
      operations = new AdminOperationsService(),
      limited = new AdminStructuresService(operations);
    const school = await schoolService.createSchool(
      'ops',
      `OPS-${suffix.slice(0, 8)}`,
      `School ${suffix}`,
      'Jl. Test 10',
    );
    expect(
      (await schoolService.updateSchool('ops', school.id, { address: 'Jl. Test 20' })).address,
    ).toBe('Jl. Test 20');
    const credential = await schoolService.issueToken('ops', school.id);
    await schoolService.verifyTeacher('teacher', school.id, credential.token);
    const tokens = await schoolService.listTokens('ops', school.id);
    expect(tokens.items[0]).toMatchObject({
      usedByUserId: teacher!.id,
      usedByName: teacher!.displayName,
      status: 'USED',
    });
    expect(JSON.stringify(tokens)).not.toContain(credential.token);
    const [classroom] = await db
      .insert(classes)
      .values({
        schoolId: school.id,
        teacherUserId: teacher!.id,
        name: `Class ${suffix}`,
        joinCode: randomUUID(),
      })
      .returning();
    const [membership] = await db
      .insert(classMemberships)
      .values({ classId: classroom!.id, studentUserId: student!.id })
      .returning();
    expect(await operations.user(student!.id, 'OPERATIONS')).toMatchObject({
      email: student!.email,
      affiliation: 'SCHOOL',
    });
    expect(
      (await operations.memberships(student!.id, 'OPERATIONS', { limit: 20, offset: 0 })).items[0],
    ).toMatchObject({ classId: classroom!.id, schoolId: school.id, active: true });
    expect(
      (
        await operations.users(
          { limit: 1, offset: 0, affiliation: 'SCHOOL', search: suffix, schoolId: school.id },
          'OPERATIONS',
        )
      ).items,
    ).toHaveLength(1);
    expect(
      (await operations.roster(classroom!.id, { limit: 1, offset: 0, state: 'active' })).items[0],
    ).toMatchObject({ id: student!.id, membershipId: membership!.id });
    expect((await operations.class(classroom!.id)).teacherActive).toBe(true);
    await db
      .update(teacherSchoolMemberships)
      .set({ endedAt: sql`clock_timestamp()` })
      .where(eq(teacherSchoolMemberships.teacherUserId, teacher!.id));
    expect(await operations.class(classroom!.id)).toMatchObject({
      id: classroom!.id,
      teacherId: null,
      teacherActive: false,
    });
    expect(await operations.user(teacher!.id, 'OPERATIONS')).toMatchObject({
      teacherVerified: false,
    });
    const limitedClasses = await limited.classes({ limit: 20, offset: 0, schoolId: school.id });
    const action = `test-report-${suffix}`;
    await db.insert(auditLogs).values([
      { actorUserId: student!.id, action, entityType: 'question_report', entityId: randomUUID() },
      { actorUserId: teacher!.id, action, entityType: 'video_report', entityId: randomUUID() },
      { actorUserId: admin!.id, action, entityType: 'question_report', entityId: randomUUID() },
    ]);
    const adminService = new AdminService();
    const contentAudit = await adminService.audit(
      { limit: 20, offset: 0, action },
      'CONTENT_DATA_MODERATION',
    );
    expect(contentAudit.items).toHaveLength(3);
    expect(contentAudit.items.filter((row) => row.actorUserId === null)).toHaveLength(2);
    expect(contentAudit.items.some((row) => row.actorUserId === admin!.id)).toBe(true);
    expect(
      (
        await adminService.audit(
          { limit: 20, offset: 0, action, actorId: student!.id },
          'CONTENT_DATA_MODERATION',
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await adminService.audit(
          { limit: 20, offset: 0, action, actorId: student!.id },
          'SUPER_ADMIN',
        )
      ).items,
    ).toHaveLength(1);
    expect(
      (await adminService.audit({ limit: 20, offset: 0, action }, 'OPERATIONS')).items,
    ).toEqual([]);
    expect(limitedClasses.items).toHaveLength(1);
    expect(Object.keys(limitedClasses.items[0]!).sort()).toEqual(
      [
        'id',
        'name',
        'schoolId',
        'schoolName',
        'studentCount',
        'teacherActive',
        'createdAt',
        'archivedAt',
      ].sort(),
    );
    const limitedSchools = await limited.schools({ limit: 20, offset: 0, search: suffix });
    expect(limitedSchools.items[0]).toMatchObject({
      id: school.id,
      activeTeacherCount: 0,
      availableCredentialCount: 0,
      usedCredentialCount: 1,
      expiredCredentialCount: 0,
      revokedCredentialCount: 0,
      studentCount: 1,
    });
    expect(Object.keys(limitedSchools.items[0]!).sort()).toEqual(
      [
        'id',
        'code',
        'name',
        'status',
        'classCount',
        'activeTeacherCount',
        'availableCredentialCount',
        'usedCredentialCount',
        'expiredCredentialCount',
        'revokedCredentialCount',
        'studentCount',
      ].sort(),
    );
    expect(JSON.stringify({ limitedClasses, limitedSchools })).not.toContain(student!.id);
    expect(JSON.stringify({ limitedClasses, limitedSchools })).not.toContain(teacher!.id);
    expect(JSON.stringify(limitedSchools)).not.toContain(credential.token);
    for (const role of ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const) {
      const aggregate = await new AdminAnalyticsService().summary(role);
      expect(aggregate.metrics.every((metric) => metric.unavailableReason === null)).toBe(true);
      expect(
        aggregate.metrics.find((metric) => metric.key === 'students')!.value,
      ).toBeGreaterThanOrEqual(1);
      expect(aggregate.metrics.some((metric) => metric.key === 'failedIrtRequests')).toBe(
        role !== 'OPERATIONS',
      );
    }
    const available = await schoolService.issueToken('ops', school.id);
    const revoked = await schoolService.issueToken('ops', school.id);
    await schoolService.revokeToken('ops', school.id, revoked.id);
    expect(
      (await limited.schools({ limit: 20, offset: 0, search: suffix })).items[0],
    ).toMatchObject({
      availableCredentialCount: 1,
      usedCredentialCount: 1,
      revokedCredentialCount: 1,
    });
    expect(
      JSON.stringify(await limited.schools({ limit: 20, offset: 0, search: suffix })),
    ).not.toContain(available.token);
    const [unownedClass] = await db
      .insert(classes)
      .values({
        schoolId: school.id,
        teacherUserId: null,
        name: `Unowned ${suffix}`,
        joinCode: randomUUID(),
      })
      .returning();
    expect(await operations.class(unownedClass!.id)).toMatchObject({
      teacherId: null,
      teacherName: null,
      teacherActive: false,
    });
    const [secondMembership] = await db
      .insert(classMemberships)
      .values({ classId: unownedClass!.id, studentUserId: student!.id })
      .returning();
    expect(
      (
        await operations.memberships(student!.id, 'OPERATIONS', { limit: 20, offset: 0 })
      ).items.filter((row) => row.active),
    ).toHaveLength(2);
    await db
      .update(classMemberships)
      .set({ leftAt: sql`clock_timestamp()` })
      .where(eq(classMemberships.id, membership!.id));
    expect(await operations.user(student!.id, 'OPERATIONS')).toMatchObject({
      affiliation: 'SCHOOL',
    });
    await db
      .update(classMemberships)
      .set({ leftAt: sql`clock_timestamp()` })
      .where(eq(classMemberships.id, secondMembership!.id));
    expect(await operations.user(student!.id, 'OPERATIONS')).toMatchObject({
      affiliation: 'MANDIRI',
    });
    expect(
      (
        await operations.memberships(student!.id, 'OPERATIONS', { limit: 20, offset: 0 })
      ).items.some((row) => row.active),
    ).toBe(false);
    expect(
      (await operations.roster(classroom!.id, { limit: 20, offset: 0, state: 'former' })).items,
    ).toHaveLength(1);
  });
});
