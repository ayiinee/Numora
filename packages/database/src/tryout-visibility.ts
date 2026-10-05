import { getDatabase } from './client.js';
import { irtBatches, irtItemResults, packageItems, assessmentPackages } from './schema/index.js';
import { and, eq, inArray, isNotNull, lte, desc, sql } from 'drizzle-orm';
export function isJakartaMondayMidnight(instant: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return (
    value('weekday') === 'Monday' &&
    value('hour') === '00' &&
    value('minute') === '00' &&
    value('second') === '00' &&
    instant.getUTCMilliseconds() === 0
  );
}

export async function releasedTryoutPackageTimes(
  packageIds: string[],
  now = new Date(),
): Promise<Map<string, Date>> {
  if (!packageIds.length) return new Map();
  const { db } = getDatabase();
  const batches = await db
    .select({ id: irtBatches.id, packageId: irtBatches.packageId, releasedAt: irtBatches.resultReleasedAt })
    .from(irtBatches)
    .where(
      and(
        inArray(irtBatches.packageId, packageIds),
        eq(irtBatches.status, 'SUCCEEDED'),
        isNotNull(irtBatches.resultReleasedAt),
        lte(irtBatches.resultReleasedAt, now),
      ),
    );
  if (!batches.length) return new Map();
  const items = await db
    .select({
      packageId: packageItems.packageId,
      questionVersionId: packageItems.questionVersionId,
    })
    .from(packageItems)
    .where(inArray(packageItems.packageId, packageIds));
  const results = await db
    .select({
      batchId: irtItemResults.batchId,
      questionVersionId: irtItemResults.questionVersionId,
      sampleSize: irtItemResults.sampleSize,
      dataStatus: irtItemResults.dataStatus,
    })
    .from(irtItemResults)
    .where(
      inArray(
        irtItemResults.batchId,
        batches.map((batch) => batch.id),
      ),
    );
  const itemsByPackage = new Map<string, string[]>();
  for (const item of items)
    itemsByPackage.set(item.packageId, [
      ...(itemsByPackage.get(item.packageId) ?? []),
      item.questionVersionId,
    ]);
  const validByBatch = new Map<string, Set<string>>();
  for (const result of results) {
    if (result.sampleSize < 30 || result.dataStatus !== 'SUFFICIENT') continue;
    const versions = validByBatch.get(result.batchId) ?? new Set<string>();
    versions.add(result.questionVersionId);
    validByBatch.set(result.batchId, versions);
  }
  const released = new Map<string, Date>();
  for (const batch of batches) {
    if (!batch.packageId) continue;
    const versions = itemsByPackage.get(batch.packageId) ?? [];
    if (versions.length && versions.every((id) => validByBatch.get(batch.id)?.has(id)))
      if (!released.has(batch.packageId) || batch.releasedAt! < released.get(batch.packageId)!)
        released.set(batch.packageId, batch.releasedAt!);
  }
  return released;
}
export async function releasedTryoutPackageIds(packageIds: string[], now = new Date()): Promise<Set<string>> {
  return new Set((await releasedTryoutPackageTimes(packageIds, now)).keys());
}

export async function currentTryoutPackage() {
  const { db } = getDatabase();
  const [clock] = await db.execute<{ now: string }>(sql`select clock_timestamp() as now`);
  const now = new Date(clock!.now);
  const [row] = await db
    .select()
    .from(assessmentPackages)
    .where(
      and(
        eq(assessmentPackages.assessmentType, 'TRYOUT'),
        eq(assessmentPackages.purpose, 'REGULAR'),
        sql`public.package_can_distribute(${assessmentPackages.id})`,
        eq(assessmentPackages.status, 'PUBLISHED'),
        lte(assessmentPackages.releaseAt, now),
      ),
    )
    .orderBy(desc(assessmentPackages.releaseAt), desc(assessmentPackages.id))
    .limit(1);
  if (
    !row ||
    !row.releaseAt ||
    !isJakartaMondayMidnight(row.releaseAt) ||
    (row.closeAt && row.closeAt <= now)
  )
    return null;
  return row;
}
