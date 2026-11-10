import { and, eq, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  assessmentAttempts,
  chapters,
  levels,
  subchapters,
  scoringPolicyVersions,
  packageRuntimeEligibility,
  pretestDistributionEligibility,
  tryoutDistributionEligibility,
  currentPretestPackage,
} from '@tka/database';
import type { AdminTransaction } from '../audit/admin-mutation';
import type { PackageAvailabilityDto } from './content-packages.dto';
import { availableDrillPackages } from '../learning/drill-package-selection';
import { configuredDrillSet, readDrillPilot } from '../learning/drill-distribution';
import { readApprovedPolicy, isPretestPartialPolicy } from '@tka/assessment-engine';

export async function packageAvailability(
  tx: AdminTransaction,
  p: typeof assessmentPackages.$inferSelect,
): Promise<PackageAvailabilityDto> {
  const [clock] = await tx.execute<{ now: string }>(sql`select clock_timestamp() as now`);
  const now = new Date(clock!.now);
  const result = (
    state: PackageAvailabilityDto['state'],
    blockers: string[] = [],
  ): PackageAvailabilityDto => ({ state, blockers, checkedAt: now.toISOString() });
  if (p.status === 'ARCHIVED') return result('ARCHIVED', ['PACKAGE_ARCHIVED']);
  if (p.status === 'CLOSED') return result('CLOSED', ['WINDOW_CLOSED']);
  if (p.status !== 'PUBLISHED') return result('DRAFT', ['PACKAGE_NOT_PUBLISHED']);
  if (p.assessmentType === 'DRILL') {
    const [scope] = p.levelId
      ? await tx
          .select({
            level: levels.status,
            subchapter: subchapters.status,
            chapter: chapters.status,
          })
          .from(levels)
          .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
          .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
          .where(eq(levels.id, p.levelId))
      : [];
    if (!scope || Object.values(scope).some((status) => status !== 'READY'))
      return result('BLOCKED', ['DRILL_SCOPE_NOT_READY']);
    const setId = configuredDrillSet(p.levelId!);
    if (setId !== undefined) {
      const pilot = setId ? await readDrillPilot(tx, p.levelId!, setId) : null;
      return pilot?.original?.package.id === p.id || pilot?.variant?.package.id === p.id
        ? result('AVAILABLE')
        : result('BLOCKED', ['DRILL_NOT_SELECTED_OR_POLICY_UNSUPPORTED']);
    }
    if ((await availableDrillPackages(tx, p.levelId!))[0]?.id !== p.id)
      return result('BLOCKED', ['DRILL_NOT_SELECTED_OR_POLICY_UNSUPPORTED']);
    return result('AVAILABLE');
  }
  const distribution =
    p.assessmentType === 'TRYOUT'
      ? tryoutDistributionEligibility()
      : p.assessmentType === 'PRETEST'
        ? pretestDistributionEligibility()
        : sql`public.package_can_distribute(${assessmentPackages.id})`;
  const [checks] = await tx
    .select({
      runtime: packageRuntimeEligibility().mapWith(Boolean),
      distribution: distribution.mapWith(Boolean),
    })
    .from(assessmentPackages)
    .where(eq(assessmentPackages.id, p.id));
  const blockers: string[] = [];
  if (!checks?.runtime) blockers.push('SNAPSHOT_OR_APPROVAL_NOT_ELIGIBLE');
  if (!checks?.distribution) blockers.push('CONTENT_NOT_DISTRIBUTABLE');
  const [policy] = p.scoringPolicyVersionId
    ? await tx
        .select()
        .from(scoringPolicyVersions)
        .where(eq(scoringPolicyVersions.id, p.scoringPolicyVersionId))
    : [];
  if (policy?.status !== 'PUBLISHED') blockers.push('SCORING_POLICY_NOT_PUBLISHED');
  if (p.assessmentType === 'TRYOUT') {
    try {
      if (!policy) throw Error('Missing policy');
      readApprovedPolicy(policy, 'TRYOUT');
    } catch {
      blockers.push('SCORING_POLICY_UNSUPPORTED');
    }
  }
  if (p.assessmentType === 'PRETEST') {
    const [chapter] = p.chapterId
      ? await tx.select().from(chapters).where(eq(chapters.id, p.chapterId))
      : [];
    if (chapter?.status !== 'READY') blockers.push('CHAPTER_NOT_READY');
    if (
      !blockers.length &&
      p.chapterId &&
      (await currentPretestPackage(p.chapterId, tx, isPretestPartialPolicy))?.id !== p.id
    )
      blockers.push('PRETEST_NOT_SELECTED_OR_POLICY_UNSUPPORTED');
  }
  if (p.assessmentType === 'TRYOUT')
    return blockers.length ? result('BLOCKED', blockers) : result('READY_FOR_BATCH');
  return blockers.length ? result('BLOCKED', blockers) : result('AVAILABLE');
}

export async function legacyPreparation(
  tx: AdminTransaction,
  p: typeof assessmentPackages.$inferSelect,
) {
  if (p.assessmentType !== 'PRETEST' || p.importSource) return null;
  const [used] = await tx
    .select({ id: assessmentAttempts.id })
    .from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.packageId, p.id)))
    .limit(1);
  return p.status === 'DRAFT' && !p.manifestDigest && !p.frozenAt && !used
    ? ('CONTINUE_IMPORT' as const)
    : ('NEW_VERSION' as const);
}
