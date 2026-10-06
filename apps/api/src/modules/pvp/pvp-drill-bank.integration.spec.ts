import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assessmentPackages,
  chapters,
  closeDatabaseConnection,
  competencies,
  contentValidationDecisions,
  getDatabase,
  levels,
  packageItems,
  pvpMatches,
  pvpMatchQuestions,
  questions,
  questionVariants,
  questionVersions,
  subchapters,
} from '@tka/database';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { PvpDrillBank } from './pvp-drill-bank';
import { pvpFixture } from './pvp.test-fixture';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration(
  'PvP READY Drill bank with its own isolated PostgreSQL database',
  { timeout: 20_000 },
  () => {
    let admin: ReturnType<typeof postgres>;
    let name: string;
    let fixture: Awaited<ReturnType<typeof pvpFixture>>;
    let engine: PvpEngineService;
    const bank = new PvpDrillBank();
    const easy: Awaited<ReturnType<typeof addQuestion>>[] = [];
    const db = () => getDatabase().db;
    const host = () => fixture.students[0]!.id;

    beforeAll(async () => {
      const target = new URL(process.env.TEST_DATABASE_URL!);
      if (
        process.env.NODE_ENV !== 'test' ||
        !['localhost', '127.0.0.1'].includes(target.hostname) ||
        !target.pathname.startsWith('/numora_test')
      )
        throw new Error('Isolated local test database required');
      admin = postgres(target.toString(), { max: 1, onnotice: () => {} });
      name = `numora_test_pvp_bank_${randomUUID().replaceAll('-', '')}`;
      await admin.unsafe(`create database "${name}"`);
      target.pathname = `/${name}`;
      const migrationClient = postgres(target.toString(), { max: 1, onnotice: () => {} });
      try {
        await migrate(drizzle(migrationClient), {
          migrationsFolder: resolve('../../packages/database/drizzle'),
        });
      } finally {
        await migrationClient.end();
      }
      await closeDatabaseConnection();
      process.env.DATABASE_URL = target.toString();
      fixture = await pvpFixture(0);
      engine = new PvpEngineService(fixture.policy);
    }, 90_000);

    afterAll(async () => {
      vi.restoreAllMocks();
      await closeDatabaseConnection();
      if (admin && name) await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin?.end();
    });

    async function addQuestion(
      difficulty = 'EASY',
      overrides: Partial<typeof questionVersions.$inferInsert> = {},
      context: Partial<typeof questions.$inferInsert> = {},
    ) {
      const [question] = await db()
        .insert(questions)
        .values({
          primaryCompetencyId: fixture.competency.id,
          usageType: 'DRILL',
          status: 'READY',
          ...context,
        })
        .returning();
      const [variant] = await db()
        .insert(questionVariants)
        .values({
          questionId: question!.id,
          variantCode: randomUUID(),
          kind: 'ORIGINAL',
          origin: 'TEST',
        })
        .returning();
      const [version] = await db()
        .insert(questionVersions)
        .values({
          variantId: variant!.id,
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE',
          stem: { text: 'TEST ONLY 1 + 1?' },
          optionsOrStatements: [
            { id: 'A', content: { text: '2' } },
            { id: 'B', content: { text: '3' } },
          ],
          answerKey: { optionId: 'A' },
          explanation: { text: 'TEST ONLY 1 + 1 = 2' },
          difficulty,
          contentStatus: 'READY',
          reviewedAt: new Date(),
          reviewedByUserId: fixture.contentAdmin.id,
          ...overrides,
        })
        .returning();
      return { question: question!, variant: variant!, version: version! };
    }
    async function counts() {
      const [row] = await db().execute<{ packages: number; rooms: number; items: number }>(sql`
      select (select count(*)::int from assessment_packages) as packages,
      (select count(*)::int from pvp_matches) as rooms, (select count(*)::int from package_items) as items`);
      return row!;
    }

    it('reports an empty bank and rejects create without leaving a partial package', async () => {
      const before = await counts();
      expect((await engine.availability()).difficulties.every((d) => !d.available)).toBe(true);
      await expect(engine.create(host(), 'easy', randomUUID())).rejects.toMatchObject({
        response: { code: 'PVP_CONTENT_UNAVAILABLE' },
      });
      expect(await counts()).toEqual(before);
    });

    it('requires ten families even when nine have extra versions/variants', async () => {
      for (let i = 0; i < 9; i++) easy.push(await addQuestion());
      const first = easy[0]!;
      const [variant] = await db()
        .insert(questionVariants)
        .values({
          questionId: first.question.id,
          variantCode: randomUUID(),
          kind: 'VARIANT',
          originalVariantId: first.variant.id,
          origin: 'TEST',
        })
        .returning();
      await db()
        .insert(questionVersions)
        .values({
          ...first.version,
          id: randomUUID(),
          variantId: variant!.id,
          versionNumber: 1,
        });
      expect(await bank.families(db(), 'easy')).toHaveLength(9);
      const before = await counts();
      expect((await engine.availability()).available).toBe(false);
      await expect(engine.create(host(), 'easy', randomUUID())).rejects.toMatchObject({
        response: { code: 'PVP_CONTENT_UNAVAILABLE' },
      });
      expect(await counts()).toEqual(before);
    });

    it('mixes chapters, uses latest READY versions, and never writes during availability', async () => {
      const [chapter] = await db()
        .insert(chapters)
        .values({
          code: randomUUID(),
          slug: randomUUID(),
          name: 'TEST second chapter',
          displayOrder: 2,
          status: 'READY',
        })
        .returning();
      const [subchapter] = await db()
        .insert(subchapters)
        .values({
          chapterId: chapter!.id,
          code: randomUUID(),
          slug: randomUUID(),
          name: 'TEST second subchapter',
          displayOrder: 1,
          status: 'READY',
        })
        .returning();
      const [competency] = await db()
        .insert(competencies)
        .values({
          subchapterId: subchapter!.id,
          code: randomUUID(),
          description: 'TEST',
          status: 'READY',
        })
        .returning();
      easy.push(await addQuestion('EASY', {}, { primaryCompetencyId: competency!.id }));
      const first = easy[1]!;
      const [latest] = await db()
        .insert(questionVersions)
        .values({
          ...first.version,
          id: randomUUID(),
          versionNumber: 2,
          stem: { text: 'TEST latest READY' },
        })
        .returning();
      await db()
        .insert(questionVersions)
        .values({
          ...first.version,
          id: randomUUID(),
          versionNumber: 3,
          contentStatus: 'DRAFT',
        });
      const candidates = (await bank.families(db(), 'easy')).flat();
      expect(candidates.some((c) => c.version.id === latest!.id)).toBe(true);
      expect(candidates.some((c) => c.version.id === first.version.id)).toBe(false);
      const before = await counts();
      expect((await engine.availability()).difficulties.map((d) => d.available)).toEqual([
        true,
        false,
        false,
      ]);
      expect(await counts()).toEqual(before);
      const key = randomUUID();
      const [room, retry] = await Promise.all([
        engine.create(host(), 'easy', key),
        engine.create(host(), 'easy', key),
      ]);
      expect(retry.matchId).toBe(room.matchId);
      const saved = await db()
        .select()
        .from(pvpMatchQuestions)
        .where(eq(pvpMatchQuestions.matchId, room.matchId));
      expect(saved).toHaveLength(10);
      expect(saved.map((q) => q.questionVersionId)).toContain(latest!.id);
      const ids = new Set(saved.map((q) => q.questionVersionId));
      expect(ids.size).toBe(10);
      const after = await counts();
      expect(after.packages - before.packages).toBe(1);
      expect(after.rooms - before.rooms).toBe(1);
      const [pack] = await db()
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, saved[0]!.packageId));
      expect(pack).toMatchObject({ status: 'PUBLISHED', curriculumApproval: null });
      expect(pack!.manifestDigest).toBeTruthy();
      expect(pack!.frozenAt).not.toBeNull();
      await expect(engine.create(host(), 'hard', key)).rejects.toMatchObject({
        response: { code: 'REQUEST_ID_REUSED' },
      });
      await engine.leave(host(), room.matchId);
      expect((await engine.create(host(), 'easy', key)).matchId).toBe(room.matchId);
    });

    it('excludes incorrect usage, statuses, unsupported content and non-READY hierarchy/level', async () => {
      const invalid = [];
      invalid.push(await addQuestion('EASY', {}, { usageType: 'TRYOUT' }));
      invalid.push(await addQuestion('EASY', {}, { usageType: null }));
      invalid.push(await addQuestion('EASY', {}, { status: 'DRAFT' }));
      invalid.push(await addQuestion('EASY', {}, { status: 'ARCHIVED' }));
      invalid.push(
        await addQuestion('EASY', {
          contentStatus: 'DRAFT',
          reviewedAt: null,
          reviewedByUserId: null,
        }),
      );
      invalid.push(await addQuestion('EASY', { contentStatus: 'ARCHIVED' }));
      invalid.push(await addQuestion('EASY', { questionType: 'CATEGORY' }));
      invalid.push(await addQuestion('EASY', { answerKey: { optionId: 'Z' } }));
      invalid.push(await addQuestion('EASY', { media: [{ url: '/TEST.png' }] }));
      const [draftLevel] = await db()
        .insert(levels)
        .values({ subchapterId: fixture.subchapter.id, levelNumber: 5 })
        .returning();
      invalid.push(await addQuestion('EASY', { levelId: draftLevel!.id }));
      const invalidIds = invalid.map((c) => c.version.id);
      expect(
        (await bank.families(db(), 'easy')).flat().some((c) => invalidIds.includes(c.version.id)),
      ).toBe(false);
      const available = await bank.families(db(), 'easy');
      for (const table of [chapters, subchapters, competencies]) {
        const id =
          table === chapters
            ? fixture.chapter.id
            : table === subchapters
              ? fixture.subchapter.id
              : fixture.competency.id;
        await db().update(table).set({ status: 'REVISION' }).where(eq(table.id, id));
        expect(await bank.families(db(), 'easy')).toHaveLength(1);
        await db().update(table).set({ status: 'READY' }).where(eq(table.id, id));
      }
      expect(await bank.families(db(), 'easy')).toHaveLength(available.length);
    });

    it('accepts existing CONTENT_VALID evidence and avoids an older difficulty after revision', async () => {
      const valid = await addQuestion('MEDIUM', {
        contentStatus: 'DRAFT',
        reviewedAt: null,
        reviewedByUserId: null,
      });
      const [decision] = await db()
        .insert(contentValidationDecisions)
        .values({
          questionVersionId: valid.version.id,
          state: 'CONTENT_VALID',
          reviewerUserId: fixture.contentAdmin.id,
          evidence: { fixture: true },
          reason: 'TEST ONLY validation',
        })
        .returning();
      await db()
        .update(questionVersions)
        .set({
          contentStatus: 'READY',
          validationState: 'CONTENT_VALID',
          validationDecisionId: decision!.id,
        })
        .where(eq(questionVersions.id, valid.version.id));
      expect((await bank.families(db(), 'medium')).flat().map((c) => c.version.id)).toContain(
        valid.version.id,
      );
      const changed = await addQuestion('EASY');
      await db()
        .insert(questionVersions)
        .values({ ...changed.version, id: randomUUID(), versionNumber: 2, difficulty: 'HARD' });
      expect(
        (await bank.families(db(), 'easy'))
          .flat()
          .some((c) => c.questionId === changed.question.id),
      ).toBe(false);
      expect(
        (await bank.families(db(), 'hard'))
          .flat()
          .some((c) => c.questionId === changed.question.id),
      ).toBe(true);
    });

    it('revalidates selected content and rolls back all package/room writes on downstream failure', async () => {
      const original = PvpDrillBank.prototype.lockSelection;
      const selection = vi
        .spyOn(PvpDrillBank.prototype, 'lockSelection')
        .mockImplementationOnce(async function (this: PvpDrillBank, tx, difficulty, selected) {
          await tx
            .update(questions)
            .set({ status: 'ARCHIVED' })
            .where(eq(questions.id, selected[0]!.questionId));
          return original.call(this, tx, difficulty, selected);
        });
      const before = await counts();
      await expect(engine.create(host(), 'easy', randomUUID())).rejects.toMatchObject({
        response: { code: 'PVP_CONTENT_UNAVAILABLE' },
      });
      selection.mockRestore();
      expect(await counts()).toEqual(before);
      const event = vi
        .spyOn(engine as unknown as { event: () => Promise<void> }, 'event')
        .mockRejectedValueOnce(new Error('TEST ONLY outbox failure'));
      await expect(engine.create(host(), 'easy', randomUUID())).rejects.toThrow(
        'TEST ONLY outbox failure',
      );
      event.mockRestore();
      expect(await counts()).toEqual(before);
      expect(await engine.activeRoom(host())).toBeNull();
    });

    it('draws all three difficulties in both modes and pins content/order across reconnect and revision', async () => {
      for (let i = 0; i < 11; i++) {
        await addQuestion('MEDIUM');
        await addQuestion('HARD');
      }
      for (const mode of ['demo', 'official'] as const) {
        const current = new PvpEngineService({ ...fixture.policy, mode });
        current.setSchedulerReady(true);
        expect((await current.availability()).difficulties.every((d) => d.available)).toBe(true);
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
          const room = await current.create(host(), difficulty, randomUUID());
          expect(room.isDemo).toBe(mode === 'demo');
          await current.join(fixture.students[1]!.id, room.roomCode);
          await current.ready(host(), room.matchId);
          const started = await current.ready(fixture.students[1]!.id, room.matchId);
          expect((await current.snapshot(host(), room.matchId)).question!.id).toBe(
            started.question!.id,
          );
          const before = await db()
            .select()
            .from(pvpMatchQuestions)
            .where(eq(pvpMatchQuestions.matchId, room.matchId))
            .orderBy(asc(pvpMatchQuestions.displayOrder));
          const versions = await db()
            .select()
            .from(questionVersions)
            .where(
              inArray(
                questionVersions.id,
                before.map((q) => q.questionVersionId),
              ),
            );
          expect(versions.every((v) => v.difficulty?.toLowerCase() === difficulty)).toBe(true);
          const [match] = await db()
            .select()
            .from(pvpMatches)
            .where(eq(pvpMatches.id, room.matchId));
          await expect(
            db()
              .update(packageItems)
              .set({ maxPoints: '1' })
              .where(eq(packageItems.packageId, match!.packageId)),
          ).rejects.toThrow();
          const first = versions[0]!;
          const [latest] = await db()
            .select()
            .from(questionVersions)
            .where(eq(questionVersions.variantId, first.variantId));
          const max = (
            await db()
              .select()
              .from(questionVersions)
              .where(eq(questionVersions.variantId, latest!.variantId))
          ).reduce((n, v) => Math.max(n, v.versionNumber), 0);
          await db()
            .insert(questionVersions)
            .values({
              ...first,
              id: randomUUID(),
              versionNumber: max + 1,
              stem: { text: 'TEST revised after room' },
              validationState: 'DRAFT',
              validationDecisionId: null,
              reviewedAt: new Date(),
              reviewedByUserId: fixture.contentAdmin.id,
            });
          await current.answer(host(), room.matchId, started.question!.id, 'A', randomUUID());
          await current.disconnect(host(), room.matchId);
          const resumed = await current.reconnect(host(), room.matchId);
          expect(resumed.question!.id).toBe(started.question!.id);
          expect(resumed.question!.selectedOptionId).toBe('A');
          expect(JSON.stringify(resumed)).not.toMatch(/answerKey|correctOptionId|explanation/);
          expect(
            await db()
              .select()
              .from(pvpMatchQuestions)
              .where(eq(pvpMatchQuestions.matchId, room.matchId))
              .orderBy(asc(pvpMatchQuestions.displayOrder)),
          ).toEqual(
            before.map((q) =>
              q.displayOrder === 1
                ? {
                    ...q,
                    status: 'ACTIVE',
                    startedAt: expect.any(Date),
                    deadlineAt: expect.any(Date),
                  }
                : q,
            ),
          );
          await current.leave(host(), room.matchId);
        }
      }
    });
  },
);
