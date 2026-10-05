import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { editorialPackageDigest } from './editorial-package-digest';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  getDatabase,
  packageItems,
  questionVariants,
  questionVersions,
  questions,
  scoringPolicyVersions,
  scoringRubricVersions,
  xpLedger,
} from '@tka/database';
import { finalizeTryout } from '@tka/assessment-engine';
import { databaseSuite, installFerdiFixture } from './ferdi-content.fixture';
databaseSuite('Admin publisher and engine gates (TEST ONLY approval)', () => {
  const fixture = installFerdiFixture();
  let allIds: string[] = [];
  async function bank() {
    if (allIds.length) return allIds;
    const { db } = getDatabase();
    const [v] = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.id, fixture.versionIds[0]!));
    const [variant] = await db
      .select()
      .from(questionVariants)
      .where(eq(questionVariants.id, v!.variantId));
    const [q] = await db.select().from(questions).where(eq(questions.id, variant!.questionId));
    allIds = [...fixture.versionIds];
    for (let i = 0; i < 20; i++) {
      const [newQ] = await db
        .insert(questions)
        .values({ ...q!, id: randomUUID() })
        .returning();
      const [newVariant] = await db
        .insert(questionVariants)
        .values({ questionId: newQ!.id, variantCode: 'ORIGINAL', kind: 'ORIGINAL', origin: 'TEST' })
        .returning();
      const [newV] = await db
        .insert(questionVersions)
        .values({ ...v!, id: randomUUID(), variantId: newVariant!.id })
        .returning();
      allIds.push(newV!.id);
    }
    return allIds;
  }
  it('guards approvals and pins, supports a single-package retry and separates latest/best stars', async () => {
    const { request, body } = fixture;
    const created = await request('admin/content/drill-packages', 'POST', {
      ...body,
      familyCode: `PUBLISH-${fixture.suffix}`,
    });
    expect(created.status).toBe(201);
    const p = await created.json();
    expect((await request(`admin/content/drill-packages/${p.id}/publish`, 'POST')).status).toBe(
      201,
    );
    const zeroStart = await (
      await request('assessments/drill/attempts', 'POST', { levelId: fixture.level }, 'other')
    ).json();
    const zeroResult = await (
      await request(`assessment-attempts/${zeroStart.id}/submit`, 'POST', undefined, 'other')
    ).json();
    expect(zeroResult).toMatchObject({ score: 0, stars: 0 });
    const zeroCatalog = await (
      await request(`subchapters/${fixture.subchapter}`, 'GET', undefined, 'other')
    ).json();
    expect(zeroCatalog.levels.find((l: { id: string }) => l.id === fixture.level)).toMatchObject({
      latestStars: 0,
      bestStars: 0,
    });
    const start = await request(
      'assessments/drill/attempts',
      'POST',
      { levelId: fixture.level },
      'student',
    );
    expect(start.status).toBe(201);
    const a = await start.json();
    expect(JSON.stringify(a.questions)).not.toContain('answerKey');
    expect(JSON.stringify(a.questions)).not.toContain('explanation');
    for (const q of a.questions)
      expect(
        (
          await request(
            `assessment-attempts/${a.id}/answers/${q.questionInstanceId}`,
            'PATCH',
            { answer: { optionId: 'A' } },
            'student',
          )
        ).status,
      ).toBe(200);
    const results = await Promise.all([
      request(`assessment-attempts/${a.id}/submit`, 'POST', undefined, 'student'),
      request(`assessment-attempts/${a.id}/submit`, 'POST', undefined, 'student'),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const first = await results[0]!.json();
    expect(first).toMatchObject({ score: 100, stars: 3 });
    expect(first.xp).toBeGreaterThanOrEqual(100);
    const retry = await (
      await request('assessments/drill/attempts', 'POST', { levelId: fixture.level }, 'student')
    ).json();
    expect(retry.id).not.toBe(a.id);
    const empty = await (
      await request(`assessment-attempts/${retry.id}/submit`, 'POST', undefined, 'student')
    ).json();
    expect(empty).toMatchObject({ score: 0, stars: 0 });
    const sub = await (
      await request(`subchapters/${fixture.subchapter}`, 'GET', undefined, 'student')
    ).json();
    expect(sub.levels.find((l: { id: string }) => l.id === fixture.level)).toMatchObject({
      latestStars: 0,
      bestStars: 3,
    });
    const { db } = getDatabase();
    expect(await db.select().from(xpLedger).where(eq(xpLedger.attemptId, a.id))).toHaveLength(1);
    await expect(
      db.update(packageItems).set({ maxPoints: '5' }).where(eq(packageItems.packageId, p.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(scoringPolicyVersions)
        .set({ configuration: { fake: true } })
        .where(eq(scoringPolicyVersions.id, fixture.policy)),
    ).rejects.toThrow();
    const replacement = await (
      await request('admin/content/drill-packages', 'POST', {
        ...body,
        familyCode: `REPLACEMENT-${fixture.suffix}`,
      })
    ).json();
    expect(
      (await request(`admin/content/drill-packages/${replacement.id}/publish`, 'POST')).status,
    ).toBe(201);
    expect(
      (await db.select().from(assessmentPackages).where(eq(assessmentPackages.id, p.id)))[0]!
        .status,
    ).toBe('ARCHIVED');
    expect(
      await (
        await request(`assessment-attempts/${a.id}/result`, 'GET', undefined, 'student')
      ).json(),
    ).toMatchObject({ score: 100, stars: 3 });
  });
  it('reviews exactly twenty same-chapter items, retains revisions and blocks production Pretest', async () => {
    const ids = await bank(),
      { db } = getDatabase();
    const [pinnedChapter] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, fixture.attemptId));
    // Fixture attempts omit chapter snapshot; derive it from the current published level catalog.
    const catalog = await (
      await fixture.request(`subchapters/${fixture.subchapter}`, 'GET', undefined, 'student')
    ).json();
    const chapterId = catalog.subchapter.chapterId;
    void pinnedChapter;
    const create = await fixture.request('admin/content/pretest-packages', 'POST', {
      familyCode: `PRE-${fixture.suffix}`,
      packageVersion: 1,
      name: 'TEST Pretest',
      chapterId,
      questionVersionIds: ids.slice(0, 10),
    });
    expect(create.status).toBe(201);
    const p = await create.json();
    expect(
      (
        await fixture.request(`admin/content/pretest-packages/${p.id}/review`, 'POST', {
          reason: 'TEST editorial',
        })
      ).status,
    ).toBe(409);
    const edit = {
      name: 'TEST reviewed Pretest',
      blueprintVersionId: null,
      questionVersionIds: ids.slice(0, 20),
    };
    expect(
      (await fixture.request(`admin/content/pretest-packages/${p.id}`, 'PUT', edit)).status,
    ).toBe(200);
    expect(
      (
        await fixture.request(`admin/content/pretest-packages/${p.id}/review`, 'POST', {
          reason: 'TEST editorial',
        })
      ).status,
    ).toBe(200);
    const detail = await (await fixture.request(`admin/content/pretest-packages/${p.id}`)).json();
    expect(detail).toMatchObject({ state: 'REVIEWED', reviewBlockers: [] });
    expect(detail.publicationBlockers).toContain('PRETEST_STUDENT_CONSUMER_REQUIRED');
    expect(
      (await fixture.request(`admin/content/pretest-packages/${p.id}/publish`, 'POST')).status,
    ).toBe(409);
    expect(
      (await fixture.request(`admin/content/pretest-packages/${p.id}`, 'PUT', edit)).status,
    ).toBe(409);
    const versions = await Promise.all([
      fixture.request(`admin/content/pretest-packages/${p.id}/revisions`, 'POST', edit),
      fixture.request(`admin/content/pretest-packages/${p.id}/revisions`, 'POST', edit),
    ]);
    expect(versions.map((r) => r.status)).toEqual([201, 201]);
    expect((await versions[0]!.json()).id).toBe((await versions[1]!.json()).id);
    expect(
      (await fixture.request('admin/content/pretest-packages', 'GET', undefined, 'student')).status,
    ).toBe(403);
  });
  it('publishes a weekly thirty-item Tryout and finalizes batch-close races with exactly one XP entry', async () => {
    const ids = await bank(),
      { db } = getDatabase();
    const [policy] = await db
      .insert(scoringPolicyVersions)
      .values({
        policyCode: 'NUMORA_TRYOUT_V06',
        version: (parseInt(fixture.suffix, 16) % 1000000000) + 1,
        status: 'PUBLISHED',
        approvedAt: new Date(),
        approvedByUserId: fixture.admin,
        approvalReference: 'TEST_ONLY_NOT_PRODUCT_APPROVAL',
        configuration: {
          contractVersion: 'NUMORA_ASSESSMENT_V1',
          assessmentType: 'TRYOUT',
          scoreRounding: 'HALF_UP',
          xpRounding: 'CEIL',
          itemPointRounding: 'HALF_UP',
          tryoutXpMultiplier: 10,
          itemWeights: { SINGLE_CHOICE: 2 },
        },
      })
      .returning();
    const release = new Date(
      Date.now() + (14 + (parseInt(fixture.suffix, 16) % 50000) * 7) * 86400000,
    );
    release.setUTCHours(17, 0, 0, 0);
    while (release.getUTCDay() !== 0) release.setUTCDate(release.getUTCDate() + 1);
    const draft = await (
      await fixture.request('admin/content/tryout-packages', 'POST', {
        familyCode: `TRY-${fixture.suffix}`,
        packageVersion: 1,
        name: 'TEST Tryout',
        questionVersionIds: ids,
      })
    ).json();
    const publish = await fixture.request(
      `admin/content/tryout-packages/${draft.id}/publish`,
      'POST',
      {
        scoringPolicyVersionId: policy!.id,
        releaseAt: release.toISOString(),
        durationSeconds: 3600,
      },
    );
    expect(publish.status, await publish.text()).toBe(201);
    // Synthetic runtime package deliberately past close, without mutating the publisher's immutable batch.
    const [p] = await db
      .insert(assessmentPackages)
      .values({
        assessmentType: 'TRYOUT',
        familyCode: `DUE-${fixture.suffix}`,
        packageVersion: 1,
        name: 'TEST closed batch',
        scoringPolicyVersionId: policy!.id,
        releaseAt: new Date(Date.now() - 8 * 86400000),
        closeAt: new Date(Date.now() - 1000),
        durationSeconds: 3600,
      })
      .returning();
    const items = await db
      .insert(packageItems)
      .values(
        ids.map((id, i) => ({
          packageId: p!.id,
          questionVersionId: id,
          displayOrder: i + 1,
          maxPoints: '2',
        })),
      )
      .returning();
    await db
      .update(assessmentPackages)
      .set({ status: 'PUBLISHED' })
      .where(eq(assessmentPackages.id, p!.id));
    const [attempt] = await db
      .insert(assessmentAttempts)
      .values({
        assessmentType: 'TRYOUT',
        studentId: fixture.student,
        tryoutXpPolicyVersion: 1,
        packageId: p!.id,
        scoringPolicyVersionId: policy!.id,
        startedAt: new Date(Date.now() - 10000),
        deadlineAt: new Date(Date.now() + 3600000),
      })
      .returning();
    const pins = await db
      .insert(attemptItems)
      .values(
        items.map((i) => ({
          attemptId: attempt!.id,
          packageId: p!.id,
          packageItemId: i.id,
          questionVersionId: i.questionVersionId,
          displayOrder: i.displayOrder,
          maxPoints: '2',
        })),
      )
      .returning();
    for (const pin of pins.slice(0, 15))
      await db.insert(attemptAnswers).values({ attemptItemId: pin.id, answer: { optionId: 'A' } });
    const races = await Promise.all([
      finalizeTryout({ kind: 'automatic', attemptId: attempt!.id }),
      finalizeTryout({ kind: 'manual', attemptId: attempt!.id, studentId: fixture.student }),
    ]);
    expect(races.filter((r) => r.finalized)).toHaveLength(1);
    expect(
      (await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attempt!.id)))[0],
    ).toMatchObject({ status: 'GRADED', score0To100: '50.00' });
    const xp = await db
      .select()
      .from(xpLedger)
      .where(and(eq(xpLedger.attemptId, attempt!.id), eq(xpLedger.sourceType, 'TRYOUT')));
    expect(xp).toHaveLength(1);
    expect(Number(xp[0]!.xpAmount)).toBe(150);
    const grades = await db
      .select()
      .from(attemptAnswers)
      .innerJoin(attemptItems, eq(attemptItems.id, attemptAnswers.attemptItemId))
      .where(eq(attemptItems.attemptId, attempt!.id));
    expect(grades).toHaveLength(30);
    expect(grades.every((g) => g.attempt_answers.scoreCategory !== null)).toBe(true);
  });
  it('authorizes pinned media by owner and review phase without leaking explanation media during work', async () => {
    const { db } = getDatabase();
    const [source] = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.id, fixture.versionIds[0]!));
    const assets = [
      {
        assetId: 'stem',
        placement: 'STEM',
        objectKey: 'fixture-stem',
        bucket: 'TEST',
        altText: 'TEST stem',
      },
      {
        assetId: 'secret',
        placement: 'EXPLANATION',
        objectKey: 'fixture-secret',
        bucket: 'TEST',
        altText: 'TEST explanation',
      },
    ];
    const [copy] = await db
      .insert(questionVersions)
      .values({ ...source!, id: randomUUID(), versionNumber: 99, media: assets })
      .returning();
    const [p] = await db
      .insert(assessmentPackages)
      .values({
        assessmentType: 'DRILL',
        familyCode: `MEDIA-${fixture.suffix}`,
        packageVersion: 1,
        name: 'TEST media',
        levelId: fixture.level,
        scoringPolicyVersionId: fixture.policy,
      })
      .returning();
    const [item] = await db
      .insert(packageItems)
      .values({ packageId: p!.id, questionVersionId: copy!.id, displayOrder: 1, maxPoints: '1' })
      .returning();
    const [a] = await db
      .insert(assessmentAttempts)
      .values({
        studentId: fixture.student,
        packageId: p!.id,
        assessmentType: 'DRILL',
        levelIdAtStart: fixture.level,
        scoringPolicyVersionId: fixture.policy,
      })
      .returning();
    const [pin] = await db
      .insert(attemptItems)
      .values({
        attemptId: a!.id,
        packageId: p!.id,
        packageItemId: item!.id,
        questionVersionId: copy!.id,
        displayOrder: 1,
        maxPoints: '1',
      })
      .returning();
    const path = `assessment-attempts/${a!.id}/media`,
      body = { instanceId: pin!.id, phase: 'WORK', assetIds: ['stem'] };
    expect((await fixture.request(path, 'POST', body, 'other')).status).toBe(404);
    expect(
      (await fixture.request(path, 'POST', { ...body, assetIds: ['secret'] }, 'student')).status,
    ).toBe(400);
    expect(
      (
        await fixture.request(
          path,
          'POST',
          { ...body, phase: 'REVIEW', assetIds: ['secret'] },
          'student',
        )
      ).status,
    ).toBe(409);
    const allowed = await fixture.request(path, 'POST', body, 'student');
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      media: [{ assetId: 'stem', altText: 'TEST stem' }],
    });
    await db
      .update(assessmentAttempts)
      .set({ status: 'GRADED', finishedAt: new Date() })
      .where(eq(assessmentAttempts.id, a!.id));
    const reviewed = await fixture.request(
      path,
      'POST',
      { ...body, phase: 'REVIEW', assetIds: ['secret'] },
      'student',
    );
    expect(reviewed.status, await reviewed.text()).toBe(200);
  });
  it('supports editorial pins under the restricted main role and rejects partial approval evidence', async () => {
    const { db } = getDatabase();
    await expect(
      db.insert(scoringPolicyVersions).values({
        policyCode: `PARTIAL-${fixture.suffix}`,
        version: 1,
        status: 'DRAFT',
        configuration: {},
        approvedAt: new Date(),
        approvedByUserId: fixture.admin,
        approvalReference: null,
      }),
    ).rejects.toThrow();
    const created = await fixture.request('admin/content/drill-packages', 'POST', {
      ...fixture.body,
      familyCode: `ROLE-${fixture.suffix}`,
    });
    expect(created.status).toBe(201);
    const p = await created.json();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role numora_main_runtime`);
      await tx
        .update(assessmentPackages)
        .set({ status: 'ARCHIVED' })
        .where(
          and(
            eq(assessmentPackages.assessmentType, 'DRILL'),
            eq(assessmentPackages.levelId, fixture.level),
            eq(assessmentPackages.status, 'PUBLISHED'),
          ),
        );
      const digest = await editorialPackageDigest(tx, p.id);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      await tx
        .update(assessmentPackages)
        .set({ manifestDigest: digest, status: 'PUBLISHED' })
        .where(eq(assessmentPackages.id, p.id));
    });
    await expect(
      db.update(packageItems).set({ maxPoints: '99' }).where(eq(packageItems.packageId, p.id)),
    ).rejects.toThrow();
  });
  it('grades approved MCMA and Category pins without treating partial credit as full correctness', async () => {
    const { db } = getDatabase();
    const ids = [...fixture.versionIds];
    for (const [index, type] of [
      [0, 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'],
      [1, 'CATEGORY'],
    ] as const) {
      const [source] = await db
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, ids[index]!));
      const entries = Array.from({ length: 3 }, (_, correct) =>
        Array.from({ length: 3 }, (_, wrong) => ({
          correct,
          wrong,
          category: wrong ? 0 : correct,
        })),
      )
        .flat()
        .filter((e) => type !== 'CATEGORY' || e.correct + e.wrong <= 2);
      const definition = { contractVersion: 'NUMORA_PGK_LOOKUP_V1', entries };
      const [digest] = await db.execute<{ digest: string }>(
        sql`select irt_compute.payload_digest(${JSON.stringify(definition)}::jsonb) as digest`,
      );
      const [rubric] = await db
        .insert(scoringRubricVersions)
        .values({
          code: `TEST-${type}-${fixture.suffix}`,
          version: 1,
          questionType: type,
          maximumScoreCategory: 2,
          definition,
          digest: digest!.digest,
          status: 'SEALED',
          approvedByUserId: fixture.admin,
          approvedAt: new Date(),
        })
        .returning();
      const options =
        type === 'CATEGORY'
          ? {
              options: [
                { id: 'S1', content: { text: 'First' } },
                { id: 'S2', content: { text: 'Second' } },
              ],
              categories: [
                { id: 'Y', label: 'Ya' },
                { id: 'N', label: 'Tidak' },
              ],
            }
          : { options: source!.optionsOrStatements };
      const [v] = await db
        .insert(questionVersions)
        .values({
          ...source!,
          id: randomUUID(),
          versionNumber: 200,
          questionType: type,
          optionsOrStatements: options,
          answerKey:
            type === 'CATEGORY'
              ? { categoryByStatementId: { S1: 'Y', S2: 'N' } }
              : { optionIds: ['A', 'B'] },
          scoringRubricVersionId: rubric!.id,
        })
        .returning();
      ids[index] = v!.id;
    }
    const [policy] = await db
      .insert(scoringPolicyVersions)
      .values({
        policyCode: 'NUMORA_DRILL_V06',
        version: (parseInt(fixture.suffix, 16) % 1000000000) + 1000000001,
        status: 'PUBLISHED',
        approvedByUserId: fixture.admin,
        approvedAt: new Date(),
        approvalReference: 'TEST_ONLY_NOT_CURRICULUM_APPROVAL',
        configuration: {
          contractVersion: 'NUMORA_ASSESSMENT_V1',
          assessmentType: 'DRILL',
          scoreRounding: 'HALF_UP',
          xpRounding: 'HALF_UP',
          itemPointRounding: 'HALF_UP',
          drillXpBasis: 'EQUIVALENT_CORRECT',
          lowPartialStars: 0,
          itemWeights: { SINGLE_CHOICE: 2, MULTIPLE_CHOICE_MULTIPLE_ANSWER: 3, CATEGORY: 3 },
        },
      })
      .returning();
    const created = await fixture.request('admin/content/drill-packages', 'POST', {
      ...fixture.body,
      familyCode: `PGK-${fixture.suffix}`,
      scoringPolicyVersionId: policy!.id,
      questionVersionIds: ids,
    });
    expect(created.status).toBe(201);
    const p = await created.json();
    const published = await fixture.request(`admin/content/drill-packages/${p.id}/publish`, 'POST');
    expect(published.status, await published.text()).toBe(201);
    const a = await (
      await fixture.request(
        'assessments/drill/attempts',
        'POST',
        { levelId: fixture.level },
        'student',
      )
    ).json();
    for (const [i, q] of a.questions.entries()) {
      const answer =
        i === 0
          ? { optionIds: ['A'] }
          : i === 1
            ? { categoryByStatementId: { S1: 'Y' } }
            : { optionId: 'A' };
      expect(
        (
          await fixture.request(
            `assessment-attempts/${a.id}/answers/${q.questionInstanceId}`,
            'PATCH',
            { answer },
            'student',
          )
        ).status,
      ).toBe(200);
    }
    const result = await (
      await fixture.request(`assessment-attempts/${a.id}/submit`, 'POST', undefined, 'student')
    ).json();
    expect(result).toMatchObject({
      rawPoints: 19,
      score: 86,
      correctCount: 8,
      stars: 2,
      mastered: true,
    });
    const grade = await db
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptItemId, a.questions[0].questionInstanceId));
    expect(grade[0]).toMatchObject({
      scoreCategory: 1,
      fullyCorrect: false,
      awardedPoints: '1.50',
      responseState: 'RESPONDED',
    });
    expect(result.questions[0]).toMatchObject({
      answerKey: { optionIds: ['A', 'B'] },
      fullyCorrect: false,
    });
  });
});
