import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { tryoutBatchCloseAt } from './tryout-visibility.js';
import {
  assessmentPackages,
  chapters,
  competencies,
  levels,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
  users,
} from './schema/index.js';

/** Synthetic transport/lifecycle fixtures. Never a Curriculum-approved bank. */
export async function seedLifecycleDemo(namespace = randomUUID()) {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    !['test', 'development'].includes(process.env.NODE_ENV ?? '')
  )
    throw new Error('Lifecycle fixtures require isolated localhost PostgreSQL.');
  return getDatabase().db.transaction(async (tx) => {
    const [reviewer] = await tx
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'ADMIN',
        displayName: 'TEST ONLY content fixture',
        email: `${namespace}-fixture@example.test`,
      })
      .returning();
    const [chapter] = await tx
      .insert(chapters)
      .values({
        code: `DEMO-LIFECYCLE-${namespace}`,
        slug: `demo-lifecycle-${namespace}`,
        name: 'DEMO · Pretest dan Tryout',
        displayOrder: 100000 + Math.floor(Math.random() * 100000000),
        status: 'READY',
        materialCategory: 'numbers',
      })
      .returning();
    const subs = await tx
      .insert(subchapters)
      .values(
        [1, 2].map((number) => ({
          chapterId: chapter!.id,
          code: `DEMO-${namespace}-${number}`,
          slug: `demo-${namespace}-${number}`,
          name: `Subbab DEMO ${number}`,
          displayOrder: number,
          status: 'READY' as const,
        })),
      )
      .returning();
    await tx.insert(levels).values(
      subs.flatMap((sub) =>
        [1, 2, 3, 4, 5].map((levelNumber) => ({
          subchapterId: sub.id,
          levelNumber,
          description: `Level ${levelNumber} DEMO`,
          status: 'READY' as const,
        })),
      ),
    );
    const [competency] = await tx
      .insert(competencies)
      .values({
        subchapterId: subs[0]!.id,
        code: `DEMO-${namespace}`,
        description: 'TEST ONLY arithmetic transport',
        status: 'READY',
      })
      .returning();
    const [pretestPolicy] = await tx
      .insert(scoringPolicyVersions)
      .values({
        policyCode: `PRETEST_PG_DEMO_${namespace}`,
        version: 1,
        status: 'PUBLISHED',
        configuration: {
          testOnly: true,
          questionCount: 20,
          placement: 'PRD_V06_SYNTHETIC_CHAPTER',
        },
      })
      .returning();
    const [reward] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'TRYOUT_PRD_V06'),
          eq(scoringPolicyVersions.version, 1),
        ),
      );
    if (!reward) throw new Error('Apply normal migrations before lifecycle fixtures.');
    const local = new Date(Date.now() + 7 * 3600 * 1000);
    local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
    local.setUTCHours(0, 0, 0, 0);
    const releaseAt = new Date(local.getTime() - 7 * 3600 * 1000);
    // One demo publication per Monday; do not close or edit another fixture's package.
    const [alreadyOngoing] = await tx
      .select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'TRYOUT'),
          eq(assessmentPackages.status, 'PUBLISHED'),
          eq(assessmentPackages.releaseAt, releaseAt),
        ),
      );
    const [pretest] = await tx
      .insert(assessmentPackages)
      .values({
        familyCode: `DEMO-PRETEST-${namespace}`,
        packageVersion: 1,
        name: 'DEMO · Pretest 20 soal',
        assessmentType: 'PRETEST',
        chapterId: chapter!.id,
        isDemo: true,
        scoringPolicyVersionId: pretestPolicy!.id,
        status: 'PUBLISHED',
      })
      .returning();
    const [tryout] = await tx
      .insert(assessmentPackages)
      .values({
        familyCode: `DEMO-TRYOUT-${namespace}`,
        packageVersion: 1,
        name: 'DEMO · Tryout tiga format',
        assessmentType: 'TRYOUT',
        chapterId: chapter!.id,
        isDemo: true,
        scoringPolicyVersionId: reward.id,
        durationSeconds: 600,
        releaseAt,
        closeAt: tryoutBatchCloseAt(releaseAt),
        status: alreadyOngoing ? 'CLOSED' : 'PUBLISHED',
      })
      .returning();
    for (let i = 0; i < 50; i++) {
      const pretestItem = i < 20;
      const type =
        pretestItem || (i - 20) % 3 === 0
          ? 'SINGLE_CHOICE'
          : (i - 20) % 3 === 1
            ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
            : 'CATEGORY';
      const [family] = await tx
        .insert(questions)
        .values({
          primaryCompetencyId: competency!.id,
          sourceRef: `TEST-ONLY-${namespace}-${i}`,
          status: 'READY',
        })
        .returning();
      const [variant] = await tx
        .insert(questionVariants)
        .values({
          questionId: family!.id,
          variantCode: `DEMO-${namespace}-${i}`,
          kind: 'ORIGINAL',
          origin: 'TEST',
        })
        .returning();
      const labels =
        type === 'SINGLE_CHOICE'
          ? [String(i + 2), String(i + 3), String(i + 4), String(i + 5)]
          : type === 'CATEGORY'
            ? ['2 adalah genap', '3 adalah genap', '4 adalah genap', '5 adalah genap']
            : ['2', '3', '4', '5'];
      const options = labels.map((text, n) => ({
        id: ['A', 'B', 'C', 'D'][n]!,
        content: { text },
      }));
      const [version] = await tx
        .insert(questionVersions)
        .values({
          variantId: variant!.id,
          versionNumber: 1,
          questionType: type,
          stem: {
            text:
              type === 'SINGLE_CHOICE'
                ? `DEMO: Berapa ${i + 1} + 1?`
                : type === 'CATEGORY'
                  ? 'DEMO: Tentukan Benar/Salah untuk tiap pernyataan.'
                  : 'DEMO: Pilih semua bilangan genap.',
          },
          optionsOrStatements:
            type === 'SINGLE_CHOICE'
              ? options
              : {
                  options,
                  categories:
                    type === 'CATEGORY'
                      ? [
                          { id: 'Y', label: 'Benar' },
                          { id: 'N', label: 'Salah' },
                        ]
                      : [],
                },
          answerKey:
            type === 'SINGLE_CHOICE'
              ? { optionId: 'A' }
              : type === 'CATEGORY'
                ? { categoryByStatementId: { A: 'Y', B: 'N', C: 'Y', D: 'N' } }
                : { optionIds: ['A', 'C'] },
          explanation: {
            text: 'TEST/DEMO ONLY. PGK transport does not implement a numeric rubric.',
          },
          difficulty: 'EASY',
          contentStatus: 'READY',
          reviewedByUserId: reviewer!.id,
          reviewedAt: new Date(),
        })
        .returning();
      await tx.insert(packageItems).values({
        packageId: pretestItem ? pretest!.id : tryout!.id,
        questionVersionId: version!.id,
        displayOrder: pretestItem ? i + 1 : i - 19,
        maxPoints: type === 'SINGLE_CHOICE' ? '2' : '3',
      });
    }
    return {
      chapterId: chapter!.id,
      pretestPackageId: pretest!.id,
      tryoutPackageId: tryout!.id,
      tryoutStatus: tryout!.status,
    };
  });
}
