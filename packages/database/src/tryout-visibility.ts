import { getDatabase } from './client.js';
import {
  irtBatches,
  irtItemResults,
  packageItems,
  assessmentPackages,
  tryoutBatches,
  tryoutResultFinalizations,
  tryoutAttemptResults,
} from './schema/index.js';
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

/** Monday 00:00 through the start of Sunday 23:59, Asia/Jakarta. */
export function tryoutBatchCloseAt(releaseAt: Date) {
  return new Date(releaseAt.getTime() + (7 * 24 * 60 * 60 - 60) * 1000);
}

export async function releasedTryoutPackageTimes(
  packageIds: string[],
  now = new Date(),
): Promise<Map<string, Date>> {
  if (!packageIds.length) return new Map();
  const { db } = getDatabase();
  const canonical = await db
    .select({
      packageId: tryoutBatches.packageId,
      releasedAt: tryoutResultFinalizations.publishedAt,
    })
    .from(tryoutResultFinalizations)
    .innerJoin(tryoutBatches, eq(tryoutBatches.id, tryoutResultFinalizations.batchId))
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, tryoutBatches.packageId))
    .where(
      and(
        inArray(tryoutBatches.packageId, packageIds),
        eq(tryoutBatches.status, 'PUBLISHED'),
        inArray(tryoutResultFinalizations.mode, ['IRT', 'FALLBACK']),
        isNotNull(tryoutResultFinalizations.publishedAt),
        lte(tryoutResultFinalizations.publishedAt, now),
      ),
    );
  const canonicalTimes = new Map(canonical.map((row) => [row.packageId, row.releasedAt!]));
  const batches = await db
    .select({
      id: irtBatches.id,
      packageId: irtBatches.packageId,
      releasedAt: irtBatches.resultReleasedAt,
    })
    .from(irtBatches)
    .innerJoin(assessmentPackages, eq(assessmentPackages.id, irtBatches.packageId))
    .where(
      and(
        inArray(irtBatches.packageId, packageIds),
        eq(irtBatches.status, 'SUCCEEDED'),
        eq(assessmentPackages.isDemo, true),
        isNotNull(irtBatches.resultReleasedAt),
        lte(irtBatches.resultReleasedAt, now),
      ),
    );
  if (!batches.length) return canonicalTimes;
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
  const released = canonicalTimes;
  for (const batch of batches) {
    if (!batch.packageId) continue;
    const versions = itemsByPackage.get(batch.packageId) ?? [];
    if (versions.length && versions.every((id) => validByBatch.get(batch.id)?.has(id)))
      if (!released.has(batch.packageId) || batch.releasedAt! < released.get(batch.packageId)!)
        released.set(batch.packageId, batch.releasedAt!);
  }
  return released;
}
export async function releasedTryoutPackageIds(
  packageIds: string[],
  now = new Date(),
): Promise<Set<string>> {
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
    (!row.isDemo &&
      (row.durationSeconds !== 600 ||
        row.closeAt?.getTime() !== tryoutBatchCloseAt(row.releaseAt).getTime())) ||
    (row.closeAt ?? tryoutBatchCloseAt(row.releaseAt)) <= now
  )
    return null;
  return row;
}

/** Published immutable academic results only. No release, mapping or fallback decisions here. */
export async function publishedTryoutAttemptResults(attemptIds: string[], now = new Date()) {
  if (!attemptIds.length)
    return new Map<
      string,
      {
        score: number;
        resultMethod: 'IRT' | 'STANDARD';
        reason: string | null;
        mode: string;
        version: number;
      }
    >();
  const { db } = getDatabase();
  const rows = await db
    .select({
      attemptId: tryoutAttemptResults.attemptId,
      score: tryoutAttemptResults.score,
      mode: tryoutResultFinalizations.mode,
      policy: tryoutResultFinalizations.policySnapshot,
      version: tryoutResultFinalizations.version,
    })
    .from(tryoutAttemptResults)
    .innerJoin(
      tryoutResultFinalizations,
      eq(tryoutResultFinalizations.id, tryoutAttemptResults.finalizationId),
    )
    .innerJoin(tryoutBatches, eq(tryoutBatches.id, tryoutResultFinalizations.batchId))
    .where(
      and(
        inArray(tryoutAttemptResults.attemptId, attemptIds),
        eq(tryoutBatches.status, 'PUBLISHED'),
        isNotNull(tryoutResultFinalizations.publishedAt),
        lte(tryoutResultFinalizations.publishedAt, now),
        inArray(tryoutResultFinalizations.mode, ['IRT', 'FALLBACK']),
      ),
    );
  const reasons: Record<string, string> = {
    IRT_DEADLINE_EXCEEDED: 'Hasil IRT belum tersedia hingga batas waktu pemrosesan batch.',
    IRT_FAILED: 'Pemrosesan IRT tidak menghasilkan hasil valid untuk batch ini.',
    DATA_INSUFFICIENT: 'Data batch belum memenuhi syarat perhitungan IRT.',
  };
  return new Map(
    rows
      .filter((row) => row.score !== null && Number.isFinite(Number(row.score)))
      .map((row) => {
        const policy =
          row.policy && typeof row.policy === 'object' && !Array.isArray(row.policy)
            ? (row.policy as Record<string, unknown>)
            : {};
        const code = typeof policy.reasonCode === 'string' ? policy.reasonCode : '';
        return [
          row.attemptId,
          {
            score: Number(row.score),
            mode: row.mode,
            version: row.version,
            resultMethod: row.mode === 'IRT' ? ('IRT' as const) : ('STANDARD' as const),
            reason: row.mode === 'FALLBACK' ? (reasons[code] ?? null) : null,
          },
        ];
      }),
  );
}
