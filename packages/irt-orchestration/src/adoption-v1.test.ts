import { describe, expect, it } from 'vitest';
import { validateV1ArtifactShape } from './adoption-v1.js';

const input = { id: 'request-1', snapshot_id: 'snapshot-1', input_digest: 'digest-1' };
const base = {
  contractVersion: 'irt-calibration-v1',
  requestId: 'request-1',
  inputDigest: 'digest-1',
  snapshotId: 'snapshot-1',
  items: [{ questionVersionId: 'q1', rubricVersionId: 'r1' }],
  packages: [{ packageId: 'p1', packageVersion: 1, armId: 'a1', armKind: 'ORIGINAL' }],
  respondents: [{ attemptId: 'attempt-1', respondentId: 'respondent-1', batchId: 'batch-1', packageId: 'p1', packageVersion: 1, assignedArmId: 'a1', deliveredArmId: 'a1', status: 'SCORED' }],
};

describe('v1 adoption artifact boundary', () => {
  it('accepts complete identity and status shape', () => {
    expect(validateV1ArtifactShape(base, input, 'artifact-1').attempts).toEqual(new Set(['attempt-1']));
  });

  it('rejects duplicate attempts and respondents', () => {
    expect(() => validateV1ArtifactShape({ ...base, respondents: [...base.respondents, { ...base.respondents[0] }] }, input)).toThrow('DUPLICATE');
  });

  it('rejects unsupported participant status', () => {
    expect(() => validateV1ArtifactShape({ ...base, respondents: [{ ...base.respondents[0], status: 'PASS' }] }, input)).toThrow('RESULT_STATUS');
  });
});
