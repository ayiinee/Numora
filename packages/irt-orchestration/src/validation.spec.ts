import { describe, expect, it } from 'vitest';
import { validateCalibrationPayload, validateComputeNotification } from './validation.js';

const id = '00000000-0000-4000-8000-000000000001';
const packageId = '00000000-0000-4000-8000-000000000002';
const armId = '00000000-0000-4000-8000-000000000003';
const attemptId = '00000000-0000-4000-8000-000000000004';
const respondentId = '00000000-0000-4000-8000-000000000005';
const item = {
  questionVersionId: id,
  rubricVersionId: id,
  modelFamily: '2PL',
  sampleSize: 1,
  eligibleRespondentCount: 1,
  measurementState: 'CALIBRATED',
  discriminationA: 1,
  difficultyB: 0,
  steps: [],
  qualityEvidence: { fixture: true },
};
const lineage = {
  packageId,
  packageVersion: 1,
  armId,
  armKind: 'ORIGINAL',
  manifestDigest: 'b'.repeat(64),
};
const respondent = {
  respondentId,
  attemptId,
  packageId,
  packageVersion: 1,
  assignedArmId: armId,
  deliveredArmId: armId,
  status: 'SCORED',
  theta: 0,
  standardError: 0.2,
  score: 50,
  scoreMapping: {},
  referencePackage: {},
  usedQuestionVersionIds: [id],
  reasonCodes: [],
};
const validPayload = { items: [item], packages: [lineage], respondents: [respondent] };
describe('v3 boundary validation', () => {
  it('rejects unversioned/stale-shaped notifications and extra student payload', () => {
    const notification = {
      contractVersion: 3,
      requestId: id,
      inputDigest: 'a'.repeat(64),
      dispatchGeneration: 1,
    };
    expect(() => validateComputeNotification(notification)).not.toThrow();
    for (const patch of [
      { contractVersion: 2 },
      { dispatchGeneration: 0 },
      { requestId: 'bad' },
      { inputDigest: 'bad' },
      { rawAnswer: {} },
    ])
      expect(() => validateComputeNotification({ ...notification, ...patch })).toThrow(
        'IRT_NOTIFICATION_INVALID',
      );
  });
  it('rejects nonfinite values, duplicates, invented insufficient parameters and invalid GPCM steps', () => {
    expect(() => validateCalibrationPayload(validPayload)).not.toThrow();
    for (const patch of [
      { discriminationA: NaN },
      { difficultyB: Infinity },
      { eligibleRespondentCount: 2 },
      { measurementState: 'INSUFFICIENT' },
      { guessingC: 0.25 },
      { modelFamily: 'GPCM', steps: [{ step: 2, value: 0, standardError: 0 }] },
    ])
      expect(() => validateCalibrationPayload({ ...validPayload, items: [{ ...item, ...patch }] })).toThrow(
        'IRT_ARTIFACT_INVALID',
      );
    expect(() => validateCalibrationPayload({ ...validPayload, items: [item, item] })).toThrow(
      'IRT_ARTIFACT_INVALID',
    );
    expect(() => validateCalibrationPayload({ items: [item], packages: [lineage] })).toThrow(
      'IRT_ARTIFACT_INVALID',
    );
  });
});
