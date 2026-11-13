import { randomUUID } from 'node:crypto';
import { connect, createServer, type Socket } from 'node:net';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import {
  assessmentAttempts,
  assessmentBlueprintVersions,
  assessmentPackages,
  chapters,
  classMemberships,
  classes,
  closeDatabaseConnection,
  competencies,
  getDatabase,
  irtBatches,
  irtItemResults,
  levelProgress,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  schools,
  scoringPolicyVersions,
  subchapters,
  teacherSchoolMemberships,
  teacherVerificationTokens,
  users,
  xpLedger,
} from '@tka/database';
import type { IdentityService } from '../identity/identity.service';
import { ClassesService } from '../classes/classes.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { TryoutReleaseService } from './tryout-release.service';
import { TryoutService } from './tryout.service';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  'Tryout page batching and targeted monitoring on isolated runtime PostgreSQL',
  { timeout: 60000 },
  () => {
    const suffix = randomUUID().replaceAll('-', '');
    const database = `numora_test_metadata_${suffix}`,
      login = `metadata_${suffix}`;
    const previousUrl = process.env.DATABASE_URL,
      previousSynthetic = process.env.ALLOW_SYNTHETIC_CONTENT;
    let admin: ReturnType<typeof postgres>, owner: ReturnType<typeof postgres>;
    let service: TryoutService, roster: ClassesService, monitoring: MonitoringService;
    let readyId: string, readyAttemptId: string;
    let schoolId: string,
      classId: string,
      currentId: string,
      olderId: string,
      archivedId: string,
      foreignId: string;
    let blankId: string,
      noPolicyId: string,
      badPolicyId: string,
      mixedId: string,
      shortId: string,
      revisionId: string,
      mismatchId: string,
      noApprovalId: string,
      noBlueprintId: string;
    const actors = new Map<string, string>();
    const visible: { id: string; releaseAt: Date }[] = [];

    async function measured<T>(run: () => Promise<T>) {
      await closeDatabaseConnection();
      const originalUrl = process.env.DATABASE_URL!,
        originalPool = process.env.DB_POOL_MAX;
      const url = new URL(originalUrl),
        host = url.hostname,
        port = Number(url.port || 5432);
      process.env.DB_POOL_MAX = '1';
      const sockets = new Set<Socket>();
      let bytes = 0,
        queryCount = 0,
        counting = false,
        buffered: Buffer = Buffer.alloc(0);
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
          if (counting) bytes += chunk.length;
        });
        downstream.on('data', (chunk) => {
          if (!counting) return;
          buffered = Buffer.concat([buffered, chunk]);
          while (buffered.length >= 5) {
            const length = buffered.readInt32BE(1) + 1;
            if (buffered.length < length) break;
            if (buffered[0] === 69 || buffered[0] === 81) queryCount++; // Execute / simple Query.
            buffered = buffered.subarray(length);
          }
        });
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      try {
        await new Promise<void>((done, fail) =>
          proxy.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = proxy.address();
        if (!address || typeof address === 'string') throw new Error('TEST ONLY missing proxy');
        url.hostname = '127.0.0.1';
        url.port = String(address.port);
        process.env.DATABASE_URL = url.toString();
        await getDatabase().client`select 1`;
        counting = true;
        const value = await run();
        return { value, bytes, queryCount };
      } finally {
        counting = false;
        await closeDatabaseConnection();
        process.env.DATABASE_URL = originalUrl;
        if (originalPool === undefined) delete process.env.DB_POOL_MAX;
        else process.env.DB_POOL_MAX = originalPool;
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
      await owner`UPDATE assessment_packages SET status='ARCHIVED' WHERE status IN ('PUBLISHED','CLOSED')`;
      await owner`UPDATE levels SET status='DRAFT'`;
      const db = getDatabase().db;
      for (const name of ['student', 'other', 'teacher', 'outsider', 'unverified', 'admin']) {
        const [user] = await db
          .insert(users)
          .values({
            authUserId: randomUUID(),
            role: ['teacher', 'outsider', 'unverified'].includes(name)
              ? 'TEACHER'
              : name === 'admin'
                ? 'ADMIN'
                : 'STUDENT',
            displayName: 'TEST ' + name,
            email: `${name}-${suffix}@example.test`,
          })
          .returning({ id: users.id });
        actors.set(name, user!.id);
      }
      const identity = {
        me: async (auth?: string) => {
          if (!auth || !actors.has(auth)) throw new UnauthorizedException();
          const teacher = ['teacher', 'outsider', 'unverified'].includes(auth);
          return {
            id: actors.get(auth)!,
            role: teacher ? 'TEACHER' : auth === 'admin' ? 'ADMIN' : 'STUDENT',
            teacherVerified: teacher && auth !== 'unverified',
            status: 'ACTIVE',
          };
        },
      } as unknown as IdentityService;
      roster = new ClassesService(identity);
      monitoring = new MonitoringService(roster);
      service = new TryoutService(identity, new TryoutReleaseService());
      const [chapter] = await db
        .insert(chapters)
        .values({
          code: `META-${suffix}`,
          slug: `meta-${suffix}`,
          name: 'TEST metadata',
          displayOrder: 2000000000,
          status: 'READY',
        })
        .returning();
      const [sub] = await db
        .insert(subchapters)
        .values({
          chapterId: chapter!.id,
          code: `META-${suffix}`,
          slug: `meta-${suffix}`,
          name: 'TEST sub',
          displayOrder: 1,
          status: 'READY',
        })
        .returning();
      const [level] = await db
        .insert(levels)
        .values({ subchapterId: sub!.id, levelNumber: 1, status: 'READY' })
        .returning();
      const [competency] = await db
        .insert(competencies)
        .values({
          subchapterId: sub!.id,
          code: `META-${suffix}`,
          description: 'TEST ONLY',
          status: 'READY',
        })
        .returning();
      const versions: string[] = [];
      for (let i = 0; i < 32; i++) {
        const [family] = await db
          .insert(questions)
          .values({ primaryCompetencyId: competency!.id, status: 'READY' })
          .returning();
        const [variant] = await db
          .insert(questionVariants)
          .values({
            questionId: family!.id,
            variantCode: 'ORIGINAL',
            kind: 'ORIGINAL',
            origin: 'TEST',
          })
          .returning();
        const [version] = await db
          .insert(questionVersions)
          .values({
            variantId: variant!.id,
            versionNumber: 1,
            questionType: i === 30 ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' : 'SINGLE_CHOICE',
            stem: { text: 'TEST ONLY question' },
            optionsOrStatements: ['A', 'B', 'C'].map((id) => ({ id, content: { text: id } })),
            answerKey: i === 30 ? { optionIds: ['A', 'B'] } : { optionId: 'A' },
            explanation: { text: 'TEST ONLY explanation' },
            contentStatus: i === 31 ? 'REVISION' : 'READY',
            reviewedByUserId: actors.get('admin'),
            reviewedAt: new Date(),
            difficulty: 'EASY',
          })
          .returning();
        versions.push(version!.id);
      }
      const [blueprint] = await db
        .insert(assessmentBlueprintVersions)
        .values({
          code: `META-${suffix}`,
          version: 1,
          definition: { testOnly: true, assessmentType: 'TRYOUT', questionCount: 30 },
          digest: 'TEST ONLY',
          status: 'SEALED',
          approvedByUserId: actors.get('admin'),
          approvedAt: new Date(),
          approvalReference: 'TEST ONLY NOT CURRICULUM APPROVAL',
        })
        .returning();
      const [policy] = await db
        .select()
        .from(scoringPolicyVersions)
        .where(
          and(
            eq(scoringPolicyVersions.policyCode, 'TRYOUT_PRD_V06'),
            eq(scoringPolicyVersions.version, 1),
          ),
        );
      const [invalidPolicy] = await db
        .insert(scoringPolicyVersions)
        .values({
          policyCode: `TEST_META_${suffix}`,
          version: 1,
          configuration: { testOnly: true },
          status: 'DRAFT',
        })
        .returning();
      const now = Date.now();
      for (let index = 0; index < 26; index++) {
        const releaseAt = new Date(
          now - (index < 2 ? (index + 1) * 3600000 : (index === 4 ? 3 : index) * 86400000),
        );
        const status =
          index < 2 || index === 24
            ? 'PUBLISHED'
            : index === 22 || index === 23
              ? 'ARCHIVED'
              : index === 25
                ? 'DRAFT'
                : 'CLOSED';
        if (index === 24) releaseAt.setTime(now + 86400000);
        const [pack] = await db
          .insert(assessmentPackages)
          .values({
            familyCode: `META-${suffix}-${index}`,
            packageVersion: 1,
            name: 'TEST package ' + index,
            importSource: {
              sourceNamespace: `TEST_${suffix}`,
              sourceName: 'TEST ONLY',
              sourceReference: 'TEST ONLY '.repeat(400),
            },
            assessmentType: 'TRYOUT',
            chapterId: chapter!.id,
            scoringPolicyVersionId:
              index === 3 ? null : index === 4 ? invalidPolicy!.id : policy!.id,
            isDemo: true,
            blueprintVersionId: index === 9 ? null : blueprint!.id,
            durationSeconds: 3600,
            releaseAt,
            closeAt: new Date(
              now + (index === 24 ? 2 * 86400000 : index < 2 ? 4 * 3600000 : -3600000),
            ),
            status: 'DRAFT',
          })
          .returning();
        let selected =
          index === 2 ? [] : index === 6 ? versions.slice(0, 29) : versions.slice(0, 30);
        if (index === 5) selected = [versions[30]!, ...versions.slice(1, 30)];
        if (index === 7) selected = [versions[31]!, ...versions.slice(1, 30)];
        if (selected.length)
          await db.insert(packageItems).values(
            selected.map((questionVersionId, i) => ({
              packageId: pack!.id,
              questionVersionId,
              displayOrder: i + 1,
              maxPoints: '2',
            })),
          );
        await db
          .update(assessmentPackages)
          .set({
            frozenAt: index < 2 ? null : new Date(),
            status,
            curriculumApproval:
              index === 10
                ? null
                : sql`jsonb_build_object('reference','TEST ONLY NOT CURRICULUM APPROVAL','approvedAt',now()::text,'manifestDigest',${index === 8 ? sql`'TEST MISMATCH'` : sql`irt_compute.payload_digest(jsonb_build_object('packageId',${pack!.id}::uuid,'blueprintVersionId',${pack!.blueprintVersionId}::uuid,'scoringPolicyVersionId',${pack!.scoringPolicyVersionId}::uuid,'items',(select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from package_items i where i.package_id=${pack!.id}::uuid)))`})`,
          })
          .where(eq(assessmentPackages.id, pack!.id));
        if (index === 0) currentId = pack!.id;
        if (index === 1) olderId = pack!.id;
        if (index === 2) blankId = pack!.id;
        if (index === 3) noPolicyId = pack!.id;
        if (index === 4) badPolicyId = pack!.id;
        if (index === 5) mixedId = pack!.id;
        if (index === 6) shortId = pack!.id;
        if (index === 7) revisionId = pack!.id;
        if (index === 8) mismatchId = pack!.id;
        if (index === 9) noBlueprintId = pack!.id;
        if (index === 10) noApprovalId = pack!.id;
        if (index === 11) {
          readyId = pack!.id;
          const [attempt] = await db
            .insert(assessmentAttempts)
            .values({
              studentId: actors.get('student')!,
              packageId: pack!.id,
              assessmentType: 'TRYOUT',
              scoringPolicyVersionId: policy!.id,
              status: 'GRADED',
              startedAt: releaseAt,
              finishedAt: new Date(now - 2000),
              score0To100: '0',
            })
            .returning({ id: assessmentAttempts.id });
          readyAttemptId = attempt!.id;
        }
        if (index === 22 || index === 23) {
          await db.insert(assessmentAttempts).values({
            studentId: actors.get(index === 22 ? 'student' : 'other')!,
            packageId: pack!.id,
            assessmentType: 'TRYOUT',
            scoringPolicyVersionId: policy!.id,
            status: 'GRADED',
            startedAt: releaseAt,
            finishedAt: new Date(now - 2000),
            score0To100: '0',
          });
          if (index === 22) {
            archivedId = pack!.id;
            const [batch] = await db
              .insert(irtBatches)
              .values({
                packageId: pack!.id,
                batchKind: 'TEST',
                modelVersion: 'TEST ONLY',
                status: 'SUCCEEDED',
                finishedAt: new Date(now - 1000),
                resultReleasedAt: new Date(now - 1000),
              })
              .returning();
            await db.insert(irtItemResults).values(
              selected.map((questionVersionId) => ({
                batchId: batch!.id,
                questionVersionId,
                sampleSize: 30,
                dataStatus: 'SUFFICIENT',
              })),
            );
          } else foreignId = pack!.id;
        }
        if (index < 23) visible.push({ id: pack!.id, releaseAt });
      }
      visible.sort(
        (a, b) => b.releaseAt.getTime() - a.releaseAt.getTime() || b.id.localeCompare(a.id),
      );
      const [school] = await db
        .insert(schools)
        .values({ code: `META-${suffix}`, name: 'TEST school' })
        .returning();
      schoolId = school!.id;
      const created = new Date(now - 1000),
        verified = new Date(now);
      const [token] = await db
        .insert(teacherVerificationTokens)
        .values({
          schoolId,
          tokenHash: suffix.padEnd(64, '0'),
          createdByUserId: actors.get('admin')!,
          createdAt: created,
          expiresAt: new Date(now + 86400000),
          usedAt: verified,
          usedByUserId: actors.get('teacher')!,
        })
        .returning();
      await db.insert(teacherSchoolMemberships).values({
        schoolId,
        teacherUserId: actors.get('teacher')!,
        verificationTokenId: token!.id,
        verifiedAt: verified,
      });
      const [schoolClass] = await db
        .insert(classes)
        .values({
          schoolId,
          teacherUserId: actors.get('teacher'),
          name: 'TEST class',
          joinCode: suffix,
        })
        .returning();
      classId = schoolClass!.id;
      const extra = await db
        .insert(users)
        .values(
          Array.from({ length: 199 }, (_, i) => ({
            authUserId: randomUUID(),
            role: 'STUDENT' as const,
            displayName: 'TEST roster ' + i,
            email: `roster-${i}-${suffix}@example.test`,
          })),
        )
        .returning();
      await db.insert(classMemberships).values(
        [actors.get('student')!, ...extra.map((row) => row.id)].map((studentUserId) => ({
          classId,
          studentUserId,
        })),
      );
      await db.insert(levelProgress).values({
        studentId: actors.get('student')!,
        levelId: level!.id,
        unlockedAt: new Date(),
        latestScore: 0,
        bestScore: 0,
      });
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

    it('keeps page order, tie cursors, archive ownership, detail parity and release/content gates', async () => {
      const first = await service.packages('student');
      expect(first.packages.map((pack) => pack.id)).toEqual(
        visible.slice(0, 20).map((row) => row.id),
      );
      expect(first.nextCursor).toBe(visible[19]!.id);
      const second = await service.packages('student', first.nextCursor!);
      expect(second.packages.map((pack) => pack.id)).toEqual(
        visible.slice(20).map((row) => row.id),
      );
      expect(second.nextCursor).toBeNull();
      const all = [...first.packages, ...second.packages];
      expect(all.find((pack) => pack.id === currentId)).toMatchObject({
        state: 'open',
        periodState: 'ongoing',
        eligible: true,
        questionCount: 30,
        resultPendingReason: 'CONTENT_PENDING',
      });
      expect(all.find((pack) => pack.id === olderId)).toMatchObject({
        state: 'unavailable',
        periodState: 'unavailable',
        eligible: false,
      });
      for (const id of [blankId, shortId, revisionId, mismatchId, noBlueprintId, noApprovalId])
        expect(all.find((pack) => pack.id === id)?.resultPendingReason).toBe('CONTENT_PENDING');
      for (const id of [noPolicyId, badPolicyId, mixedId])
        expect(all.find((pack) => pack.id === id)?.resultPendingReason).toBe('SCORING_PENDING');
      expect(all.find((pack) => pack.id === blankId)?.questionCount).toBe(0);
      expect(all.find((pack) => pack.id === shortId)?.questionCount).toBe(29);
      expect(all.find((pack) => pack.id === readyId)).toMatchObject({
        state: 'waitingIrt',
        resultPendingReason: null,
      });
      expect((await service.attempt('student', readyAttemptId)).resultPendingReason).toBeNull();
      expect(all.find((pack) => pack.id === archivedId)).toMatchObject({
        state: 'resultReady',
        periodState: 'past',
        resultPendingReason: null,
      });
      for (const id of [currentId, noPolicyId, mixedId, archivedId])
        expect(await service.packageDetail('student', id)).toEqual(
          all.find((pack) => pack.id === id),
        );
      await expect(service.packageDetail('student', foreignId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.packages('student', foreignId)).rejects.toMatchObject({ status: 400 });
      await expect(service.packages('student', 'invalid')).rejects.toMatchObject({ status: 400 });
      expect((await service.packages('student', visible.at(-1)!.id)).packages).toEqual([]);
      expect(JSON.stringify(first)).not.toMatch(
        /answerKey|explanation|configuration|sourceReference/,
      );
    });
    it('bounds full-page SQL count and bytes and reads one target rather than 200 students', async () => {
      const page = await measured(() => service.packages('student'));
      const student = await measured(() =>
        monitoring.studentProgress('teacher', classId, actors.get('student')!),
      );
      expect(page.value.packages).toHaveLength(20);
      expect(student.value.student.id).toBe(actors.get('student'));
      expect(student.value.levels.some((level) => level.bestDrillScore === 0)).toBe(true);
      expect((await roster.students('teacher', classId)).items).toHaveLength(200);
      console.info(
        JSON.stringify({
          measurement: 'tryout_metadata_monitoring',
          packages: 20,
          roster: 200,
          pageBytes: page.bytes,
          pageQueries: page.queryCount,
          monitoringBytes: student.bytes,
          monitoringQueries: student.queryCount,
        }),
      );
      expect(page.queryCount).toBeLessThanOrEqual(16);
      expect(page.bytes).toBeLessThan(30000);
      expect(student.bytes).toBeLessThan(6000);
    });
    it('refreshes automatic finalization once, keeps XP idempotent and never exposes unreleased scores', async () => {
      const started = await service.start('student', currentId);
      await service.saveAnswer(
        'student',
        started.id,
        started.questions[0]!.questionInstanceId,
        'A',
      );
      expect(
        (await service.packages('student')).packages.find((pack) => pack.id === currentId)?.state,
      ).toBe('inProgress');
      await getDatabase()
        .db.update(assessmentAttempts)
        .set({ deadlineAt: new Date(Date.now() - 1) })
        .where(eq(assessmentAttempts.id, started.id));
      const done = (await service.packages('student')).packages.find(
        (pack) => pack.id === currentId,
      )!;
      expect(done).toMatchObject({ state: 'waitingIrt', attemptId: started.id, eligible: false });
      expect(done).not.toHaveProperty('score');
      expect(
        (await service.packages('student')).packages.find((pack) => pack.id === currentId),
      ).toEqual(done);
      const awards = await getDatabase()
        .db.select()
        .from(xpLedger)
        .where(eq(xpLedger.attemptId, started.id));
      expect(awards).toHaveLength(1);
      expect(Number(awards[0]!.xpAmount)).toBe(10);
      await expect(
        service.saveAnswer('student', started.id, started.questions[0]!.questionInstanceId, 'B'),
      ).rejects.toMatchObject({ status: 409 });
    });
    it('keeps monitoring owner, membership, school, archived-class and left/ban guards', async () => {
      await expect(service.packages()).rejects.toMatchObject({ status: 401 });
      await expect(service.packages('teacher')).rejects.toMatchObject({ status: 403 });
      for (const token of [undefined, 'outsider', 'unverified', 'student'])
        await expect(
          monitoring.studentProgress(token, classId, actors.get('student')!),
        ).rejects.toMatchObject({ status: token ? 403 : 401 });
      await expect(
        monitoring.studentProgress('teacher', classId, actors.get('other')!),
      ).rejects.toMatchObject({ status: 404 });
      const db = getDatabase().db;
      await db.update(schools).set({ status: 'INACTIVE' }).where(eq(schools.id, schoolId));
      try {
        await expect(
          monitoring.studentProgress('teacher', classId, actors.get('student')!),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await db.update(schools).set({ status: 'ACTIVE' }).where(eq(schools.id, schoolId));
      }
      await db.update(classes).set({ archivedAt: new Date() }).where(eq(classes.id, classId));
      try {
        await expect(
          monitoring.studentProgress('teacher', classId, actors.get('student')!),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await db.update(classes).set({ archivedAt: null }).where(eq(classes.id, classId));
      }
      await roster.setBan('teacher', classId, actors.get('student')!, true);
      await expect(
        monitoring.studentProgress('teacher', classId, actors.get('student')!),
      ).rejects.toMatchObject({ status: 404 });
      await db
        .update(teacherSchoolMemberships)
        .set({ endedAt: new Date() })
        .where(eq(teacherSchoolMemberships.teacherUserId, actors.get('teacher')!));
      await expect(
        monitoring.studentProgress('teacher', classId, actors.get('student')!),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
