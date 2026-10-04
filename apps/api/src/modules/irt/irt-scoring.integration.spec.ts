import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  getDatabase,
  irtBatches,
  packageItems,
  questionVersions,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';
import { IrtIntegrationService } from './irt-integration.service';
import type { IrtBatchInputV2, IrtBatchOutputV2 } from './irt-integration.contract';

databaseSuite('PROPOSED IRT v2 integration, TEST ONLY model/scale/PGK answers', () => {
  const fixture = installFerdiFixture();
  it('freezes submitted PG/MCMA/Category including unanswered items, validates per-attempt output and never releases scores', async () => {
    const db = getDatabase().db;
    const integration = new IrtIntegrationService();
    const [pkg] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `TEST-IRT2-${randomUUID()}`,
        packageVersion: 1,
        name: 'TEST ONLY TryOut boundary',
        assessmentType: 'TRYOUT',
        scoringPolicyVersionId: fixture.policy,
        status: 'CLOSED',
        isDemo: true,
        releaseAt: new Date(Date.now() - 1000),
      })
      .returning();
    const types = [
      'SINGLE_CHOICE',
      'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
      'CATEGORY',
      'SINGLE_CHOICE',
    ] as const;
    const items: (typeof packageItems.$inferSelect)[] = [];
    for (let i = 0; i < types.length; i++) {
      const [source] = await db
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, fixture.versionIds[i]!));
      const [version] = await db
        .insert(questionVersions)
        .values({
          ...source!,
          id: randomUUID(),
          versionNumber: source!.versionNumber + 1,
          questionType: types[i]!,
          scoringRubricVersionId: null,
          revisedFromQuestionVersionId: source!.id,
        })
        .returning();
      const [pi] = await db
        .insert(packageItems)
        .values({
          packageId: pkg!.id,
          questionVersionId: version!.id,
          displayOrder: i + 1,
          maxPoints: '1',
        })
        .returning();
      items.push(pi!);
    }
    const [attempt] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: fixture.student,
        packageId: pkg!.id,
        assessmentType: 'TRYOUT',
        scoringPolicyVersionId: fixture.policy,
        status: 'IN_PROGRESS',
        startedAt: new Date(Date.now() - 1000),
      })
      .returning();
    for (let i = 0; i < items.length; i++) {
      const pi = items[i]!;
      const [item] = await db
        .insert(attemptItems)
        .values({
          attemptId: attempt!.id,
          packageId: pkg!.id,
          packageItemId: pi.id,
          questionVersionId: pi.questionVersionId,
          displayOrder: i + 1,
          maxPoints: '1',
        })
        .returning();
      if (i < 3)
        await db.insert(attemptAnswers).values({
          attemptItemId: item!.id,
          savedAt: new Date(Date.now() - 1000),
          answer:
            i === 0
              ? { optionId: 'A' }
              : i === 1
                ? { optionIds: ['A', 'C'] }
                : { categories: { S1: 'TRUE', S2: 'FALSE' } },
        });
    }
    await db
      .update(assessmentAttempts)
      .set({ status: 'SUBMITTED', finishedAt: new Date() })
      .where(eq(assessmentAttempts.id, attempt!.id));
    const prepare = {
      batchId: randomUUID(),
      batchKind: 'TRYOUT' as const,
      contractVersion: '2' as const,
      modelVersion: 'TEST ONLY MODEL',
      scaleId: 'TEST ONLY SCALE',
      packageId: pkg!.id,
      cutoffAt: new Date().toISOString(),
    };
    const snapshot = (await integration.prepare(prepare)) as IrtBatchInputV2;
    expect(snapshot.contractVersion).toBe('2');
    expect(snapshot.responses.map((r) => r.questionType)).toEqual(types);
    expect(snapshot.responses.map((r) => r.answer)).toEqual([
      { optionId: 'A' },
      { optionIds: ['A', 'C'] },
      { categories: { S1: 'TRUE', S2: 'FALSE' } },
      null,
    ]);
    expect(snapshot.responses.every((r) => r.correct === null && r.awardedPoints === null)).toBe(
      true,
    );
    expect(JSON.stringify(snapshot)).not.toContain(fixture.student);
    expect(await integration.prepare(prepare)).toEqual(snapshot);
    await expect(
      db
        .update(attemptAnswers)
        .set({ answer: { optionId: 'B' }, savedAt: new Date(Date.now() + 60_000) })
        .where(eq(attemptAnswers.attemptItemId, snapshot.responses[0]!.attemptItemId)),
    ).rejects.toThrow();
    expect(await integration.prepare(prepare)).toEqual(snapshot);
    expect(await integration.prepare({ ...prepare, batchId: randomUUID() })).toMatchObject({
      responses: snapshot.responses,
    });
    await expect(integration.prepare({ ...prepare, scaleId: 'DIFFERENT' })).rejects.toMatchObject({
      status: 409,
    });
    const output: IrtBatchOutputV2 = {
      contractVersion: '2',
      batchId: prepare.batchId,
      modelVersion: prepare.modelVersion,
      items: [],
      respondents: [
        {
          respondentId: snapshot.responses[0]!.respondentId,
          attemptId: attempt!.id,
          scoringPolicyVersionId: fixture.policy,
          scaleId: prepare.scaleId,
          score: 642.5,
        },
      ],
    };
    for (const change of [
      { respondentId: 'wrong' },
      { attemptId: randomUUID() },
      { scoringPolicyVersionId: randomUUID() },
      { scaleId: 'wrong' },
      { score: NaN },
      { score: Infinity },
    ])
      await expect(
        integration.complete({
          ...output,
          respondents: [{ ...output.respondents[0]!, ...change }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    await expect(integration.complete({ ...output, respondents: [] })).rejects.toMatchObject({
      status: 400,
    });
    await Promise.all([integration.complete(output), integration.complete(output)]);
    const [batch] = await db.select().from(irtBatches).where(eq(irtBatches.id, prepare.batchId));
    expect(batch!.outputSnapshot).toEqual(output);
    expect(batch!.resultReleasedAt).toBeNull();
    const [storedAttempt] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attempt!.id));
    expect(storedAttempt!.status).toBe('SUBMITTED');
    expect(storedAttempt!.score0To100).toBeNull();
    await expect(
      integration.complete({ ...output, respondents: [{ ...output.respondents[0]!, score: 643 }] }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
