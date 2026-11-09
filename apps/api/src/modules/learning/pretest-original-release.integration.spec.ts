import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type * as Database from '@tka/database';
import { assessmentPackages, attemptItems, questionVersions, users, xpLedger } from '@tka/database';
import { decodeAssessmentContent, pretestPartialResult } from '@tka/assessment-engine';
import { PretestService } from './pretest.service';
import { AssessmentMediaService } from './assessment-media.service';
import { R2MediaStorage } from '../content/r2-media.storage';
import type { IdentityService } from '../identity/identity.service';
import type { TryoutReleaseService } from './tryout-release.service';

const context = vi.hoisted(() => ({
  connection: undefined as ReturnType<typeof Database.getDatabase> | undefined,
}));
vi.mock('@tka/database', async (original) => ({
  ...(await original<typeof Database>()),
  getDatabase: () => {
    if (!context.connection) throw new Error('Rollback QA transaction not installed');
    return context.connection;
  },
}));
// Explicit opt-in: real Development release only; every test write is rolled back.
describe.skipIf(process.env.PRETEST_RELEASE_ROLLBACK_QA !== 'true')(
  'published original Pretest rollback QA',
  () => {
    let real: ReturnType<typeof Database.getDatabase>;
    afterAll(async () => {
      context.connection = undefined;
      if (real) await real.client.end();
    });
    it('opens all four packages, saves/resumes typed answers, serves all 35 images and grades without XP', async () => {
      expect(process.env.SUPABASE_PROJECT_REF).toBe('pkamenfnwmoeisccnrnk');
      const database = await vi.importActual<typeof Database>('@tka/database');
      real = database.getDatabase();
      const rollback = new Error('EXPECTED_QA_ROLLBACK');
      let completed = false;
      try {
        await real.db.transaction(async (tx) => {
          context.connection = { ...real, db: tx as unknown as typeof real.db };
          const studentId = randomUUID();
          await tx.insert(users).values({
            id: studentId,
            authUserId: randomUUID(),
            role: 'STUDENT',
            displayName: 'Rollback Pretest QA',
            email: `${studentId}@example.invalid`,
          });
          const identity = {
            me: async () => ({ id: studentId, role: 'STUDENT', status: 'ACTIVE' }),
          } as unknown as IdentityService;
          const service = new PretestService(identity);
          const storage = new R2MediaStorage(new ConfigService(process.env));
          const mediaService = new AssessmentMediaService(
            identity,
            storage,
            {} as TryoutReleaseService,
          );
          const packages = await tx
            .select()
            .from(assessmentPackages)
            .where(
              and(
                eq(assessmentPackages.assessmentType, 'PRETEST'),
                eq(assessmentPackages.status, 'PUBLISHED'),
              ),
            );
          expect(packages).toHaveLength(4);
          let images = 0;
          for (const pkg of packages) {
            expect((await service.chapter('qa', pkg.chapterId!)).canStart).toBe(true);
            const attempt = await service.start('qa', pkg.chapterId!);
            expect(attempt.questions).toHaveLength(20);
            expect((await service.start('qa', pkg.chapterId!)).id).toBe(attempt.id);
            const rows = await tx
              .select({ item: attemptItems, version: questionVersions })
              .from(attemptItems)
              .innerJoin(questionVersions, eq(questionVersions.id, attemptItems.questionVersionId))
              .where(eq(attemptItems.attemptId, attempt.id));
            const grading: Parameters<typeof pretestPartialResult>[0] = [];
            const answeredTypes = new Set<string>();
            for (const row of rows) {
              const content = decodeAssessmentContent(row.version);
              let answer: unknown = null;
              if (!answeredTypes.has(content.type)) {
                answeredTypes.add(content.type);
                answer = content.answerKey;
                if ('optionIds' in content.answerKey)
                  answer = { optionIds: [content.answerKey.optionIds[0]!] };
                if ('categoryByStatementId' in content.answerKey) {
                  const [id, category] = Object.entries(
                    content.answerKey.categoryByStatementId,
                  )[0]!;
                  answer = { categoryByStatementId: { [id]: category } };
                }
                const saved = await service.saveAnswer('qa', attempt.id, row.item.id, answer, 0);
                expect(saved.revision).toBe(1);
                const resumed = await service.attempt('qa', attempt.id);
                expect(
                  resumed.questions.find((q) => q.questionInstanceId === row.item.id)?.answer,
                ).toEqual(answer);
                expect(
                  (await service.saveAnswer('qa', attempt.id, row.item.id, answer, 0)).revision,
                ).toBe(1);
                expect(
                  (await service.saveAnswer('qa', attempt.id, row.item.id, null, 1)).revision,
                ).toBe(2);
                expect(
                  (await service.attempt('qa', attempt.id)).questions.find(
                    (q) => q.questionInstanceId === row.item.id,
                  )?.answer,
                ).toBeNull();
                expect(
                  (await service.saveAnswer('qa', attempt.id, row.item.id, answer, 2)).revision,
                ).toBe(3);
              }
              grading.push({ content, answer });
              const assets = Array.isArray(row.version.media) ? row.version.media : [];
              if (assets.length) {
                images++;
                const links = await mediaService.links('qa', row.item.id, 'WORK');
                for (const link of links.media) {
                  const response = await fetch(link.url, {
                    signal: AbortSignal.timeout(15000),
                    redirect: 'error',
                  });
                  expect(response.ok).toBe(true);
                  const bytes = Buffer.from(await response.arrayBuffer());
                  const asset = assets.find((a: { assetId: string }) => a.assetId === link.assetId);
                  expect(bytes.length).toBe(asset.byteLength);
                  expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
                }
              }
            }
            expect(answeredTypes.size).toBe(3);
            const expected = pretestPartialResult(grading);
            const result = await service.submit('qa', attempt.id);
            expect(result.score).toBe(expected.score);
            expect(result.correctCount).toBe(expected.correctCount);
            expect(result.initialLevel).toBe(expected.initialLevel);
            expect(await service.submit('qa', attempt.id)).toEqual(result);
            await expect(service.start('qa', pkg.chapterId!)).rejects.toMatchObject({
              response: { code: 'PRETEST_COMPLETED' },
            });
            await expect(
              mediaService.links('qa', rows[0]!.item.id, 'REVIEW'),
            ).rejects.toMatchObject({ response: { code: 'ASSESSMENT_REVIEW_NOT_AVAILABLE' } });
          }
          expect(images).toBe(35);
          expect(
            await tx.select().from(xpLedger).where(eq(xpLedger.studentId, studentId)),
          ).toHaveLength(0);
          completed = true;
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
      expect(completed).toBe(true);
    }, 120000);
  },
);
