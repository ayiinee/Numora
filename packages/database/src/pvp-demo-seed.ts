import { allowSyntheticContent } from './package-runtime.js';
import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { presentFixtureText } from './fixture-presentation.js';
import {
  assessmentPackages,
  chapters,
  competencies,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringPolicyVersions,
  subchapters,
  users,
} from './schema/index.js';

const namespace = 'NUMORA-PVP-DEMO-V1';
export function pvpDemoId(label: string) {
  const bytes = createHash('sha256').update(`${namespace}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function assertPvpDemoTarget(env: NodeJS.ProcessEnv = process.env) {
  if (!allowSyntheticContent(env)) throw new Error('Development/test fixture opt-in is required.');
}

/** Additive, opt-in fixtures: no accounts, XP, progress or official content publication. */
export async function seedPvpDemo() {
  assertPvpDemoTarget();
  const { db } = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${namespace}))`);
    const [policy] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'PVP_PRD_V06'),
          eq(scoringPolicyVersions.version, 1),
          eq(scoringPolicyVersions.status, 'PUBLISHED'),
        ),
      );
    if (!policy) throw new Error('Apply the PvP activation migration before seeding.');
    const chapterId = pvpDemoId('chapter'),
      subchapterId = pvpDemoId('subchapter'),
      competencyId = pvpDemoId('competency');
    await tx
      .insert(chapters)
      .values({
        id: chapterId,
        code: namespace,
        slug: 'pvp-demo-v1',
        name: 'PvP DEMO — bukan bank resmi',
        displayOrder: 900001,
        status: 'READY',
      })
      .onConflictDoNothing();
    await tx
      .insert(subchapters)
      .values({
        id: subchapterId,
        chapterId,
        code: namespace,
        slug: 'pvp-demo-v1',
        name: 'DEMO transport pertandingan',
        displayOrder: 1,
        status: 'READY',
      })
      .onConflictDoNothing();
    await tx
      .insert(competencies)
      .values({
        id: competencyId,
        subchapterId,
        code: namespace,
        description: 'DEMO ONLY: difficulty sintetis untuk QA; bukan pengesahan Curriculum.',
        status: 'READY',
      })
      .onConflictDoNothing();
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const packageId = pvpDemoId(`package:${difficulty}`);
      const expected = Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return {
          id: pvpDemoId(`version:${difficulty}:${n}`),
          variantId: pvpDemoId(`variant:${difficulty}:${n}`),
          versionNumber: 1,
          questionType: 'SINGLE_CHOICE' as const,
          stem: { text: `DEMO ${n}: ${n} + ${n} = …` },
          optionsOrStatements: [
            { id: 'A', content: { text: String(n * 2) } },
            { id: 'B', content: { text: String(n * 2 + 1) } },
            { id: 'C', content: { text: String(n * 2 + 2) } },
            { id: 'D', content: { text: String(n * 2 + 3) } },
          ],
          answerKey: { optionId: 'A' },
          explanation: { text: `DEMO: ${n} + ${n} = ${n * 2}.` },
          difficulty: difficulty.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
        };
      });
      for (const [i, v] of expected.entries()) {
        const questionId = pvpDemoId(`question:${difficulty}:${i + 1}`);
        await tx
          .insert(questions)
          .values({
            id: questionId,
            primaryCompetencyId: competencyId,
            sourceRef: `${namespace}:${difficulty}:${i + 1}`,
            status: 'READY',
          })
          .onConflictDoNothing();
        await tx
          .insert(questionVariants)
          .values({
            id: v.variantId,
            questionId,
            variantCode: `${namespace}:${difficulty}:${i + 1}`,
            kind: 'ORIGINAL',
            origin: 'DEMO',
          })
          .onConflictDoNothing();
        await tx.insert(questionVersions).values(v).onConflictDoNothing();
        const [stored] = await tx
          .select()
          .from(questionVersions)
          .where(eq(questionVersions.id, v.id));
        const same = (a: unknown, b: unknown): boolean => {
          if (a && b && typeof a === 'object' && typeof b === 'object') {
            const aa = a as Record<string, unknown>,
              bb = b as Record<string, unknown>;
            return (
              Object.keys(aa).length === Object.keys(bb).length &&
              Object.keys(aa).every((k) => same(aa[k], bb[k]))
            );
          }
          return a === b;
        };
        if (
          !stored ||
          Object.entries(v).some(
            ([k, value]) => !same(value, (stored as Record<string, unknown>)[k]),
          )
        )
          throw new Error(
            'PvP DEMO seed drift; publish a new fixture version instead of overwriting.',
          );
      }
      const [existingPack] = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, packageId));
      if (!existingPack)
        await tx.insert(assessmentPackages).values({
          id: packageId,
          familyCode: `${namespace}:${difficulty}`,
          packageVersion: 1,
          name: `PvP DEMO ${difficulty}`,
          assessmentType: 'PVP',
          isDemo: true,
          status: 'DRAFT',
          scoringPolicyVersionId: policy.id,
          releaseAt: new Date('2026-01-01T00:00:00Z'),
        });
      const [pack] = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, packageId));
      if (
        !pack?.isDemo ||
        pack.status !== (existingPack ? 'PUBLISHED' : 'DRAFT') ||
        pack.scoringPolicyVersionId !== policy.id
      )
        throw new Error('PvP DEMO package drift; no data was overwritten.');
      if (!existingPack)
        await tx.insert(packageItems).values(
          expected.map((v, i) => ({
            id: pvpDemoId(`item:${difficulty}:${i + 1}`),
            packageId,
            questionVersionId: v.id,
            displayOrder: i + 1,
            maxPoints: '150',
          })),
        );
      const items = await tx
        .select()
        .from(packageItems)
        .where(eq(packageItems.packageId, packageId));
      if (
        items.length !== 10 ||
        items.some(
          (item) =>
            item.questionVersionId !== expected[item.displayOrder - 1]?.id ||
            Number(item.maxPoints) !== 150,
        )
      )
        throw new Error('PvP DEMO items drift; no data was overwritten.');
      // Use the same canonical PostgreSQL manifest as measurement_package_guard.
      const [manifest] = await tx.execute<{
        digest: string;
      }>(sql`select irt_compute.payload_digest(jsonb_build_object(
        'packageId',p.id,'blueprintVersionId',p.blueprint_version_id,'scoringPolicyVersionId',p.scoring_policy_version_id,
        'items',(select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.package_items i where i.package_id=p.id)
      )) as digest from public.assessment_packages p where p.id=${packageId}`);
      if (existingPack && (!pack.frozenAt || pack.manifestDigest !== manifest?.digest))
        throw new Error('PvP DEMO manifest drift; no data was overwritten.');
      if (!existingPack)
        await tx
          .update(assessmentPackages)
          .set({ status: 'PUBLISHED', frozenAt: new Date() })
          .where(eq(assessmentPackages.id, packageId));
    }
    return { packages: 3, questions: 30, isDemo: true };
  });
}

