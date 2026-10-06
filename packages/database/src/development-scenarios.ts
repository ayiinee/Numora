import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { allowSyntheticContent } from './package-runtime.js';
import { presentFixtureText } from './fixture-presentation.js';
import { fixturePresentationManifest } from './fixture-presentation-manifest.js';
import {
  assessmentPackages,
  packageItems,
  questionVersions,
  scoringPolicyVersions,
  users,
} from './schema/index.js';

function canonical(value: unknown): string | undefined {
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => canonical(v)));
  if (value && typeof value === 'object')
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      ),
    );
  return JSON.stringify(value);
}
const namespace = 'NUMORA-DEVELOPMENT-SCENARIOS-V2';
function id(label: string) {
  const b = createHash('sha256').update(`${namespace}:${label}`).digest().subarray(0, 16);
  b[6] = (b[6]! & 15) | 80;
  b[8] = (b[8]! & 63) | 128;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Versioned replacements of verified existing fixture pools; no new academic rules. */
export async function seedDevelopmentScenarios() {
  if (!allowSyntheticContent())
    throw new Error('Development scenarios require verified isolation and explicit opt-in.');
  return getDatabase().db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${namespace}))`);
    const [reviewer] = await tx
      .select()
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')))
      .orderBy(asc(users.id))
      .limit(1);
    const [drillPolicy] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.policyCode, 'DRILL_PRD_V06'),
          eq(scoringPolicyVersions.version, 1),
          eq(scoringPolicyVersions.status, 'PUBLISHED'),
        ),
      );
    if (!reviewer || !drillPolicy)
      throw new Error('Prepared development identity and migrated policies are required.');
    const sourceIds = Object.entries(fixturePresentationManifest)
      .filter(([, entry]) => entry.name)
      .map(([key]) => key);
    const sources = await tx
      .select()
      .from(assessmentPackages)
      .where(inArray(assessmentPackages.id, sourceIds))
      .orderBy(asc(assessmentPackages.id));
    const selected = sources.filter(
      (p) =>
        p.isDemo &&
        ((p.assessmentType === 'DRILL' &&
          p.variantIndex === 1 &&
          ['00000000-', '03000000-', '04000000-'].some((prefix) => p.id.startsWith(prefix))) ||
          p.familyCode.startsWith('NUMORA-ASSESSMENT-MOCK-V1-') ||
          p.familyCode.startsWith('NUMORA-PVP-DEMO-V1:')),
    );
    if (selected.length !== 24)
      throw new Error('The reviewed 24 source scenario packages are required.');
    const protectedTables = [
      'assessment_attempts',
      'attempt_items',
      'attempt_answers',
      'xp_ledger',
      'analytics_outbox',
      'audit_logs',
    ];
    const fingerprints = async () => {
      const hashes = [];
      for (const table of protectedTables)
        hashes.push(
          await tx.execute(
            sql.raw(
              `select count(*)::int as count, md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')) as digest from public.${table} t`,
            ),
          ),
        );
      return JSON.stringify(hashes);
    };
    const before = await fingerprints();
    let versionsCreated = 0,
      packagesCreated = 0;
    for (const source of selected) {
      const items = await tx
        .select({ item: packageItems, version: questionVersions })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .where(eq(packageItems.packageId, source.id))
        .orderBy(asc(packageItems.displayOrder));
      const count = { PRETEST: 20, DRILL: 10, TRYOUT: 30, PVP: 10 }[source.assessmentType];
      if (items.length !== count) throw new Error('Scenario question count mismatch.');
      const packageId = id(`package:${source.id}`);
      const expectedItems: (typeof packageItems.$inferInsert)[] = [];
      for (const { item, version } of items) {
        const stem = version.stem as { text: string },
          explanation = version.explanation as { text: string };
        if (!stem.text?.trim() || !explanation.text?.trim() || !version.answerKey)
          throw new Error('Scenario content is incomplete.');
        const nextStem = presentFixtureText(version.id, 'stem', stem.text);
        const nextExplanation = presentFixtureText(version.id, 'explanation', explanation.text);
        let versionId = version.id;
        if (
          nextStem !== stem.text ||
          nextExplanation !== explanation.text ||
          version.contentStatus !== 'READY'
        ) {
          versionId = id(`version:${version.id}`);
          const original = { ...version };
          const expected = {
            ...original,
            id: versionId,
            versionNumber: version.versionNumber + 1,
            stem: { ...stem, text: nextStem },
            explanation: { ...explanation, text: nextExplanation },
            revisedFromQuestionVersionId: version.id,
            contentFingerprint: null,
            difficulty: version.difficulty === 'DEMO_EASY' ? 'EASY' : version.difficulty,
            contentStatus: 'READY' as const,
            reviewedByUserId: reviewer.id,
            reviewedAt: new Date(),
          };
          const inserted = await tx
            .insert(questionVersions)
            .values(expected)
            .onConflictDoNothing()
            .returning({ id: questionVersions.id });
          versionsCreated += inserted.length;
          const [stored] = await tx
            .select()
            .from(questionVersions)
            .where(eq(questionVersions.id, versionId));
          // Creation/review timestamps may differ on replay; mathematical fields must remain identical.
          for (const key of [
            'variantId',
            'versionNumber',
            'stem',
            'explanation',
            'optionsOrStatements',
            'answerKey',
            'scoringRubricVersionId',
          ] as const)
            if (canonical(stored?.[key]) !== canonical(expected[key]))
              throw new Error('Immutable scenario version drift.');
        }
        expectedItems.push({
          id: id(`item:${source.id}:${item.displayOrder}`),
          packageId,
          questionVersionId: versionId,
          displayOrder: item.displayOrder,
          maxPoints: item.maxPoints,
          rubricVersionId: item.rubricVersionId,
          maximumScoreCategory: item.maximumScoreCategory,
        });
      }
      const policyId =
        source.assessmentType === 'DRILL' ? drillPolicy.id : source.scoringPolicyVersionId;
      const expected = {
        id: packageId,
        familyCode: source.familyCode,
        packageVersion: source.packageVersion + 1,
        name: presentFixtureText(source.id, 'name', source.name),
        assessmentType: source.assessmentType,
        purpose: source.purpose,
        chapterId: source.chapterId,
        levelId: source.levelId,
        variantIndex: source.variantIndex,
        isDemo: true,
        scoringPolicyVersionId: policyId,
        durationSeconds: source.durationSeconds,
        releaseAt: source.releaseAt,
        closeAt: source.closeAt,
        status: 'DRAFT' as const,
      };
      const inserted = await tx
        .insert(assessmentPackages)
        .values(expected)
        .onConflictDoNothing()
        .returning({ id: assessmentPackages.id });
      packagesCreated += inserted.length;
      const [stored] = await tx
        .select()
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, packageId));
      if (
        !stored ||
        stored.scoringPolicyVersionId !== policyId ||
        stored.name !== expected.name ||
        !stored.isDemo
      )
        throw new Error('Scenario package drift.');
      if (inserted.length) {
        await tx.insert(packageItems).values(expectedItems);
        await tx
          .update(assessmentPackages)
          .set({ status: 'ARCHIVED' })
          .where(eq(assessmentPackages.id, source.id));
        await tx
          .update(assessmentPackages)
          .set({ status: 'PUBLISHED', frozenAt: new Date() })
          .where(eq(assessmentPackages.id, packageId));
      }
      // Existing ARCHIVED replacements stay archived. Never resurrect a fixture on replay.
      const storedItems = await tx
        .select()
        .from(packageItems)
        .where(eq(packageItems.packageId, packageId))
        .orderBy(asc(packageItems.displayOrder));
      if (
        storedItems.length !== count ||
        storedItems.some(
          (v, i) =>
            v.questionVersionId !== expectedItems[i]?.questionVersionId ||
            v.maxPoints !== expectedItems[i]?.maxPoints,
        )
      )
        throw new Error('Scenario package composition drift.');
    }
    if (before !== (await fingerprints()))
      throw new Error('Historical scenario data changed; rollback.');
    return { packages: selected.length, packagesCreated, versionsCreated };
  });
}
