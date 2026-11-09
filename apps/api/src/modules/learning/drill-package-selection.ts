import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  scoringPolicyVersions,
  packageRuntimeEligibility,
  type AssessmentReader,
} from '@tka/database';
import { readApprovedPolicy } from '@tka/assessment-engine';
import { allowsChapter3Override, chapter3RuntimeEligibility } from './drill-chapter3-override';

/** Shared eligibility for new Student attempts and Admin's availability projection. */
export async function availableDrillPackages(db: AssessmentReader, levelId: string) {
  const availablePackages = await db
    .select({
      id: assessmentPackages.id,
      isDemo: assessmentPackages.isDemo,
      variantIndex: assessmentPackages.variantIndex,
      scoringPolicyVersionId: assessmentPackages.scoringPolicyVersionId,
      policyCode: scoringPolicyVersions.policyCode,
      policyVersion: scoringPolicyVersions.version,
      configuration: scoringPolicyVersions.configuration,
      policyConfiguration: scoringPolicyVersions.configuration,
      policyStatus: scoringPolicyVersions.status,
      approvedAt: scoringPolicyVersions.approvedAt,
      approvedByUserId: scoringPolicyVersions.approvedByUserId,
      approvalReference: scoringPolicyVersions.approvalReference,
    })
    .from(assessmentPackages)
    .innerJoin(
      scoringPolicyVersions,
      eq(scoringPolicyVersions.id, assessmentPackages.scoringPolicyVersionId),
    )
    .where(
      and(
        eq(assessmentPackages.assessmentType, 'DRILL'),
        eq(assessmentPackages.purpose, 'REGULAR'),
        sql`public.package_can_distribute(${assessmentPackages.id})`,
        or(packageRuntimeEligibility(), chapter3RuntimeEligibility()),
        eq(assessmentPackages.levelId, levelId),
        eq(assessmentPackages.status, 'PUBLISHED'),
        or(isNull(assessmentPackages.releaseAt), lte(assessmentPackages.releaseAt, new Date())),
      ),
    )
    .orderBy(asc(assessmentPackages.variantIndex), asc(assessmentPackages.id));
  return availablePackages.filter((item) => {
    if (item.isDemo || allowsChapter3Override(item)) return true;
    try {
      readApprovedPolicy(
        { ...item, version: item.policyVersion, status: item.policyStatus },
        'DRILL',
      );
      return true;
    } catch {
      return false;
    }
  });
}