/** Fresh READY pools for connected localhost tests; immutable V1 content stays intact. */
export async function seedPvpTestScenarios() {
  if (process.env.NODE_ENV !== 'test' || !allowSyntheticContent())
    throw new Error('READY PvP test scenarios require an isolated test database.');
  await seedPvpDemo();
  return getDatabase().db.transaction(async (tx) => {
    const [reviewer] = await tx
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'ADMIN',
        displayName: 'Fixture reviewer',
        email: `${randomUUID()}@example.test`,
      })
      .returning();
    const packages = new Map<string, string>();
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const [source] = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, pvpDemoId(`package:${difficulty}`)));
      const [pack] = await tx
        .insert(assessmentPackages)
        .values({
          ...source!,
          id: randomUUID(),
          familyCode: `TEST_ONLY_${randomUUID()}`,
          packageVersion: 1,
          name: `PvP ${difficulty}`,
          status: 'DRAFT',
          frozenAt: null,
        })
        .returning();
      const items = await tx
        .select({ item: packageItems, version: questionVersions })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .where(eq(packageItems.packageId, source!.id));
      if (items.length !== 10) throw new Error('PvP test pool must contain ten questions.');
      for (const { item, version } of items) {
        const [latest] = await tx
          .select()
          .from(questionVersions)
          .where(eq(questionVersions.variantId, version.variantId))
          .orderBy(desc(questionVersions.versionNumber))
          .limit(1);
        const stem = version.stem as { text: string },
          explanation = version.explanation as { text: string };
        const [ready] = await tx
          .insert(questionVersions)
          .values({
            ...version,
            id: randomUUID(),
            versionNumber: latest!.versionNumber + 1,
            stem: { ...stem, text: presentFixtureText(version.id, 'stem', stem.text) },
            explanation: {
              ...explanation,
              text: presentFixtureText(version.id, 'explanation', explanation.text),
            },
            contentStatus: 'READY',
            reviewedByUserId: reviewer!.id,
            reviewedAt: new Date(),
            revisedFromQuestionVersionId: version.id,
            contentFingerprint: null,
          })
          .returning();
        await tx
          .insert(packageItems)
          .values({
            packageId: pack!.id,
            questionVersionId: ready!.id,
            displayOrder: item.displayOrder,
            maxPoints: item.maxPoints,
          });
      }
      await tx
        .update(assessmentPackages)
        .set({ status: 'PUBLISHED', frozenAt: new Date() })
        .where(eq(assessmentPackages.id, pack!.id));
      packages.set(difficulty, pack!.id);
    }
    return packages;
  });
}
