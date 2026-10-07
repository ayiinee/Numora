import { isDeepStrictEqual } from 'node:util';
import { tryoutXp } from './tryout-reward.js';
import { AssessmentFinalizationError } from './errors.js';
import { TRYOUT_PARTIAL_POLICY } from './tryout-partial.js';

export type Rounding = 'FLOOR' | 'HALF_UP' | 'CEIL';
export type ApprovedPolicy = {
  contractVersion: 'NUMORA_ASSESSMENT_V1';
  assessmentType: 'DRILL' | 'TRYOUT';
  scoreRounding: Rounding;
  xpRounding: Rounding;
  itemPointRounding: Rounding;
  tryoutXpMultiplier?: 10;
  drillXpBasis?: 'EQUIVALENT_CORRECT';
  lowPartialStars?: 0 | 1;
  itemWeights: Record<string, number>;
  canonicalPgOnly?: boolean;
  ownerTryoutPartial?: boolean;
};
export type PolicyRow = {
  policyCode: string;
  version?: number;
  configuration: unknown;
  status: string;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  approvalReference: string | null;
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const rounding = (value: unknown): value is Rounding =>
  value === 'FLOOR' || value === 'HALF_UP' || value === 'CEIL';

export const CANONICAL_POLICY_APPROVAL =
  'Product Aini, 5 October 2026; docs/development/REWARDS_DATA_NOTIFICATIONS_INTEGRATION_2026-10-05.md and docs/development/TRYOUT_XP_V06.md';
const canonicalConfigurations = {
  DRILL: {
    prdVersion: '0.6',
    questionType: 'SINGLE_CHOICE',
    questionCount: 10,
    masteryScore: 80,
    variantCount: 1,
    stars: { zero: 0, oneMax: 50, perfect: 100 },
    xp: { baseScale: 100, bonusWindowSeconds: 900, bonusMax: 50, cap: 150 },
  },
  TRYOUT: {
    prdVersion: '0.6',
    questionCount: 30,
    equivalentCorrectXpMultiplier: 10,
    speedBonus: false,
  },
};
export function isCanonicalPolicy(row: PolicyRow, type: 'DRILL' | 'TRYOUT') {
  return (
    row.policyCode === `${type}_PRD_V06` &&
    row.version === 1 &&
    isDeepStrictEqual(row.configuration, canonicalConfigurations[type])
  );
}
// This validates an approved handoff; it never supplies a default academic policy.
export function readApprovedPolicy(
  row: PolicyRow,
  type: 'DRILL' | 'TRYOUT',
  allowRetired = false,
): ApprovedPolicy {
  if (
    type === 'TRYOUT' &&
    row.policyCode === TRYOUT_PARTIAL_POLICY &&
    row.version === 1 &&
    (row.status === 'PUBLISHED' || (allowRetired && row.status === 'ARCHIVED')) &&
    isDeepStrictEqual(row.configuration, {
      prdVersion: '0.6',
      questionCount: 30,
      rubric: 'OPTIONS_STATEMENTS_PARTIAL_V1',
      mcma: 'correct_option_decisions/option_count',
      category: 'correct_statements/statement_count',
      unanswered: 0,
      awardedPointsDecimals: 2,
      equivalentCorrectXpMultiplier: 10,
      approvedBy: 'PROJECT_OWNER',
      approvedDate: '2026-10-07',
    })
  )
    return {
      contractVersion: 'NUMORA_ASSESSMENT_V1',
      assessmentType: 'TRYOUT',
      scoreRounding: 'HALF_UP',
      xpRounding: 'CEIL',
      itemPointRounding: 'HALF_UP',
      tryoutXpMultiplier: 10,
      ownerTryoutPartial: true,
      itemWeights: { SINGLE_CHOICE: 1, MULTIPLE_CHOICE_MULTIPLE_ANSWER: 1, CATEGORY: 1 },
    };
  if (
    isCanonicalPolicy(row, type) &&
    (row.status === 'PUBLISHED' || (allowRetired && row.status === 'ARCHIVED'))
  )
    return {
      contractVersion: 'NUMORA_ASSESSMENT_V1',
      assessmentType: type,
      scoreRounding: 'HALF_UP',
      xpRounding: type === 'DRILL' ? 'HALF_UP' : 'CEIL',
      itemPointRounding: 'HALF_UP',
      tryoutXpMultiplier: 10,
      drillXpBasis: 'EQUIVALENT_CORRECT',
      itemWeights: { SINGLE_CHOICE: 2 },
      canonicalPgOnly: true,
    };
  const c = object(row.configuration),
    weights = object(c?.itemWeights);
  if (
    (row.status !== 'PUBLISHED' && !(allowRetired && row.status === 'ARCHIVED')) ||
    !row.approvedAt ||
    !row.approvedByUserId ||
    !row.approvalReference?.trim()
  )
    throw new AssessmentFinalizationError(
      'ASSESSMENT_POLICY_APPROVAL_REQUIRED',
      'Policy published dan bukti persetujuan diperlukan.',
    );
  if (
    row.policyCode !== `NUMORA_${type}_V06` ||
    c?.contractVersion !== 'NUMORA_ASSESSMENT_V1' ||
    c.assessmentType !== type ||
    !rounding(c.scoreRounding) ||
    !rounding(c.xpRounding) ||
    !rounding(c.itemPointRounding) ||
    !weights ||
    !Object.keys(weights).length ||
    Object.entries(weights).some(
      ([key, weight]) =>
        !['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'].includes(key) ||
        typeof weight !== 'number' ||
        !Number.isFinite(weight) ||
        weight !== (key === 'SINGLE_CHOICE' ? 2 : 3),
    ) ||
    (type === 'TRYOUT' && (c.tryoutXpMultiplier !== 10 || c.xpRounding !== 'CEIL')) ||
    (type === 'DRILL' && (c.drillXpBasis !== 'EQUIVALENT_CORRECT' || c.xpRounding !== 'HALF_UP')) ||
    (c.lowPartialStars !== undefined && c.lowPartialStars !== 0 && c.lowPartialStars !== 1)
  )
    throw new AssessmentFinalizationError(
      'ASSESSMENT_POLICY_UNSUPPORTED',
      'Kontrak policy atau representasi/pembulatan belum didukung.',
    );
  return c as unknown as ApprovedPolicy;
}
export function roundPolicy(value: number, mode: Rounding) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid nonnegative policy value.');
  return mode === 'FLOOR'
    ? Math.floor(value)
    : mode === 'CEIL'
      ? Math.ceil(value)
      : Math.round(value);
}
export function approvedStars(score: number, policy: ApprovedPolicy) {
  if (score === 0) return 0;
  if (score >= 10 && score <= 50) return 1;
  if (score >= 51 && score <= 99) return 2;
  if (score === 100) return 3;
  if (policy.lowPartialStars !== undefined && score > 0 && score < 10)
    return policy.lowPartialStars;
  throw new AssessmentFinalizationError(
    'PARTIAL_STAR_POLICY_REQUIRED',
    'Bintang skor parsial ini belum disahkan.',
  );
}
export function assessmentXp(
  policy: ApprovedPolicy,
  input: {
    raw: number;
    maximum: number;
    equivalentCorrect: number;
    fullyCorrect: number;
    questionCount: number;
    durationSeconds: number;
  },
) {
  if (policy.assessmentType === 'TRYOUT') return tryoutXp(input.equivalentCorrect);
  return Math.round(
    Math.min(
      150,
      input.equivalentCorrect * 10 +
        Math.max(0, ((900 - Math.max(0, input.durationSeconds)) / 900) * 50),
    ),
  );
}
