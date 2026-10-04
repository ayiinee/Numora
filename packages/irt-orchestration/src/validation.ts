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
  if (!object(value) || !keys(value, ['items']) || !Array.isArray(value.items))
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
}
