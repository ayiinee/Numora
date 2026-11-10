import { ServiceUnavailableException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  assessmentPackages,
  packageItems,
  questions,
  questionVariants,
  questionVersions,
  scoringRubricVersions,
  scoringPolicyVersions,
  packageRuntimeEligibility,
  type AssessmentReader,
} from '@tka/database';
import {
  AssessmentFinalizationError,
  decodeAssessmentContent,
  decodeRuntimeQuestion,
  readApprovedPolicy,
  validateRubricCoverage,
} from '@tka/assessment-engine';
import { DRILL_QUESTION_COUNT } from './drill.policy';
import { allowsChapter3Override, chapter3RuntimeEligibility } from './drill-chapter3-override';

export const drillPackageColumns = {
  id: assessmentPackages.id,
  isDemo: assessmentPackages.isDemo,
  scoringPolicyVersionId: assessmentPackages.scoringPolicyVersionId,
  policyCode: scoringPolicyVersions.policyCode,
  policyVersion: scoringPolicyVersions.version,
  configuration: scoringPolicyVersions.configuration,
  policyConfiguration: scoringPolicyVersions.configuration,
  policyStatus: scoringPolicyVersions.status,
  approvedAt: scoringPolicyVersions.approvedAt,
  approvedByUserId: scoringPolicyVersions.approvedByUserId,
  approvalReference: scoringPolicyVersions.approvalReference,
};

function drillPackageQuery(db: AssessmentReader) {
  return db
    .select(drillPackageColumns)
    .from(assessmentPackages)
    .innerJoin(
      scoringPolicyVersions,
      eq(scoringPolicyVersions.id, assessmentPackages.scoringPolicyVersionId),
    );
}

type DrillPackage = Awaited<ReturnType<typeof drillPackageQuery>>[number];

/** Legacy eligibility for new Student attempts and Admin's availability projection. */
export async function availableDrillPackages(db: AssessmentReader, levelId: string) {
  const availablePackages = await drillPackageQuery(db)
    .where(
      and(
        eq(assessmentPackages.assessmentType, 'DRILL'),
        eq(assessmentPackages.purpose, 'REGULAR'),
        isNull(assessmentPackages.distributionArmId),
        sql`public.package_can_distribute(${assessmentPackages.id})`,
        or(packageRuntimeEligibility(), chapter3RuntimeEligibility()),
        eq(assessmentPackages.levelId, levelId),
        eq(assessmentPackages.status, 'PUBLISHED'),
        or(isNull(assessmentPackages.releaseAt), lte(assessmentPackages.releaseAt, new Date())),
      ),
    )
    .orderBy(asc(assessmentPackages.variantIndex), asc(assessmentPackages.id));
  return availablePackages.filter((item) => {
    return item.isDemo || allowsChapter3Override(item) || hasSupportedDrillPolicy(item);
  });
}

export function hasSupportedDrillPolicy(item: DrillPackage): boolean {
  try {
    readApprovedPolicy(
      { ...item, version: item.policyVersion, status: item.policyStatus },
      'DRILL',
    );
    return true;
  } catch (error) {
    if (error instanceof AssessmentFinalizationError) return false;
    throw error;
  }
}

const problem = (code: string, detail: string) => ({ code, detail });

export async function loadDrillPackageItems(db: AssessmentReader, selected: DrillPackage) {
  const items = await db
    .select({
      packageItemId: packageItems.id,
      displayOrder: packageItems.displayOrder,
      maxPoints: packageItems.maxPoints,
      rubricVersionId: packageItems.rubricVersionId,
      maximumScoreCategory: packageItems.maximumScoreCategory,
      questionVersionId: questionVersions.id,
      questionType: questionVersions.questionType,
      contentStatus: questionVersions.contentStatus,
      questionStatus: questions.status,
      stem: questionVersions.stem,
      optionsOrStatements: questionVersions.optionsOrStatements,
      answerKey: questionVersions.answerKey,
      explanation: questionVersions.explanation,
    })
    .from(packageItems)
    .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
    .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
    .innerJoin(questions, eq(questions.id, questionVariants.questionId))
    .where(eq(packageItems.packageId, selected.id))
    .orderBy(asc(packageItems.displayOrder));
  if (
    items.length !== DRILL_QUESTION_COUNT ||
    items.some((item) => !Number.isFinite(Number(item.maxPoints)) || Number(item.maxPoints) <= 0)
  )
    throw new ServiceUnavailableException(
      problem('DRILL_PACKAGE_INVALID', 'Paket Drill harus berisi 10 soal bernilai satu poin.'),
    );
  const ownerOverride = allowsChapter3Override(selected);
  const rubricIds = [
    ...new Set(items.flatMap((item) => (item.rubricVersionId ? [item.rubricVersionId] : []))),
  ];
  const rubrics = rubricIds.length
    ? await db
        .select()
        .from(scoringRubricVersions)
        .where(inArray(scoringRubricVersions.id, rubricIds))
    : [];
  try {
    items.forEach((item) =>
      ownerOverride
        ? decodeAssessmentContent(item)
        : validateRubricCoverage(
            decodeRuntimeQuestion(item),
            rubrics.find((r) => r.id === item.rubricVersionId),
          ),
    );
  } catch (error) {
    if (error instanceof AssessmentFinalizationError)
      throw new ServiceUnavailableException(problem('PGK_SCORING_PENDING', error.message));
    throw error;
  }

  if (
    items.some(
      (item) =>
        item.contentStatus === 'ARCHIVED' ||
        item.questionStatus === 'ARCHIVED' ||
        (!selected.isDemo && (item.contentStatus !== 'READY' || item.questionStatus !== 'READY')),
    )
  ) {
    throw new ServiceUnavailableException(
      problem('DRILL_CONTENT_NOT_READY', 'Konten Drill belum disetujui atau telah diarsipkan.'),
    );
  }
  return items;
}
