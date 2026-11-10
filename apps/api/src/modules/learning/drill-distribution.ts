import { randomInt } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  assessmentArmAssignments,
  assessmentArmDistributionEvents,
  assessmentArmRevisions,
  assessmentArms,
  assessmentArmSets,
  assessmentDistributionPolicies,
  assessmentPackages,
  measurementContexts,
  scoringPolicyVersions,
  type AssessmentReader,
} from '@tka/database';
import { isUUID } from 'class-validator';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AdminTransaction } from '../audit/admin-mutation';
import {
  drillPackageColumns,
  hasSupportedDrillPolicy,
  loadDrillPackageItems,
} from './drill-package-selection';

/** Undefined selects legacy routing. Null represents invalid configuration. */
export function configuredDrillSet(levelId: string): string | null | undefined {
  const raw = process.env.NUMORA_DRILL_AB_LEVEL_SETS?.trim();
  if (!raw) return undefined;
  try {
    const config: unknown = JSON.parse(raw);
    if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
    const levels = new Map<string, string>();
    for (const [level, set] of Object.entries(config)) {
      const key = level.toLowerCase();
      if (!isUUID(key) || typeof set !== 'string' || !isUUID(set) || levels.has(key)) return null;
      levels.set(key, set.toLowerCase());
    }
    return levels.get(levelId.toLowerCase());
  } catch {
    return null;
  }
}

export async function readDrillPilot(
  db: AssessmentReader,
  levelId: string,
  setId: string,
  lock = false,
) {
  // Match the order of revision updates: arm rows before the set row.
  const armQuery = db
    .select()
    .from(assessmentArms)
    .where(eq(assessmentArms.setId, setId))
    .orderBy(asc(assessmentArms.id));
  const arms = await (lock ? armQuery.for('share') : armQuery);
  const original = arms.find((arm) => arm.kind === 'ORIGINAL');
  const variant = arms.find((arm) => arm.kind === 'VARIANT');
  if (arms.length !== 2 || !original || !variant) return null;

  const setQuery = db
    .select({
      allowOriginalFallback: sql<boolean>`(${assessmentDistributionPolicies.definition}->>'allowOriginalFallback') = 'true'`,
    })
    .from(assessmentArmSets)
    .innerJoin(measurementContexts, eq(assessmentArmSets.contextId, measurementContexts.id))
    .innerJoin(
      assessmentDistributionPolicies,
      eq(assessmentArmSets.policyId, assessmentDistributionPolicies.id),
    )
    .where(
      and(
        eq(assessmentArmSets.id, setId),
        eq(assessmentArmSets.status, 'OPEN'),
        eq(measurementContexts.ecosystem, 'DRILL'),
        eq(measurementContexts.levelId, levelId),
      ),
    );
  const [set] = await (lock ? setQuery.for('share', { of: assessmentArmSets }) : setQuery);
  if (!set) return null;

  const revisions = await db
    .select({
      revisionId: assessmentArmRevisions.id,
      armId: assessmentArmRevisions.armId,
      package: drillPackageColumns,
      inReleaseWindow: sql<boolean>`(${assessmentPackages.releaseAt} is null or ${assessmentPackages.releaseAt} <= clock_timestamp())`,
      distributable: sql<boolean>`public.package_can_distribute(${assessmentPackages.id})`,
    })
    .from(assessmentArmRevisions)
    .innerJoin(assessmentPackages, eq(assessmentArmRevisions.packageId, assessmentPackages.id))
    .innerJoin(
      scoringPolicyVersions,
      eq(scoringPolicyVersions.id, assessmentPackages.scoringPolicyVersionId),
    )
    .where(
      and(
        inArray(
          assessmentArmRevisions.id,
          arms.flatMap((arm) => (arm.currentRevisionId ? [arm.currentRevisionId] : [])),
        ),
        eq(assessmentPackages.assessmentType, 'DRILL'),
        eq(assessmentPackages.levelId, levelId),
        eq(assessmentPackages.distributionArmId, assessmentArmRevisions.armId),
      ),
    );
  const [variantEvent] = variant.currentRevisionId
    ? await db
        .select({ state: assessmentArmDistributionEvents.state })
        .from(assessmentArmDistributionEvents)
        .where(eq(assessmentArmDistributionEvents.revisionId, variant.currentRevisionId))
        .orderBy(
          desc(assessmentArmDistributionEvents.createdAt),
          desc(assessmentArmDistributionEvents.id),
        )
        .limit(1)
    : [];
  const variantStopped =
    variant.status === 'HELD' ||
    variant.status === 'RETIRED' ||
    variantEvent?.state === 'HOLD' ||
    variantEvent?.state === 'RETIRED';

  async function ready(armId: string) {
    const revision = revisions.find((entry) => entry.armId === armId);
    if (
      !revision?.distributable ||
      !revision.inReleaseWindow ||
      revision.package.isDemo ||
      !hasSupportedDrillPolicy(revision.package)
    )
      return null;
    try {
      return { ...revision, items: await loadDrillPackageItems(db, revision.package) };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) return null;
      throw error;
    }
  }

  return {
    original: await ready(original.id),
    variant: await ready(variant.id),
    variantId: variant.id,
    allowOriginalFallback: set.allowOriginalFallback && variantStopped,
  };
}

export async function resolveDrillDelivery(
  tx: AdminTransaction,
  levelId: string,
  setId: string,
  studentId: string,
) {
  const pilot = await readDrillPilot(tx, levelId, setId, true);
  if (!pilot) return null;

  // Share the lock namespace with getOrAssignAssessmentArm. Keep all writes in the start transaction.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${setId} || ':' || ${studentId}, 72))`,
  );
  const [assignment] = await tx
    .select({
      id: assessmentArmAssignments.id,
      armId: assessmentArmAssignments.assignedArmId,
    })
    .from(assessmentArmAssignments)
    .where(
      and(
        eq(assessmentArmAssignments.setId, setId),
        eq(assessmentArmAssignments.studentId, studentId),
      ),
    );

  if (!assignment) {
    if (!pilot.original || !pilot.variant) return null;
    const candidate = randomInt(2) === 0 ? pilot.original : pilot.variant;
    const [created] = await tx
      .insert(assessmentArmAssignments)
      .values({
        setId,
        studentId,
        assignedArmId: candidate.armId,
      })
      .returning({ id: assessmentArmAssignments.id });
    if (!created) throw new Error('Drill arm assignment creation failed.');
    return { candidate, assignmentId: created.id, fallbackReason: null };
  }

  const assignedVariant = assignment.armId === pilot.variantId;
  const candidate = assignedVariant ? pilot.variant : pilot.original;
  if (candidate) return { candidate, assignmentId: assignment.id, fallbackReason: null };
  if (!assignedVariant || !pilot.allowOriginalFallback || !pilot.original) return null;
  return {
    candidate: pilot.original,
    assignmentId: assignment.id,
    fallbackReason: 'VARIANT_DISTRIBUTION_STOPPED',
  };
}
