import { randomUUID } from 'node:crypto';
import { connect, createServer, type Socket } from 'node:net';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import {
  assessmentAttempts,
  assessmentPackages,
  chapters,
  closeDatabaseConnection,
  getDatabase,
  levelProgress,
  levels,
  scoringPolicyVersions,
  subchapters,
  users,
} from '@tka/database';
import { seedLifecycleDemo } from '@tka/database/testing';
import type { IdentityService } from '../identity/identity.service';
import { LearningCatalogService } from './learning-catalog.service';
import { MaterialsService } from './materials.service';
import { PretestService } from './pretest.service';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  'Learning read payloads on isolated runtime PostgreSQL',
  { timeout: 60000 },
  () => {
    const suffix = randomUUID().replaceAll('-', '');
    const database = `numora_test_learning_reads_${suffix}`;
    const login = `learning_read_${suffix}`;
    const previousUrl = process.env.DATABASE_URL;
    const previousSynthetic = process.env.ALLOW_SYNTHETIC_CONTENT;
    let admin: ReturnType<typeof postgres>, owner: ReturnType<typeof postgres>;
    let catalog: LearningCatalogService, materials: MaterialsService, pretest: PretestService;
    let fixture: Awaited<ReturnType<typeof seedLifecycleDemo>>;
    let targetSub: string,
      secondSub: string,
      emptySub: string,
      hiddenSub: string,
      hiddenChapterSub: string;
    let attemptId: string;
    let initialEmpty: Awaited<ReturnType<LearningCatalogService['progress']>>;
    const actors = new Map<string, string>();

    async function transfer<T>(run: () => Promise<T>) {
      await closeDatabaseConnection();
      const runtimeUrl = process.env.DATABASE_URL!;
      const previousPool = process.env.DB_POOL_MAX;
      process.env.DB_POOL_MAX = '1';
      const url = new URL(runtimeUrl);
      const host = url.hostname,
        port = Number(url.port || 5432);
      const sockets = new Set<Socket>();
      let bytes = 0;
      const proxy = createServer((downstream) => {
        const upstream = connect(port, host);
        for (const socket of [upstream, downstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => {
            upstream.destroy();
            downstream.destroy();
          });
        }
        upstream.on('data', (chunk) => {
          bytes += chunk.length;
        });
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      try {
        await new Promise<void>((done, fail) =>
          proxy.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = proxy.address();
        if (!address || typeof address === 'string')
          throw new Error('TEST ONLY proxy missing port');
        url.hostname = '127.0.0.1';
        url.port = String(address.port);
        process.env.DATABASE_URL = url.toString();
        await getDatabase().client`select 1`;
        bytes = 0;
        const value = await run();
        return { value, responseBytes: bytes };
      } finally {
        await closeDatabaseConnection();
        process.env.DATABASE_URL = runtimeUrl;
        if (previousPool === undefined) delete process.env.DB_POOL_MAX;
        else process.env.DB_POOL_MAX = previousPool;
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => proxy.close(() => done()));
      }
    }

    beforeAll(async () => {
      if (
        process.env.NODE_ENV !== 'test' ||
        !['localhost', '127.0.0.1'].includes(new URL(testUrl!).hostname)
      )
        throw new Error('Dedicated localhost PostgreSQL required.');
      await closeDatabaseConnection();
      admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      const url = new URL(testUrl!);
      url.pathname = '/' + database;
      owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await migrate(drizzle(owner), {
        migrationsFolder: resolve('../../packages/database/drizzle'),
      });
      const password = randomUUID();
      await admin.unsafe(
        `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      await admin.unsafe(`GRANT numora_main_runtime TO "${login}"`);
      url.username = login;
      url.password = password;
      process.env.DATABASE_URL = url.toString();
      process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
      // Run-owned database only: start with no published curriculum, preserving bootstrap rows.
      await owner`UPDATE assessment_packages SET status='CLOSED' WHERE status='PUBLISHED'`;
      await owner`UPDATE levels SET status='DRAFT'`;
      for (const name of ['student', 'other', 'empty', 'teacher', 'inactive']) {
        const [user] = await getDatabase()
          .db.insert(users)
          .values({
            authUserId: randomUUID(),
            role: name === 'teacher' ? 'TEACHER' : 'STUDENT',
            displayName: 'TEST ONLY ' + name,
            email: `${suffix}-${name}@example.test`,
          })
          .returning({ id: users.id });
        actors.set(name, user!.id);
      }
      const identity = {
        me: async (auth?: string) => {
          if (!auth || !actors.has(auth)) throw new UnauthorizedException();
          return {
            id: actors.get(auth)!,
            role: auth === 'teacher' ? 'TEACHER' : 'STUDENT',
            status: auth === 'inactive' ? 'INACTIVE' : 'ACTIVE',
          };
        },
      } as unknown as IdentityService;
      catalog = new LearningCatalogService(identity);
      materials = new MaterialsService(identity);
      pretest = new PretestService(identity);
      initialEmpty = await catalog.progress('student');
      fixture = await seedLifecycleDemo(randomUUID());
      const db = getDatabase().db;
      const subs = await db
        .select({ id: subchapters.id })
        .from(subchapters)
        .where(eq(subchapters.chapterId, fixture.chapterId))
        .orderBy(asc(subchapters.displayOrder));
      targetSub = subs[0]!.id;
      secondSub = subs[1]!.id;
      const targetLevels = await db
        .select()
        .from(levels)
        .where(eq(levels.subchapterId, targetSub))
        .orderBy(asc(levels.levelNumber));
      const secondary = await db
        .select()
        .from(levels)
        .where(eq(levels.subchapterId, secondSub))
        .orderBy(asc(levels.levelNumber));
      const archivedLevel = secondary[4]!.id;
      await db.update(levels).set({ status: 'ARCHIVED' }).where(eq(levels.id, archivedLevel));
      const [noiseChapter, hiddenChapter] = await db
        .insert(chapters)
        .values([
          {
            code: `NOISE-${suffix}`,
            slug: `noise-${suffix}`,
            name: 'TEST ONLY unrelated',
            displayOrder: 2000000000,
            status: 'READY' as const,
          },
          {
            code: `HIDDEN-${suffix}`,
            slug: `hidden-${suffix}`,
            name: 'TEST ONLY hidden',
            displayOrder: 2000000001,
            status: 'ARCHIVED' as const,
          },
        ])
        .returning();
      const noiseSubs = await db
        .insert(subchapters)
        .values(
          Array.from({ length: 40 }, (_, index) => ({
            chapterId: noiseChapter!.id,
            code: `NOISE-${suffix}-${index}`,
            slug: `noise-${suffix}-${index}`,
            name: 'TEST ONLY noise ' + index,
            displayOrder: index + 1,
            status: 'READY' as const,
          })),
        )
        .returning();
      const extra = await db
        .insert(subchapters)
        .values([
          {
            chapterId: fixture.chapterId,
            code: `EMPTY-${suffix}`,
            slug: `empty-${suffix}`,
            name: 'TEST ONLY empty',
            displayOrder: 3,
            status: 'READY' as const,
          },
          {
            chapterId: noiseChapter!.id,
            code: `ARCHIVED-${suffix}`,
            slug: `archived-${suffix}`,
            name: 'TEST ONLY archived',
            displayOrder: 41,
            status: 'ARCHIVED' as const,
          },
          {
            chapterId: hiddenChapter!.id,
            code: `HIDDEN-SUB-${suffix}`,
            slug: `hidden-sub-${suffix}`,
            name: 'TEST ONLY hidden parent',
            displayOrder: 1,
            status: 'READY' as const,
          },
        ])
        .returning();
      emptySub = extra[0]!.id;
      hiddenSub = extra[1]!.id;
      hiddenChapterSub = extra[2]!.id;
      const noiseLevels = await db
        .insert(levels)
        .values(
          noiseSubs.flatMap((sub) =>
            [1, 2, 3, 4, 5].map((levelNumber) => ({
              subchapterId: sub.id,
              levelNumber,
              status: 'READY' as const,
            })),
          ),
        )
        .returning();
      const hiddenLevels = await db
        .insert(levels)
        .values([
          { subchapterId: emptySub, levelNumber: 1, status: 'DRAFT' },
          { subchapterId: hiddenSub, levelNumber: 1, status: 'READY' },
          { subchapterId: hiddenChapterSub, levelNumber: 1, status: 'READY' },
        ])
        .returning();
      const stamp = new Date('2026-01-01T00:00:00Z');
      await db.insert(levelProgress).values([
        ...[...noiseLevels, ...hiddenLevels, secondary[4]!].map((level) => ({
          studentId: actors.get('student')!,
          levelId: level.id,
          unlockedAt: stamp,
          completedAt: stamp,
          latestScore: 33.33,
          bestScore: 50.5,
        })),
        {
          studentId: actors.get('student')!,
          levelId: targetLevels[1]!.id,
          unlockedAt: stamp,
          completedAt: stamp,
          latestScore: 80.25,
          bestScore: 95.5,
          latestStars: 2,
          bestStars: 3,
        },
        { studentId: actors.get('student')!, levelId: targetLevels[2]!.id, unlockedAt: stamp },
        { studentId: actors.get('student')!, levelId: targetLevels[3]!.id, bestScore: 0 },
        { studentId: actors.get('empty')!, levelId: targetLevels[3]!.id, bestScore: 0 },
        {
          studentId: actors.get('other')!,
          levelId: targetLevels[0]!.id,
          unlockedAt: stamp,
          completedAt: stamp,
          latestScore: 99,
          bestScore: 99,
        },
      ]);
      const [policy] = await db
        .select({ id: scoringPolicyVersions.id })
        .from(scoringPolicyVersions)
        .where(
          and(
            eq(scoringPolicyVersions.policyCode, 'DRILL_PRD_V06'),
            eq(scoringPolicyVersions.version, 1),
          ),
        );
      for (const [index, data] of [
        {
          level: targetLevels[1]!,
          student: 'student',
          status: 'GRADED' as const,
          score: '80.25',
          day: 2,
        },
        {
          level: secondary[4]!,
          student: 'student',
          status: 'GRADED' as const,
          score: '61.75',
          day: 3,
        },
        {
          level: targetLevels[0]!,
          student: 'other',
          status: 'GRADED' as const,
          score: '99',
          day: 4,
        },
        {
          level: targetLevels[2]!,
          student: 'student',
          status: 'IN_PROGRESS' as const,
          score: null,
          day: 1,
        },
        {
          level: noiseLevels[0]!,
          student: 'student',
          status: 'IN_PROGRESS' as const,
          score: null,
          day: 1,
        },
      ].entries()) {
        const chapterId =
          data.level.subchapterId === noiseSubs[0]!.id ? noiseChapter!.id : fixture.chapterId;
        const [pack] = await db
          .insert(assessmentPackages)
          .values({
            familyCode: `READ-${suffix}-${index}`,
            packageVersion: 1,
            name: 'TEST ONLY read state',
            assessmentType: 'DRILL',
            chapterId,
            levelId: data.level.id,
            isDemo: true,
            scoringPolicyVersionId: policy!.id,
            status: data.level.id === archivedLevel ? 'CLOSED' : 'PUBLISHED',
          })
          .returning({ id: assessmentPackages.id });
        await db.insert(assessmentAttempts).values({
          studentId: actors.get(data.student)!,
          packageId: pack!.id,
          assessmentType: 'DRILL',
          chapterIdAtStart: chapterId,
          levelIdAtStart: data.level.id,
          scoringPolicyVersionId: policy!.id,
          status: data.status,
          score0To100: data.score,
          startedAt: new Date(`2026-01-0${data.day}T00:00:00Z`),
          finishedAt: data.status === 'GRADED' ? new Date(`2026-01-0${data.day}T00:01:00Z`) : null,
        });
      }
    }, 120000);

    afterAll(async () => {
      await closeDatabaseConnection();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (previousSynthetic === undefined) delete process.env.ALLOW_SYNTHETIC_CONTENT;
      else process.env.ALLOW_SYNTHETIC_CONTENT = previousSynthetic;
      await owner?.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
        await admin.unsafe(`DROP ROLE IF EXISTS "${login}"`);
        await admin.end();
      }
    }, 60000);

    it('counts only the visible hierarchy, preserves archived latest scores and isolates students', async () => {
      expect(initialEmpty).toEqual({ completedLevels: 0, totalLevels: 0, latestScore: null });
      expect(await catalog.progress('student')).toEqual({
        completedLevels: 201,
        totalLevels: 209,
        latestScore: 61.75,
      });
      expect(await catalog.progress('other')).toEqual({
        completedLevels: 1,
        totalLevels: 209,
        latestScore: 99,
      });
      expect(await catalog.progress('empty')).toEqual({
        completedLevels: 0,
        totalLevels: 209,
        latestScore: null,
      });
    });
    it('keeps per-level access, decimal scores and stars scoped to the requested subchapter', async () => {
      const page = await catalog.subchapter('student', targetSub);
      expect(page.levels.map((level) => level.status)).toEqual([
        'open',
        'completed',
        'inProgress',
        'locked',
        'locked',
      ]);
      expect(page.levels[1]).toMatchObject({
        latestScore: 80.25,
        bestScore: 95.5,
        latestStars: 2,
        bestStars: 3,
      });
      expect(page.levels[3]!.bestScore).toBe(0);
      expect((await catalog.subchapter('other', targetSub)).levels[1]).toMatchObject({
        status: 'locked',
        latestScore: null,
        bestScore: null,
      });
      expect((await catalog.subchapter('student', emptySub)).levels).toEqual([]);
      for (const id of [hiddenSub, hiddenChapterSub, randomUUID()])
        await expect(catalog.subchapter('student', id)).rejects.toMatchObject({ status: 404 });
    });
    it('keeps materials totals, nullable progress, archived-score history and continuation behavior', async () => {
      const page = await materials.list('student');
      const chapter = page.chapters.find((row) => row.id === fixture.chapterId)!;
      expect(chapter).toMatchObject({
        totalLevels: 9,
        completedLevels: 1,
        continueSubchapterId: secondSub,
      });
      expect(chapter.subchapters.find((row) => row.id === targetSub)).toMatchObject({
        totalLevels: 5,
        completedLevels: 1,
        availableLevels: 3,
        latestScore: 80.25,
        bestScore: 95.5,
      });
      expect(chapter.subchapters.find((row) => row.id === secondSub)).toMatchObject({
        totalLevels: 4,
        completedLevels: 0,
        availableLevels: 1,
        latestScore: 61.75,
        bestScore: null,
      });
      expect(chapter.subchapters.find((row) => row.id === emptySub)).toMatchObject({
        totalLevels: 0,
        completedLevels: 0,
        availableLevels: 0,
        latestScore: null,
        bestScore: null,
      });
      expect(page.recentChapterId).toBe(fixture.chapterId);
      const emptyStudent = await materials.list('empty');
      expect(
        emptyStudent.chapters
          .find((row) => row.id === fixture.chapterId)!
          .subchapters.find((row) => row.id === targetSub),
      ).toMatchObject({
        bestScore: 0,
        latestScore: null,
        completedLevels: 0,
        availableLevels: 1,
      });
      expect(
        page.chapters
          .flatMap((row) => row.subchapters)
          .some((row) => [hiddenSub, hiddenChapterSub].includes(row.id)),
      ).toBe(false);
    });
    it('rejects anonymous, teacher and inactive access before reading result content', async () => {
      for (const call of [
        () => catalog.progress(),
        () => materials.list(),
        () => pretest.result(undefined, randomUUID()),
      ])
        await expect(call()).rejects.toMatchObject({ status: 401 });
      for (const call of [
        () => catalog.progress('teacher'),
        () => materials.list('teacher'),
        () => pretest.result('teacher', randomUUID()),
        () => materials.list('inactive'),
        () => pretest.result('inactive', randomUUID()),
      ])
        await expect(call()).rejects.toMatchObject({ status: 403 });
    });
    it('counts pinned Pretest items after ownership/status checks and preserves terminal results', async () => {
      const started = await pretest.start('student', fixture.chapterId);
      attemptId = started.id;
      expect(started.questions).toHaveLength(20);
      await expect(pretest.result('other', attemptId)).rejects.toMatchObject({ status: 404 });
      await expect(pretest.result('student', attemptId)).rejects.toMatchObject({ status: 409 });
      const graded = await pretest.submit('student', attemptId);
      expect(graded).toMatchObject({
        questionCount: 20,
        correctCount: 0,
        score: 0,
        initialLevel: 1,
      });
      const legacy = await pretest.start('other', fixture.chapterId);
      await getDatabase()
        .db.update(assessmentAttempts)
        .set({ status: 'SUBMITTED', finishedAt: new Date() })
        .where(eq(assessmentAttempts.id, legacy.id));
      expect(await pretest.result('other', legacy.id)).toMatchObject({
        questionCount: 20,
        score: null,
        correctCount: null,
        initialLevel: null,
      });
      await getDatabase()
        .db.update(assessmentPackages)
        .set({ status: 'CLOSED' })
        .where(eq(assessmentPackages.id, fixture.pretestPackageId));
      expect(await pretest.result('student', attemptId)).toEqual(graded);
      expect(JSON.stringify(graded)).not.toMatch(/answerKey|explanation|optionsOrStatements/);
    });
    it('bounds PostgreSQL responses for result, global progress, subchapter and materials reads', async () => {
      const result = await transfer(() => pretest.result('student', attemptId));
      const progress = await transfer(() => catalog.progress('student'));
      const subchapter = await transfer(() => catalog.subchapter('student', targetSub));
      const material = await transfer(() => materials.list('student'));
      console.info(
        JSON.stringify({
          measurement: 'learning_read_response_bytes',
          levels: 209,
          resultBytes: result.responseBytes,
          progressBytes: progress.responseBytes,
          subchapterBytes: subchapter.responseBytes,
          materialsBytes: material.responseBytes,
        }),
      );
      expect(result.value.questionCount).toBe(20);
      expect(progress.value.completedLevels).toBe(201);
      // Generous regression bounds for these synthetic fixtures, not production SLOs.
      expect(result.responseBytes).toBeLessThan(6000);
      expect(progress.responseBytes).toBeLessThan(3000);
      expect(subchapter.responseBytes).toBeLessThan(6500);
      expect(material.responseBytes).toBeLessThan(45000);
    });
  },
);
