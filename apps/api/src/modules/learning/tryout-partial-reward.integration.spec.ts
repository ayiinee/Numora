import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptAnswers,
  attemptItems,
  getDatabase,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  scoringRubricVersions,
  xpLedger,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';

databaseSuite('Tryout partial reward HTTP submit regression (TEST ONLY)', () => {
  const fixture = installFerdiFixture();
  it.each([
    { decisions: 4, maxPoints: '3', awardedPoints: '0.75', xp: 2.5, type: 'CATEGORY' as const },
    {
      decisions: 3,
      maxPoints: '1',
      awardedPoints: '0.67',
      xp: 6.7,
      type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' as const,
    },
    {
      decisions: 3,
      maxPoints: '2',
      awardedPoints: '1.33',
      xp: 6.65,
      type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' as const,
    },
    {
      decisions: 3,
      maxPoints: '3',
      awardedPoints: '1.00',
      xp: 3.333333,
      type: 'CATEGORY' as const,
    },
  ])(
    'persists $awardedPoints/$maxPoints and exactly $xp XP ($type)',
    async (scenario) => {
      const { db } = getDatabase();
      const suffix = randomUUID();
      const [policy] = await db
        .select()
        .from(scoringPolicyVersions)
        .where(
          and(
            eq(scoringPolicyVersions.policyCode, 'TRYOUT_PGK_PARTIAL_V1'),
            eq(scoringPolicyVersions.version, 1),
          ),
        );
      expect(policy).toBeDefined();
      const [template] = await db
        .select()
        .from(questionVersions)
        .where(eq(questionVersions.id, fixture.versionIds[0]!));
      const [variant] = await db
        .select()
        .from(questionVariants)
        .where(eq(questionVariants.id, template!.variantId));
      const [family] = await db
        .select()
        .from(questions)
        .where(eq(questions.id, variant!.questionId));
      const [rubric] = await db
        .insert(scoringRubricVersions)
        .values({
          code: `TEST-partial-${suffix}`,
          version: 1,
          questionType: scenario.type,
          maximumScoreCategory: scenario.decisions,
          status: 'SEALED',
          approvedAt: new Date(),
          approvedByUserId: fixture.admin,
          digest: `TEST_ONLY_${suffix}`,
          definition: {
            policyCode: 'TRYOUT_PGK_PARTIAL_V1',
            version: 1,
            questionType: scenario.type,
            decisionCount: scenario.decisions,
            fullyCorrectCategory: scenario.decisions,
            unanswered: 0,
            points: 'round(correctDecisions / decisionCount * maxPoints, 2)',
            approvedDecision: 'PROJECT_OWNER_2026_10_07',
            categories: Array.from({ length: scenario.decisions + 1 }, (_, i) => i),
          },
        })
        .returning();
      const [pack] = await db
        .insert(assessmentPackages)
        .values({
          familyCode: `TEST-partial-${suffix}`,
          packageVersion: 1,
          name: 'TEST ONLY partial reward',
          assessmentType: 'TRYOUT',
          scoringPolicyVersionId: policy!.id,
          status: 'DRAFT',
          releaseAt: new Date(Date.now() - 1000),
          closeAt: new Date(Date.now() + 86400000),
          durationSeconds: 600,
        })
        .returning();
      const itemPins: (typeof packageItems.$inferInsert)[] = [];
      for (let index = 0; index < 30; index++) {
        const [q] = await db
          .insert(questions)
          .values({ ...family!, id: randomUUID(), usageType: 'TRYOUT' })
          .returning();
        const [v] = await db
          .insert(questionVariants)
          .values({
            questionId: q!.id,
            variantCode: `TEST-${suffix}-${index}`,
            kind: 'ORIGINAL',
            origin: 'TEST',
          })
          .returning();
        const options = Array.from({ length: scenario.decisions }, (_, i) => ({
          id: String.fromCharCode(65 + i),
          content: { text: 'TEST ONLY' },
        }));
        const [version] = await db
          .insert(questionVersions)
          .values({
            ...template!,
            id: randomUUID(),
            variantId: v!.id,
            ...(index === 0
              ? {
                  questionType: scenario.type,
                  scoringRubricVersionId: rubric!.id,
                  optionsOrStatements: {
                    options,
                    categories:
                      scenario.type === 'CATEGORY'
                        ? [
                            { id: 'Y', label: 'Ya' },
                            { id: 'N', label: 'Tidak' },
                          ]
                        : [],
                  },
                  answerKey:
                    scenario.type === 'CATEGORY'
                      ? {
                          categoryByStatementId: Object.fromEntries(
                            options.map((o) => [o.id, 'Y']),
                          ),
                        }
                      : { optionIds: ['A'] },
                }
              : {}),
          })
          .returning();
        itemPins.push({
          packageId: pack!.id,
          questionVersionId: version!.id,
          displayOrder: index + 1,
          maxPoints: index === 0 ? scenario.maxPoints : '1',
          rubricVersionId: index === 0 ? rubric!.id : null,
          maximumScoreCategory: index === 0 ? scenario.decisions : 1,
        });
      }
      const items = await db.insert(packageItems).values(itemPins).returning();
      await db
        .update(assessmentPackages)
        .set({ status: 'PUBLISHED' })
        .where(eq(assessmentPackages.id, pack!.id));
      const [attempt] = await db
        .insert(assessmentAttempts)
        .values({
          assessmentType: 'TRYOUT',
          studentId: fixture.student,
          packageId: pack!.id,
          scoringPolicyVersionId: policy!.id,
          tryoutXpPolicyVersion: 1,
          deadlineAt: new Date(Date.now() + 600000),
        })
        .returning();
      const pins = await db
        .insert(attemptItems)
        .values(
          items.map((item) => ({
            attemptId: attempt!.id,
            packageId: pack!.id,
            packageItemId: item.id,
            questionVersionId: item.questionVersionId,
            displayOrder: item.displayOrder,
            maxPoints: item.maxPoints,
            rubricVersionId: item.rubricVersionId,
            maximumScoreCategory: item.maximumScoreCategory,
          })),
        )
        .returning();
      const first = pins.find((pin) => pin.displayOrder === 1)!;
      const answer =
        scenario.type === 'CATEGORY'
          ? {
              categoryByStatementId: Object.fromEntries(
                Array.from({ length: scenario.decisions }, (_, i) => [
                  String.fromCharCode(65 + i),
                  i === 0 ? 'Y' : 'N',
                ]),
              ),
            }
          : { optionIds: ['A', 'B'] };
      const path = `tryout/attempts/${attempt!.id}`;
      const saved = await fixture.request(
        `${path}/answers/${first.id}`,
        'PATCH',
        { answer },
        'student',
      );
      expect(saved.status, await saved.text()).toBe(200);
      const forbidden = await fixture.request(`${path}/submit`, 'POST', undefined, 'other');
      expect(forbidden.status).toBe(404);
      const submissions = await Promise.all([
        fixture.request(`${path}/submit`, 'POST', undefined, 'student'),
        fixture.request(`${path}/submit`, 'POST', undefined, 'student'),
      ]);
      for (const response of submissions) {
        const body = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(201);
        expect(body).toMatchObject({ state: 'waitingIrt', xp: scenario.xp, xpPolicyVersion: 1 });
      }
      const [grade] = await db
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptItemId, first.id));
      expect(grade!.awardedPoints).toBe(scenario.awardedPoints);
      const [completed] = await db
        .select()
        .from(assessmentAttempts)
        .where(eq(assessmentAttempts.id, attempt!.id));
      expect(completed).toMatchObject({ status: 'GRADED', scoringPolicyVersionId: policy!.id });
      const rewards = await db.select().from(xpLedger).where(eq(xpLedger.attemptId, attempt!.id));
      expect(rewards).toHaveLength(1);
      expect(Number(rewards[0]!.xpAmount)).toBe(scenario.xp);
      // The trigger must reject the old ceiling even before the unique-source check.
      await expect(
        db.insert(xpLedger).values({
          ...rewards[0]!,
          id: randomUUID(),
          xpAmount: Math.ceil(scenario.xp),
          baseXp: Math.ceil(scenario.xp),
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
      await expect(
        db.update(xpLedger).set({ xpAmount: 0 }).where(eq(xpLedger.attemptId, attempt!.id)),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
      expect((await fixture.request(`${path}/result`, 'GET', undefined, 'student')).status).toBe(
        409,
      );
    },
    60_000,
  );
});
