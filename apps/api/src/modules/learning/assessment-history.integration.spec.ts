import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { ForbiddenException, UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  assessmentAttempts,
  assessmentPackages,
  chapters,
  classes,
  schools,
  closeDatabaseConnection,
  getDatabase,
  levels,
  scoringPolicyVersions,
  subchapters,
  users,
} from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { LearningModule } from './learning.module';
import { AssessmentHistoryService } from './assessment-history.service';

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration('Assessment history PostgreSQL and HTTP boundary', () => {
  let app: INestApplication;
  let base: string;
  let history: AssessmentHistoryService;
  let studentId: string;
  let strangerId: string;
  let levelId: string;
  let otherLevelId: string;
  let chapterId: string;
  let subchapterId: string;
  let drillPackageId: string;
  let otherPackageId: string;
  let tryoutPackageId: string;
  let pretestPackageId: string;
  let policyId: string;
  const finishedAt = new Date('2026-10-01T12:00:00Z');
  const startedAt = new Date('2026-10-01T11:00:00Z');

  beforeAll(async () => {
    if (
      !testUrl ||
      process.env.NODE_ENV !== 'test' ||
      !['127.0.0.1', 'localhost'].includes(new URL(testUrl).hostname)
    )
      throw new Error('History tests require isolated localhost PostgreSQL and NODE_ENV=test.');
    process.env.DATABASE_URL = testUrl;
    const { db } = getDatabase();
    const suffix = randomUUID();
    const insertedUsers = await db
      .insert(users)
      .values(
        [1, 2].map((n) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: 'History fixture',
          email: `history-${n}-${suffix}@example.test`,
        })),
      )
      .returning({ id: users.id });
    studentId = insertedUsers[0]!.id;
    strangerId = insertedUsers[1]!.id;
    chapterId = (
      await db
        .insert(chapters)
        .values({
          code: `H-${suffix}`, slug: (`H-${suffix}`).toLowerCase(),
          name: 'History chapter',
          displayOrder: parseInt(suffix.slice(0, 8), 16) % 2_000_000_000,
          status: 'READY',
        })
        .returning({ id: chapters.id })
    )[0]!.id;
    subchapterId = (
      await db
        .insert(subchapters)
        .values({
          chapterId,
          code: `S-${suffix}`, slug: (`S-${suffix}`).toLowerCase(),
          name: 'History subchapter',
          displayOrder: 1,
          status: 'READY',
        })
        .returning({ id: subchapters.id })
    )[0]!.id;
    const insertedLevels = await db
      .insert(levels)
      .values([1, 2].map((n) => ({ subchapterId, levelNumber: n, status: 'READY' as const })))
      .returning({ id: levels.id });
    levelId = insertedLevels[0]!.id;
    otherLevelId = insertedLevels[1]!.id;
    policyId = (
      await db
        .insert(scoringPolicyVersions)
        .values({
          policyCode: `HISTORY_TEST_${suffix}`,
          version: 1,
          configuration: { fixture: true },
        })
        .returning({ id: scoringPolicyVersions.id })
    )[0]!.id;
    const packages = await db
      .insert(assessmentPackages)
      .values(
        [
          {
            familyCode: `H1-${suffix}`,
            name: 'History Drill',
            assessmentType: 'DRILL' as const,
            levelId,
          },
          {
            familyCode: `H2-${suffix}`,
            name: 'Other level',
            assessmentType: 'DRILL' as const,
            levelId: otherLevelId,
          },
          { familyCode: `HT-${suffix}`, name: 'History Tryout', assessmentType: 'TRYOUT' as const },
          {
            familyCode: `HP-${suffix}`,
            name: 'History Pretest',
            assessmentType: 'PRETEST' as const,
          },
        ].map((p) => ({
          ...p,
          chapterId,
          packageVersion: 1,
          isDemo: true,
          scoringPolicyVersionId: policyId,
        })),
      )
      .returning({ id: assessmentPackages.id });
    drillPackageId = packages[0]!.id;
    otherPackageId = packages[1]!.id;
    tryoutPackageId = packages[2]!.id;
    pretestPackageId = packages[3]!.id;
    const identity = {
      me: async (authorization?: string) => {
        const token = authorization?.replace(/^Bearer /, '');
        if (!token) throw new UnauthorizedException();
        if (token === 'disabled') throw new ForbiddenException();
        if (!['student', 'stranger', 'teacher', 'admin'].includes(token))
          throw new UnauthorizedException();
        return {
          id: token === 'stranger' ? strangerId : studentId,
          role: token === 'teacher' ? 'TEACHER' : token === 'admin' ? 'ADMIN' : 'STUDENT',
        };
      },
    } as unknown as IdentityService;
    const module = await Test.createTestingModule({ imports: [LearningModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/students/me/assessment-results`;
    history = module.get(AssessmentHistoryService);
  }, 20000);

  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
  });

  async function addAttempt(overrides: Partial<typeof assessmentAttempts.$inferInsert> = {}) {
    const [row] = await getDatabase()
      .db.insert(assessmentAttempts)
      .values({
        studentId,
        packageId: drillPackageId,
        assessmentType: 'DRILL',
        chapterIdAtStart: chapterId,
        levelIdAtStart: levelId,
        scoringPolicyVersionId: policyId,
        status: 'GRADED',
        startedAt,
        finishedAt,
        score0To100: '80',
        ...overrides,
      })
      .returning({ id: assessmentAttempts.id });
    return row!.id;
  }
  const request = (query = '', token?: string) =>
    fetch(`${base}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('enforces authentication, role and UUID validation through HTTP', async () => {
    expect((await request()).status).toBe(401);
    for (const role of ['teacher', 'admin', 'disabled'])
      expect((await request('', role)).status).toBe(403);
    for (const query of ['?cursor=invalid', '?levelId=invalid'])
      expect((await request(query, 'student')).status).toBe(400);
    expect(await (await request('', 'stranger')).json()).toEqual({ records: [], nextCursor: null });
  });

  it('preserves zero scores, pinned level context and pending rewards without exposing unreleased Tryout', async () => {
    const zeroId = await addAttempt({ score0To100: '0' });
    const tryoutId = await addAttempt({
      packageId: tryoutPackageId,
      assessmentType: 'TRYOUT',
      levelIdAtStart: null,
      score0To100: '99',
    });
    const rows = (await history.list('Bearer student')).records;
    expect(rows.find((r) => r.attemptId === zeroId)).toMatchObject({
      score: 0,
      levelId,
      levelTitle: 'Level 1',
      chapterId,
      subchapterId,
      subchapterTitle: 'History subchapter',
      xpState: 'pending',
      starsState: 'pending',
    });
    expect(rows.find((r) => r.attemptId === tryoutId)).toMatchObject({
      score: null,
      resultState: 'waitingIrt',
      levelId: null,
      starsState: 'notApplicable',
    });
    expect(JSON.stringify(rows)).not.toMatch(/answerKey|correctOptionId|explanation|rawPoints/);
    const saved = await getDatabase()
      .db.select({ score: assessmentAttempts.score0To100 })
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, tryoutId));
    expect(saved[0]!.score).toBe('99.00');
    const pretestId = await addAttempt({
      packageId: pretestPackageId,
      assessmentType: 'PRETEST',
      levelIdAtStart: null,
    });
    expect(
      (await history.list('Bearer student')).records.find((r) => r.attemptId === pretestId),
    ).toMatchObject({ levelId: null, xpState: 'notApplicable', starsState: 'notApplicable' });
  });

  it('rejects foreign, non-visible and wrong-level cursors instead of silently skipping records', async () => {
    const foreign = await addAttempt({ studentId: strangerId });
    const cancelled = await addAttempt({ status: 'CANCELLED' });
    const submittedDrill = await addAttempt({ status: 'SUBMITTED' });
    const other = await addAttempt({ packageId: otherPackageId, levelIdAtStart: otherLevelId });
    for (const cursor of [foreign, cancelled, submittedDrill, randomUUID()]) {
      const response = await request(`?cursor=${cursor}`, 'student');
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'CURSOR_NOT_FOUND' });
    }
    expect((await request(`?cursor=${other}&levelId=${levelId}`, 'student')).status).toBe(404);
    expect(
      (await history.list('Bearer student', undefined, otherLevelId)).records.map(
        (r) => r.attemptId,
      ),
    ).toEqual([other]);
  });

  it('paginates equal and sub-millisecond PostgreSQL timestamps without omissions or duplicates', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 43; n++) {
      const id = await addAttempt({
        packageId: otherPackageId,
        levelIdAtStart: otherLevelId,
        status: 'IN_PROGRESS',
      });
      ids.push(id);
      await getDatabase()
        .db.update(assessmentAttempts)
        .set({
          status: 'GRADED',
          finishedAt: sql`'2026-10-01T12:00:01.123000Z'::timestamptz + ${n % 3} * interval '1 microsecond'`,
        })
        .where(eq(assessmentAttempts.id, id));
    }
    const expected = await getDatabase()
      .db.select({ id: assessmentAttempts.id })
      .from(assessmentAttempts)
      .where(
        sql`${assessmentAttempts.studentId} = ${studentId} and ${assessmentAttempts.levelIdAtStart} = ${otherLevelId} and ${assessmentAttempts.status} = 'GRADED'`,
      )
      .orderBy(sql`${assessmentAttempts.finishedAt} desc`, sql`${assessmentAttempts.id} desc`);
    const actual: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await history.list('Bearer student', cursor, otherLevelId);
      expect(page.records.length).toBeLessThanOrEqual(20);
      actual.push(...page.records.map((r) => r.attemptId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(actual).toEqual(expected.map((r) => r.id));
    expect(new Set(actual).size).toBe(actual.length);
    expect(ids.every((id) => actual.includes(id))).toBe(true);
  });

  it('intersects historical class and level for rows and precise cursors without leaking another class', async () => {
    const db = getDatabase().db;
    const [teacher] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'TEACHER',
        displayName: 'History teacher fixture',
        email: `history-teacher-${randomUUID()}@example.test`,
      })
      .returning();
    const [school] = await db
      .insert(schools)
      .values({
        code: `H-${randomUUID()}`,
        name: 'History school fixture',
      })
      .returning();
    const classRows = await db
      .insert(classes)
      .values(
        [1, 2].map((n) => ({
          schoolId: school!.id,
          teacherUserId: teacher!.id,
          name: `History class ${n}`,
          joinCode: randomUUID(),
        })),
      )
      .returning();
    const classId = classRows[0]!.id;
    const foreignClassId = classRows[1]!.id;
    const expected: string[] = [];
    for (let n = 0; n < 25; n++) {
      const id = await addAttempt({ classIdAtStart: classId, status: 'IN_PROGRESS' });
      expected.push(id);
      await db
        .update(assessmentAttempts)
        .set({
          status: 'GRADED',
          finishedAt: sql`'2026-10-01T12:00:02.123000Z'::timestamptz + ${n % 3} * interval '1 microsecond'`,
        })
        .where(eq(assessmentAttempts.id, id));
    }
    const foreign = await addAttempt({ classIdAtStart: foreignClassId });
    const differentLevel = await addAttempt({
      classIdAtStart: classId,
      packageId: otherPackageId,
      levelIdAtStart: otherLevelId,
    });
    const mandiri = await addAttempt({ classIdAtStart: null });
    const cancelled = await addAttempt({ classIdAtStart: classId, status: 'CANCELLED' });
    for (const cursor of [foreign, differentLevel, mandiri, cancelled]) {
      await expect(
        history.listForStudent(studentId, { cursor, classId, levelId }),
      ).rejects.toMatchObject({
        response: { code: 'CURSOR_NOT_FOUND' },
      });
    }
    const actual: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await history.listForStudent(studentId, { cursor, classId, levelId });
      actual.push(...page.records.map((r) => r.attemptId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(actual).toHaveLength(expected.length);
    expect(new Set(actual).size).toBe(expected.length);
    expect([...actual].sort()).toEqual([...expected].sort());
    expect(
      (await history.listForStudent(studentId, { classId: foreignClassId, levelId })).records.map(
        (r) => r.attemptId,
      ),
    ).toEqual([foreign]);
  });

  it('retains finished records and stored scores after source taxonomy/package archive', async () => {
    const before = await history.list('Bearer student', undefined, levelId);
    await getDatabase()
      .db.update(assessmentPackages)
      .set({ status: 'ARCHIVED' })
      .where(eq(assessmentPackages.id, drillPackageId));
    await getDatabase().db.update(levels).set({ status: 'ARCHIVED' }).where(eq(levels.id, levelId));
    expect(await history.list('Bearer student', undefined, levelId)).toEqual(before);
  });
});
