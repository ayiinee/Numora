import type { CalibrationArtifactPayloadV3, ComputeNotificationV3 } from '@tka/database';

export class IrtOrchestrationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
  }
}
export function fail(code: string, status = 409): never {
  throw new IrtOrchestrationError(code, status);
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const parameter = (v: unknown) => v === null || finite(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((key) => allowed.includes(key));

export function validateComputeNotification(
  value: unknown,
): asserts value is ComputeNotificationV3 {
  if (
    !object(value) ||
    !keys(value, ['contractVersion', 'requestId', 'inputDigest', 'dispatchGeneration']) ||
    value.contractVersion !== 3 ||
    !uuid(value.requestId) ||
    typeof value.inputDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.inputDigest) ||
    !count(value.dispatchGeneration) ||
    value.dispatchGeneration < 1
  )
    fail('IRT_NOTIFICATION_INVALID', 400);
}

export function validateCalibrationPayload(
  value: unknown,
): asserts value is CalibrationArtifactPayloadV3 {
  if (
    !object(value) ||
    !keys(value, ['items', 'packages', 'respondents']) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.packages) ||
    !Array.isArray(value.respondents)
  )
    fail('IRT_ARTIFACT_INVALID');
  const seen = new Set<string>();
  for (const item of value.items) {
    if (
      !object(item) ||
      !keys(item, [
        'questionVersionId',
        'rubricVersionId',
        'modelFamily',
        'sampleSize',
        'eligibleRespondentCount',
        'measurementState',
        'discriminationA',
        'difficultyB',
        'steps',
        'qualityEvidence',
      ]) ||
      !uuid(item.questionVersionId) ||
      !uuid(item.rubricVersionId) ||
      seen.has(item.questionVersionId) ||
      !['2PL', 'GPCM'].includes(String(item.modelFamily)) ||
      !count(item.sampleSize) ||
      !count(item.eligibleRespondentCount) ||
      item.eligibleRespondentCount > item.sampleSize ||
      ![
        'UNCALIBRATED',
        'INSUFFICIENT',
        'CALIBRATION_FAILED',
        'CALIBRATED',
        'WATCH',
        'DRIFT',
        'ANOMALY',
      ].includes(String(item.measurementState)) ||
      !parameter(item.discriminationA) ||
      !parameter(item.difficultyB) ||
      !object(item.qualityEvidence) ||
      !Array.isArray(item.steps)
    )
      fail('IRT_ARTIFACT_INVALID');
    seen.add(item.questionVersionId);
    if (
      item.measurementState === 'CALIBRATED' &&
      (!finite(item.discriminationA) || !finite(item.difficultyB))
    )
      fail('IRT_ARTIFACT_INVALID');
    if (
      ['UNCALIBRATED', 'INSUFFICIENT', 'CALIBRATION_FAILED'].includes(
        String(item.measurementState),
      ) &&
      (item.discriminationA !== null || item.difficultyB !== null || item.steps.length)
    )
      fail('IRT_ARTIFACT_INVALID');
    if (item.modelFamily === '2PL' && item.steps.length) fail('IRT_ARTIFACT_INVALID');
    for (const [index, step] of item.steps.entries()) {
      if (
        !object(step) ||
        !keys(step, ['step', 'value', 'standardError']) ||
        step.step !== index + 1 ||
        !finite(step.value) ||
        !parameter(step.standardError) ||
        (finite(step.standardError) && step.standardError < 0)
      )
        fail('IRT_ARTIFACT_INVALID');
    }
  }
  const packageIds = new Set<string>();
  for (const pkg of value.packages) {
    if (
      !object(pkg) ||
      !keys(pkg, ['packageId', 'packageVersion', 'armId', 'armKind', 'manifestDigest']) ||
      !uuid(pkg.packageId) ||
      !count(pkg.packageVersion) ||
      pkg.packageVersion < 1 ||
      !uuid(pkg.armId) ||
      !['ORIGINAL', 'VARIANT'].includes(String(pkg.armKind)) ||
      typeof pkg.manifestDigest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(pkg.manifestDigest) ||
      packageIds.has(pkg.armId)
    )
      fail('IRT_ARTIFACT_INVALID');
    packageIds.add(pkg.armId);
  }
  const attemptIds = new Set<string>();
  const respondentIds = new Set<string>();
  for (const respondent of value.respondents) {
    if (
      !object(respondent) ||
      !keys(respondent, [
        'respondentId',
        'attemptId',
        'packageId',
        'packageVersion',
        'assignedArmId',
        'deliveredArmId',
        'status',
        'theta',
        'standardError',
        'score',
        'scoreMapping',
        'referencePackage',
        'usedQuestionVersionIds',
        'reasonCodes',
      ]) ||
      typeof respondent.respondentId !== 'string' ||
      respondent.respondentId.length === 0 ||
      !uuid(respondent.attemptId) ||
      !uuid(respondent.packageId) ||
      !count(respondent.packageVersion) ||
      respondent.packageVersion < 1 ||
      !uuid(respondent.assignedArmId) ||
      !uuid(respondent.deliveredArmId) ||
      !['SCORED', 'INSUFFICIENT', 'NOT_COMPARABLE', 'UNSCORABLE', 'NOT_EVALUATED'].includes(
        String(respondent.status),
      ) ||
      !parameter(respondent.theta) ||
      !parameter(respondent.standardError) ||
      !parameter(respondent.score) ||
      (respondent.standardError !== null && respondent.standardError < 0) ||
      (respondent.score !== null && (respondent.score < 0 || respondent.score > 100)) ||
      (respondent.scoreMapping !== null && !object(respondent.scoreMapping)) ||
      (respondent.referencePackage !== null && !object(respondent.referencePackage)) ||
      !Array.isArray(respondent.usedQuestionVersionIds) ||
      respondent.usedQuestionVersionIds.some((id: unknown) => !uuid(id)) ||
      new Set(respondent.usedQuestionVersionIds).size !== respondent.usedQuestionVersionIds.length ||
      !Array.isArray(respondent.reasonCodes) ||
      respondent.reasonCodes.some((reason: unknown) => typeof reason !== 'string') ||
      attemptIds.has(respondent.attemptId) ||
      respondentIds.has(respondent.respondentId)
    )
      fail('IRT_ARTIFACT_INVALID');
    if (respondent.status === 'SCORED') {
      if (
        respondent.theta === null ||
        respondent.standardError === null ||
        respondent.score === null ||
        !respondent.usedQuestionVersionIds.length ||
        respondent.reasonCodes.length
      )
        fail('IRT_ARTIFACT_INVALID');
    } else if (
      respondent.theta !== null ||
      respondent.standardError !== null ||
      respondent.score !== null ||
      respondent.status === 'NOT_EVALUATED' && !respondent.reasonCodes.length
    )
      fail('IRT_ARTIFACT_INVALID');
    attemptIds.add(respondent.attemptId);
    respondentIds.add(respondent.respondentId);
  }
}
