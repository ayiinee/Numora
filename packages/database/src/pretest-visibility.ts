import { and, asc, desc, eq } from 'drizzle-orm';
import { getDatabase } from './client.js';
import {
  allowSyntheticContent,
  packageRuntimeEligibility,
  pretestDistributionEligibility,
} from './package-runtime.js';
import { assessmentPackages, scoringPolicyVersions } from './schema/index.js';

export type AssessmentReader = Pick<ReturnType<typeof getDatabase>['db'], 'select' | 'execute'>;

type AdditionalPretestPolicy = (policy: typeof scoringPolicyVersions.$inferSelect) => boolean;

export async function supportedPretestPolicy(
  id: string | null,
  synthetic: boolean,
  db: AssessmentReader = getDatabase().db,
  additionalPolicy: AdditionalPretestPolicy = () => false,
) {
  if (!id) return false;
  const [policy] = await db
    .select()
    .from(scoringPolicyVersions)
    .where(eq(scoringPolicyVersions.id, id));
  const config = policy?.configuration as Record<string, unknown> | null;
  return (
    policy?.status === 'PUBLISHED' &&
    policy.version === 1 &&
    (policy.policyCode === 'PRETEST_PRD_V06' ||
      additionalPolicy(policy) ||
      (synthetic &&
        allowSyntheticContent() &&
        (policy.policyCode === 'NUMORA-ASSESSMENT-MOCK-V1-PRETEST' ||
          (policy.policyCode.startsWith('PRETEST_PG_DEMO_') &&
            config?.testOnly === true &&
            config?.questionCount === 20))))
  );
}

/** One selection rule for the Student consumer and Admin's availability projection. */
export async function currentPretestPackage(
  chapterId: string,
  db: AssessmentReader = getDatabase().db,
  additionalPolicy: AdditionalPretestPolicy = () => false,
) {
  const [row] = await db
    .select()
    .from(assessmentPackages)
    .where(
      and(
        eq(assessmentPackages.chapterId, chapterId),
        eq(assessmentPackages.assessmentType, 'PRETEST'),
        eq(assessmentPackages.purpose, 'REGULAR'),
        eq(assessmentPackages.status, 'PUBLISHED'),
        pretestDistributionEligibility(),
        packageRuntimeEligibility(),
      ),
    )
    .orderBy(
      asc(assessmentPackages.isDemo),
      desc(assessmentPackages.packageVersion),
      desc(assessmentPackages.id),
    )
    .limit(1);
  return row &&
    (await supportedPretestPolicy(row.scoringPolicyVersionId, row.isDemo, db, additionalPolicy))
    ? row
    : null;
}
