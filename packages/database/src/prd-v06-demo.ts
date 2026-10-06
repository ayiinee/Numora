import { createHash } from 'node:crypto';
import { and, eq, like, or } from 'drizzle-orm';
import { getDatabase } from './client.js';
import { assessmentPackages, packageItems, scoringPolicyVersions } from './schema/index.js';

function fixtureId(label: string) {
  const bytes = createHash('sha256')
    .update(`NUMORA-PRD-V06-DEMO:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Explicit demo seed only. New package IDs preserve every legacy attempt/policy pin.
export async function seedPrdV06Demo(
  db: Pick<ReturnType<typeof getDatabase>['db'], 'insert' | 'select'>,
) {
  const [policy] = await db
    .select()
    .from(scoringPolicyVersions)
    .where(
      and(
        eq(scoringPolicyVersions.policyCode, 'DRILL_PRD_V06'),
        eq(scoringPolicyVersions.version, 1),
        eq(scoringPolicyVersions.status, 'PUBLISHED'),
      ),
    );
  if (!policy) throw new Error('Apply migration 0024 before seeding PRD v0.6 demo packages.');
  const sources = await db
    .select()
    .from(assessmentPackages)
    .where(
      and(
        eq(assessmentPackages.isDemo, true),
        eq(assessmentPackages.variantIndex, 1),
        or(
          like(assessmentPackages.familyCode, 'DEMO-DRILL-L1-V%'),
          like(assessmentPackages.familyCode, 'DEMO-UI-L%'),
        ),
      ),
    );
  for (const source of sources) {
    const items = await db.select().from(packageItems).where(eq(packageItems.packageId, source.id));
    if (items.length !== 10 || !source.levelId)
      throw new Error('PRD v0.6 demo source must contain ten level items.');
    const id = fixtureId(source.id);
    await db
      .insert(assessmentPackages)
      .values({
        id,
        familyCode: `DEMO-V06-${source.familyCode}`,
        packageVersion: 1,
        name: `DEMO PRD v0.6 — ${source.name}`,
        assessmentType: 'DRILL',
        purpose: 'REGULAR',
        chapterId: source.chapterId,
        levelId: source.levelId,
        variantIndex: 1,
        isDemo: true,
        scoringPolicyVersionId: policy.id,
        releaseAt: new Date(),
        status: 'PUBLISHED',
      })
      .onConflictDoNothing();
    const [existing] = await db
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, id));
    if (existing?.scoringPolicyVersionId !== policy.id || existing.levelId !== source.levelId)
      throw new Error('PRD v0.6 demo package conflicts with existing data.');
    await db
      .insert(packageItems)
      .values(
        items.map((item) => ({
          id: fixtureId(item.id),
          packageId: id,
          questionVersionId: item.questionVersionId,
          displayOrder: item.displayOrder,
          maxPoints: item.maxPoints,
        })),
      )
      .onConflictDoNothing();
    const seeded = await db.select().from(packageItems).where(eq(packageItems.packageId, id));
    if (
      seeded.length !== 10 ||
      seeded.some(
        (item) =>
          !items.some(
            (sourceItem) =>
              sourceItem.displayOrder === item.displayOrder &&
              sourceItem.questionVersionId === item.questionVersionId,
          ),
      )
    )
      throw new Error('PRD v0.6 demo items conflict with existing data.');
  }
  return sources.length;
}
