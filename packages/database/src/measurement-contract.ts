/** Additive compute contract. v1/v2 API integrations remain unchanged during transition. */
export const COMPUTE_CONTRACT_VERSION = 3 as const;
export type AnalysisRequestType =
  | 'CALIBRATE_ORIGINAL'
  | 'GENERATE_VARIANTS'
  | 'COMPARE_VARIANTS'
  | 'EVALUATE_PACKAGE'
  | 'MONITOR_PRODUCTION'
  | 'CALIBRATE_TRYOUT';
export type ScientificDecision =
  | 'PASS'
  | 'DRIFT'
  | 'ANOMALY'
  | 'INSUFFICIENT'
  | 'CALIBRATION_FAILED'
  | 'NOT_COMPARABLE'
  | 'CONTENT_VALID'
  | 'REVIEW'
  | 'TRYOUT_QUALITY_PASS';
export interface ConfigurationPin {
  approvalId: string;
  digest: string;
}
export interface CreateAnalysisRequest {
  idempotencyKey: string;
  requestType: AnalysisRequestType;
  contextId: string;
  snapshotId?: string;
  waveItemId?: string;
  packageId?: string;
  baselineId?: string;
  referenceSetId?: string;
  configurationPins: ConfigurationPin[];
  dueAt?: Date | string;
}
export interface ComputeArtifact {
  executionId: string;
  datasetId?: string;
  inputDigest: string;
  kind: AnalysisRequestType;
  sequenceNumber?: number;
  scientificDecision: ScientificDecision;
  payload: Record<string, unknown>;
}
/** IDs of sealed candidates produced during this execution, before canonical import. */
export interface GenerationArtifactPayload {
  candidateIds: string[];
}
export interface PartialCreditResponse {
  respondentId: string;
  attemptId: string;
  attemptItemId: string;
  questionVersionId: string;
  rubricVersionId: string;
  scoreCategory: number | null;
  maximumScoreCategory: number;
  fullyCorrect: boolean | null;
  responseState: 'RESPONDED' | 'OMITTED' | 'NOT_PRESENTED' | 'INVALID';
  awardedPoints: number | null;
  maxPoints: number;
  operationalEligible: boolean;
}
export interface CalibrationItem {
  questionVersionId: string;
  rubricVersionId: string;
  modelFamily: '2PL' | 'GPCM';
  sampleSize: number;
  eligibleRespondentCount: number;
  measurementState:
    | 'UNCALIBRATED'
    | 'INSUFFICIENT'
    | 'CALIBRATION_FAILED'
    | 'CALIBRATED'
    | 'WATCH'
    | 'DRIFT'
    | 'ANOMALY';
  discriminationA: number | null;
  difficultyB: number | null;
  steps: { step: number; value: number; standardError: number | null }[];
  qualityEvidence: Record<string, unknown>;
}
export interface TryoutRespondentResult {
  respondentId: string;
  attemptId: string;
  theta: number;
  standardError: number;
  score: number;
  /** Mapping defines rounding/resolution; main ranks this canonical score. */
  mappingApprovalId: string;
}

/** Foundation adopts item evidence only; respondent grades require a later contract. */
export interface CalibrationArtifactPayloadV3 {
  items: CalibrationItem[];
}
export interface ComputeNotificationV3 {
  contractVersion: 3;
  requestId: string;
  inputDigest: string;
  dispatchGeneration: number;
}
