import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  assessmentPackages,
  assessmentAttempts,
  attemptItems,
  auditLogs,
  getDatabase,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
} from '@tka/database';
import { DrillPackagesService } from './drill-packages.service';
import { IrtIntegrationService } from '../irt/irt-integration.service';
import { databaseSuite, installFerdiFixture } from './ferdi-content.fixture';
databaseSuite('Drill packages through HTTP/PostgreSQL', () => {
  const fixture = installFerdiFixture();
  it('rejects a question mapped to another curriculum level without changing package history', async () => {
    const { db } = getDatabase();
    const [row] = await db
      .select({ questionId: questionVariants.questionId })
      .from(questionVersions)
      .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
      .where(eq(questionVersions.id, fixture.versionIds[0]!));
    await db
      .update(questions)
      .set({ curriculumLevelNumber: 2 })
      .where(eq(questions.id, row!.questionId));
    try {
      expect(
        (
          await fixture.request('admin/content/drill-packages', 'POST', {
            ...fixture.body,
            familyCode: `TEST-LEVEL-${randomUUID()}`,
          })
        ).status,
      ).toBe(400);
    } finally {
      await db
        .update(questions)
        .set({ curriculumLevelNumber: null })
        .where(eq(questions.id, row!.questionId));
    }
  });
  it('protects new endpoints and rejects forged identity/invalid inputs', async () => {
    const { request, body, other, versionIds } = fixture;
    for (const token of ['', 'bad', 'student', 'teacher', 'disabled'])
      expect((await request('admin/content/drill-packages', 'GET', undefined, token)).status).toBe(
        token === '' || token === 'bad' ? 401 : 403,
      );
    expect(
      (await request('admin/content/drill-packages', 'POST', { ...body, actorId: other })).status,
    ).toBe(400);
    expect(
      (
        await request('admin/content/drill-packages', 'POST', {
          ...body,
          questionVersionIds: [versionIds[0], versionIds[0]],
        })
      ).status,
    ).toBe(400);
  });
  it('publishes complete packages once under concurrent requests and preserves pinned items', async () => {
    const { request, body, versionIds, policy, student } = fixture;
    const { db } = getDatabase();
    const created = await request('admin/content/drill-packages', 'POST', body);
    expect(created.status).toBe(201);
    const draft = ((await created.json()) as { id: string }).id;
    expect((await request('admin/content/drill-packages', 'POST', body)).status).toBe(409);
    const results = await Promise.all([
      request(`admin/content/drill-packages/${draft}/publish`, 'POST'),
      request(`admin/content/drill-packages/${draft}/publish`, 'POST'),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(
      (await (await request(`admin/content/drill-packages/${draft}`)).json()) as object,
    ).toMatchObject({ status: 'PUBLISHED', questionVersionIds: versionIds });
    expect(
      (
        await request(`admin/content/drill-packages/${draft}`, 'PATCH', {
          name: 'overwrite',
          scoringPolicyVersionId: policy,
          questionVersionIds: [],
        })
      ).status,
    ).toBe(409);
    const [packageItem] = await db
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, draft));
    const [attempt] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: student,
        packageId: draft,
        assessmentType: 'DRILL',
        levelIdAtStart: fixture.level,
        scoringPolicyVersionId: policy,
        status: 'GRADED',
        rawPoints: '1',
        score0To100: '100',
        startedAt: new Date(Date.now() - 1000),
        finishedAt: new Date(),
      })
      .returning();
    const [pinned] = await db
      .insert(attemptItems)
      .values({
        attemptId: attempt!.id,
        packageId: draft,
        packageItemId: packageItem!.id,
        questionVersionId: packageItem!.questionVersionId,
        displayOrder: 1,
        maxPoints: '1',
      })
      .returning();
    const [source] = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.id, packageItem!.questionVersionId));
    const [revised] = await db
      .insert(questionVersions)
      .values({
        ...source!,
        id: randomUUID(),
        versionNumber: source!.versionNumber + 1,
        stem: { text: 'TEST revised stem' },
      })
      .returning();
    const revision = await request('admin/content/drill-packages', 'POST', {
      ...body,
      packageVersion: 2,
      name: 'TEST revision',
      questionVersionIds: versionIds.map((id) =>
        id === packageItem!.questionVersionId ? revised!.id : id,
      ),
    });
    expect(revision.status).toBe(201);
    expect((await request(`admin/content/drill-packages/${draft}/archive`, 'POST')).status).toBe(
      201,
    );
    expect((await request(`admin/content/drill-packages/${draft}/publish`, 'POST')).status).toBe(
      409,
    );
    expect(
      await getDatabase().db.select().from(packageItems).where(eq(packageItems.packageId, draft)),
    ).toHaveLength(10);
    expect(
      (await db.select().from(attemptItems).where(eq(attemptItems.id, pinned!.id)))[0],
    ).toEqual(pinned);
    expect(
      (await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attempt!.id)))[0],
    ).toEqual(attempt);
    expect(
      (await db.select().from(questionVersions).where(eq(questionVersions.id, source!.id)))[0],
    ).toEqual(source);
  });
  it('reads incomplete legacy metadata honestly and rejects publication until configured', async () => {
    const { db } = getDatabase();
    const [legacy] = await db
      .insert(assessmentPackages)
      .values({
        familyCode: `LEGACY-${fixture.suffix}`,
        packageVersion: 1,
        name: 'TEST legacy draft',
        assessmentType: 'DRILL',
        levelId: fixture.level,
      })
      .returning();
    const detail = await fixture.request(`admin/content/drill-packages/${legacy!.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ variantIndex: null, scoringPolicyVersionId: null });
    const publication = await fixture.request(
      `admin/content/drill-packages/${legacy!.id}/publish`,
      'POST',
    );
    expect(publication.status).toBe(409);
    expect(await publication.json()).toMatchObject({ code: 'DRILL_PACKAGE_NOT_READY' });
  });
  it('plays an Admin-published package through the canonical engine, reports an answer and prepares IRT', async () => {
    const { request, body, suffix } = fixture;
    const draft = await request('admin/content/drill-packages', 'POST', {
      ...body,
      familyCode: `PLAYABLE-${suffix}`,
      variantIndex: 2,
    });
    expect(draft.status).toBe(201);
    const { id: packageId } = (await draft.json()) as { id: string };
    expect(
      (await request(`admin/content/drill-packages/${packageId}/publish`, 'POST')).status,
    ).toBe(201);
    const started = await request(
      'assessments/drill/attempts',
      'POST',
      { levelId: fixture.level },
      'student',
    );
    expect(started.status).toBe(201);
    const attempt = (await started.json()) as {
      id: string;
      questions: { questionInstanceId: string }[];
    };
    expect(attempt.questions).toHaveLength(10);
    const persisted = (
      await getDatabase()
        .db.select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attempt.id))
    )[0]!;
    expect(persisted.packageId).toBe(packageId);
    for (const question of attempt.questions) {
      expect(
        (
          await request(
            `assessment-attempts/${attempt.id}/answers/${question.questionInstanceId}`,
            'PATCH',
            { optionId: 'A' },
            'student',
          )
        ).status,
      ).toBe(200);
    }
    const result = await request(
      `assessment-attempts/${attempt.id}/submit`,
      'POST',
      undefined,
      'student',
    );
    expect(result.status).toBe(201);
    const graded = await result.json();
    expect(graded).toMatchObject({ score: 100, mastered: true });
    expect(
      await (
        await request(`assessment-attempts/${attempt.id}/submit`, 'POST', undefined, 'student')
      ).json(),
    ).toEqual(graded);
    const report = await request(
      'students/me/question-reports',
      'POST',
      {
        attemptItemId: attempt.questions[0]!.questionInstanceId,
        category: 'QUESTION',
        clientRequestId: randomUUID(),
      },
      'student',
    );
    expect(report.status).toBe(201);
    const input = await new IrtIntegrationService().prepare({
      batchId: randomUUID(),
      batchKind: 'DAILY',
      modelVersion: 'TEST-integrated',
      packageId,
      cutoffAt: new Date().toISOString(),
    });
    expect(input.responses).toHaveLength(10);
    expect(
      input.responses.every(
        (response) =>
          response.correct && response.scoringPolicyVersionId === persisted.scoringPolicyVersionId,
      ),
    ).toBe(true);
  });
  it('rejects publication with policies and option shapes unsupported by the canonical runtime', async () => {
    const { db } = getDatabase();
    const [unsupported] = await db
      .insert(scoringPolicyVersions)
      .values({
        policyCode: `TEST-unsupported-${fixture.suffix}`,
        version: 1,
        configuration: { assessmentType: 'DRILL' },
        status: 'PUBLISHED',
      })
      .returning();
    const service = new DrillPackagesService();
    const draft = await service.create(fixture.admin, {
      ...fixture.body,
      familyCode: `POLICY-${fixture.suffix}`,
      scoringPolicyVersionId: unsupported!.id,
    });
    await expect(service.publish(fixture.admin, draft.id)).rejects.toMatchObject({ status: 409 });
    const options = (
      await db
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, fixture.versionIds[0]!))
    )[0]!.optionsOrStatements;
    await db
      .update(questionVersions)
      .set({ optionsOrStatements: (options as unknown[]).slice(0, 2) })
      .where(eq(questionVersions.id, fixture.versionIds[0]!));
    try {
      const invalid = await service.create(fixture.admin, {
        ...fixture.body,
        familyCode: `OPTIONS-${fixture.suffix}`,
      });
      await expect(service.publish(fixture.admin, invalid.id)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      await db
        .update(questionVersions)
        .set({ optionsOrStatements: options })
        .where(eq(questionVersions.id, fixture.versionIds[0]!));
    }
  });
  it('rejects incomplete, unready and malformed content; rolls back audit failures', async () => {
    const { admin, body, suffix, versionIds } = fixture;
    const service = new DrillPackagesService();
    const incomplete = await service.create(admin, {
      ...body,
      familyCode: `SHORT-${suffix}`,
      questionVersionIds: versionIds.slice(0, 9),
    });
    await expect(service.publish(admin, incomplete.id)).rejects.toMatchObject({ status: 409 });
    const { db } = getDatabase();
    const malformed = await service.create(admin, { ...body, familyCode: `BAD-${suffix}` });
    await db
      .update(questionVersions)
      .set({ answerKey: { optionId: 'Z' } })
      .where(eq(questionVersions.id, versionIds[9]!));
    await expect(service.publish(admin, malformed.id)).rejects.toMatchObject({ status: 409 });
    await db
      .update(questionVersions)
      .set({ answerKey: { optionId: 'A' }, contentStatus: 'DRAFT' })
      .where(eq(questionVersions.id, versionIds[9]!));
    await expect(service.publish(admin, malformed.id)).rejects.toMatchObject({ status: 409 });
    await db
      .update(questionVersions)
      .set({ contentStatus: 'READY' })
      .where(eq(questionVersions.id, versionIds[9]!));
    await expect(
      service.create(randomUUID(), { ...body, familyCode: `ROLLBACK-${suffix}` }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await db
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.familyCode, `ROLLBACK-${suffix}`)),
    ).toHaveLength(0);
    expect(
      (await db.select().from(auditLogs).where(eq(auditLogs.entityId, malformed.id))).map(
        (a) => a.action,
      ),
    ).toEqual(['drill_package_created']);
  });
});
