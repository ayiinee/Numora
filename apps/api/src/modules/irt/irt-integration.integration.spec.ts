import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  attemptAnswers,
  attemptItems,
  getDatabase,
  irtBatches,
  irtItemResults,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';
import { IrtIntegrationService } from './irt-integration.service';
databaseSuite('IRT integration through HTTP/PostgreSQL', () => {
  const fixture = installFerdiFixture();
  it('snapshots pseudonymous canonical input, deduplicates batches, and accepts identical output retries', async () => {
    const { canonicalPackage, policy, student, versionIds } = fixture;
    const integration = new IrtIntegrationService();
    const prepare = {
      batchId: randomUUID(),
      batchKind: 'DAILY' as const,
      modelVersion: 'TEST-model-1',
      packageId: canonicalPackage,
      cutoffAt: new Date().toISOString(),
    };
    const input = await integration.prepare(prepare);
    expect(input.responses).toHaveLength(30);
    expect(
      input.responses.every(
        (r) => r.respondentId.length === 64 && r.correct && r.scoringPolicyVersionId === policy,
      ),
    ).toBe(true);
    expect(JSON.stringify(input)).not.toContain(student);
    expect(JSON.stringify(input)).not.toContain('@example.test');
    expect(await integration.prepare(prepare)).toEqual(input);
    await expect(
      integration.prepare({ ...prepare, modelVersion: 'changed' }),
    ).rejects.toMatchObject({ status: 409 });
    const output = {
      contractVersion: '1' as const,
      batchId: input.batchId,
      modelVersion: input.modelVersion,
      items: [
        {
          questionVersionId: versionIds[0]!,
          sampleSize: 30,
          dataStatus: 'SUFFICIENT' as const,
          difficultyB: 0.5,
          discriminationA: 1,
          guessingC: 0.25,
          scaleId: 'TEST-scale',
        },
      ],
    };
    const finalized = await Promise.all([
      integration.complete(output),
      integration.complete(output),
    ]);
    expect(finalized).toEqual([{ id: input.batchId }, { id: input.batchId }]);
    expect(
      await getDatabase()
        .db.select()
        .from(irtItemResults)
        .where(eq(irtItemResults.batchId, input.batchId)),
    ).toHaveLength(1);
    await expect(
      integration.complete({ ...output, items: [{ ...output.items[0]!, difficultyB: 1 }] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await integration.readiness(input.batchId)).toEqual({
      batchSucceeded: true,
      enoughData: true,
      releasePolicyOpen: true,
    });
    expect(
      (await getDatabase().db.select().from(irtBatches).where(eq(irtBatches.id, input.batchId)))[0]!
        .resultReleasedAt,
    ).toBeNull();
    await expect(integration.fail(input.batchId, 'TIMEOUT')).rejects.toMatchObject({ status: 409 });
  });
  it('rejects insufficient/forged output, retries failed jobs, and keeps historical scores unchanged', async () => {
    const { canonicalPackage, attemptId, versionIds, request } = fixture;
    const integration = new IrtIntegrationService();
    const { db } = getDatabase();
    const before = (
      await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId))
    )[0];
    const input = await integration.prepare({
      batchId: randomUUID(),
      batchKind: 'DAILY',
      modelVersion: 'TEST-29',
      packageId: canonicalPackage,
      cutoffAt: new Date().toISOString(),
    });
    const item = {
      questionVersionId: versionIds[0]!,
      sampleSize: 29,
      dataStatus: 'NOT_ENOUGH_DATA' as const,
      difficultyB: null,
      discriminationA: null,
      guessingC: null,
      scaleId: null,
    };
    const output = {
      contractVersion: '1' as const,
      batchId: input.batchId,
      modelVersion: input.modelVersion,
      items: [item],
    };
    await expect(
      integration.complete({ ...output, items: [{ ...item, difficultyB: 0.5 }] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      integration.complete({ ...output, items: [{ ...item, sampleSize: 31 }] }),
    ).rejects.toMatchObject({ status: 400 });
    await integration.fail(input.batchId, 'TEST_TIMEOUT');
    expect(await integration.readiness(input.batchId)).toMatchObject({
      batchSucceeded: false,
      enoughData: false,
    });
    await integration.complete(output);
    expect(await integration.readiness(input.batchId)).toMatchObject({
      batchSucceeded: true,
      enoughData: false,
    });
    expect(
      (await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId)))[0],
    ).toEqual(before);
    const batches = await request('admin/irt/batches');
    expect(batches.status).toBe(200);
    expect(JSON.stringify(await batches.json())).not.toContain('respondentId');
    expect((await request('admin/irt/batches', 'GET', undefined, 'student')).status).toBe(403);
  });
  it('rejects unrepresentable parameters without changing batch state', async () => {
    const integration = new IrtIntegrationService();
    await expect(integration.readiness('not-a-uuid')).rejects.toMatchObject({ status: 400 });
    const input = await integration.prepare({
      batchId: randomUUID(),
      batchKind: 'DAILY',
      modelVersion: 'TEST-storage',
      packageId: fixture.canonicalPackage,
      cutoffAt: new Date().toISOString(),
    });
    const output = {
      contractVersion: '1' as const,
      batchId: input.batchId,
      modelVersion: input.modelVersion,
      items: [
        {
          questionVersionId: fixture.versionIds[0]!,
          sampleSize: 30,
          dataStatus: 'SUFFICIENT' as const,
          difficultyB: 1_000_000,
          discriminationA: 1,
          guessingC: null,
          scaleId: null,
        },
      ],
    };
    await expect(integration.complete(output)).rejects.toMatchObject({ status: 400 });
    expect(
      (await getDatabase().db.select().from(irtBatches).where(eq(irtBatches.id, input.batchId)))[0]!
        .status,
    ).toBe('PENDING');
  });
  it('freezes only responses graded before an explicit-timezone cutoff', async () => {
    const integration = new IrtIntegrationService();
    const { db } = getDatabase();
    const [answer] = await db
      .select({
        id: attemptAnswers.id,
        itemId: attemptAnswers.attemptItemId,
        gradedAt: attemptAnswers.gradedAt,
      })
      .from(attemptAnswers)
      .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
      .where(eq(attemptItems.packageId, fixture.canonicalPackage))
      .orderBy(desc(attemptAnswers.gradedAt))
      .limit(1);
    await expect(
      db
        .update(attemptAnswers)
        .set({ gradedAt: new Date(Date.now() + 60_000) })
        .where(eq(attemptAnswers.id, answer!.id)),
    ).rejects.toThrow();
    const prepare = {
      batchId: randomUUID(),
      batchKind: 'DAILY' as const,
      modelVersion: 'TEST-cutoff',
      packageId: fixture.canonicalPackage,
      cutoffAt: new Date(answer!.gradedAt!.getTime() - 1).toISOString(),
    };
    const input = await integration.prepare(prepare);
    expect(input.responses.length).toBeGreaterThan(0);
    expect(input.responses.length).toBeLessThan(30);
    expect(input.responses.some((r) => r.attemptItemId === answer!.itemId)).toBe(false);
    expect(await integration.prepare(prepare)).toEqual(input);
    await expect(
      integration.prepare({ ...prepare, batchId: randomUUID(), cutoffAt: '2020-01-01T00:00:00' }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('hides legacy parameters flagged as insufficient even with thirty samples', async () => {
    const { db } = getDatabase();
    const [batch] = await db
      .insert(irtBatches)
      .values({ batchKind: 'DAILY', modelVersion: 'TEST-legacy', status: 'SUCCEEDED' })
      .returning();
    await db.insert(irtItemResults).values({
      batchId: batch!.id,
      questionVersionId: fixture.versionIds[0]!,
      sampleSize: 30,
      dataStatus: 'NOT_ENOUGH_DATA',
      difficultyB: '1',
    });
    const response = await fixture.request('admin/irt');
    const body = (await response.json()) as {
      items: { batchId: string; difficultyB: string | null }[];
    };
    expect(body.items.find((i) => i.batchId === batch!.id)).toMatchObject({ difficultyB: null });
  });
});
