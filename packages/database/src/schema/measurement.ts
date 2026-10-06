import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { classes } from './classes.js';
import { levels, questions, questionVersions } from './content.js';
import {
  assessmentAttempts,
  assessmentPackages,
  attemptItems,
  scoringPolicyVersions,
} from './assessments.js';
import { analyticsOutbox } from './operations.js';
import { pvpMatchQuestions } from './engagement.js';
import { generationCandidates, generatorConfigs, irtItemResults } from './intelligence.js';
import { computeExecutions, computeOutputs } from './measurement-compute.js';
import {
  assessmentBlueprintVersions,
  assessmentPurpose,
  comparisonState,
  distributionState,
  generatorTemplates,
  measurementState,
  scoringRubricVersions,
  servicePrincipals,
  technicalPolicyVersions,
  validationState,
} from './measurement-foundation.js';

const id = () => uuid('id').defaultRandom().primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ref = (name: string, column: () => AnyPgColumn) =>
  uuid(name).references(column, { onDelete: 'restrict' });

export const measurementContexts = pgTable(
  'measurement_contexts',
  {
    id: id(),
    ecosystem: text('ecosystem').notNull(),
    dimension: text('dimension').notNull(),
    levelId: ref('level_id', () => levels.id),
    tryoutBatchId: ref('tryout_batch_id', (): AnyPgColumn => tryoutBatches.id),
    scaleCode: text('scale_code').notNull(),
    revision: integer('revision').notNull().default(1),
    replacesContextId: ref('replaces_context_id', (): AnyPgColumn => measurementContexts.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('measurement_contexts_scale_revision_uq').on(t.scaleCode, t.revision),
    uniqueIndex('measurement_contexts_id_ecosystem_uq').on(t.id, t.ecosystem),
    check(
      'measurement_contexts_scope_ck',
      sql`(${t.ecosystem} = 'DRILL' and ${t.levelId} is not null and ${t.tryoutBatchId} is null) or (${t.ecosystem} = 'TRYOUT' and ${t.tryoutBatchId} is not null and ${t.levelId} is null)`,
    ),
    check('measurement_contexts_revision_ck', sql`${t.revision} > 0`),
  ],
).enableRLS();

export const configurationApprovals = pgTable(
  'configuration_approvals',
  {
    id: id(),
    technicalPolicyVersionId: ref('technical_policy_version_id', () => technicalPolicyVersions.id),
    generatorTemplateId: ref('generator_template_id', () => generatorTemplates.id),
    generatorConfigId: ref('generator_config_id', (): AnyPgColumn => generatorConfigs.id),
    approvedDigest: text('approved_digest').notNull(),
    scope: jsonb('scope').notNull(),
    approvedByUserId: ref('approved_by_user_id', () => users.id).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'configuration_approvals_one_target_ck',
      sql`num_nonnulls(${t.technicalPolicyVersionId}, ${t.generatorTemplateId}, ${t.generatorConfigId}) = 1`,
    ),
  ],
).enableRLS();

export const contentValidationDecisions = pgTable(
  'content_validation_decisions',
  {
    id: id(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    state: validationState('state').notNull(),
    reviewerUserId: ref('reviewer_user_id', () => users.id),
    servicePrincipalId: ref('service_principal_id', () => servicePrincipals.id),
    sourceOutputId: ref('source_output_id', (): AnyPgColumn => computeOutputs.id),
    configurationApprovalId: ref('configuration_approval_id', () => configurationApprovals.id),
    evidence: jsonb('evidence').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'content_validation_decisions_actor_ck',
      sql`num_nonnulls(${t.reviewerUserId}, ${t.servicePrincipalId}) = 1`,
    ),
  ],
).enableRLS();

export const generationWaves = pgTable(
  'generation_waves',
  {
    id: id(),
    code: text('code').notNull(),
    status: text('status').notNull().default('DRAFT'),
    createdByUserId: ref('created_by_user_id', () => users.id).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    constraints: jsonb('constraints').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('generation_waves_code_uq').on(t.code),
    check(
      'generation_waves_status_ck',
      sql`${t.status} in ('DRAFT','APPROVED','RUNNING','COMPLETED','STOPPED')`,
    ),
  ],
).enableRLS();

export const generationWaveItems = pgTable(
  'generation_wave_items',
  {
    id: id(),
    waveId: ref('wave_id', () => generationWaves.id).notNull(),
    originalQuestionVersionId: ref(
      'original_question_version_id',
      () => questionVersions.id,
    ).notNull(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    generatorConfigId: ref('generator_config_id', () => generatorConfigs.id).notNull(),
    configurationApprovalId: ref(
      'configuration_approval_id',
      () => configurationApprovals.id,
    ).notNull(),
    targetCount: integer('target_count').notNull(),
    maxRegenerateAttempts: integer('max_regenerate_attempts').notNull(),
    constraints: jsonb('constraints').notNull(),
  },
  (t) => [
    uniqueIndex('generation_wave_items_scope_uq').on(
      t.waveId,
      t.originalQuestionVersionId,
      t.contextId,
    ),
    check(
      'generation_wave_items_counts_ck',
      sql`${t.targetCount} > 0 and ${t.maxRegenerateAttempts} >= 0`,
    ),
  ],
).enableRLS();

export const candidateImports = pgTable(
  'candidate_imports',
  {
    id: id(),
    candidateId: ref('candidate_id', () => generationCandidates.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    payloadDigest: text('payload_digest').notNull(),
    importedByUserId: ref('imported_by_user_id', () => users.id),
    importedByServiceId: ref('imported_by_service_id', () => servicePrincipals.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('candidate_imports_candidate_uq').on(t.candidateId),
    index('candidate_imports_version_idx').on(t.questionVersionId),
    check(
      'candidate_imports_actor_ck',
      sql`num_nonnulls(${t.importedByUserId}, ${t.importedByServiceId}) = 1`,
    ),
  ],
).enableRLS();

export const trialStudies = pgTable('trial_studies', {
  id: id(),
  contextId: ref('context_id', () => measurementContexts.id).notNull(),
  originalQuestionVersionId: ref(
    'original_question_version_id',
    () => questionVersions.id,
  ).notNull(),
  requirementsPolicyId: ref('requirements_policy_id', () => technicalPolicyVersions.id).notNull(),
  requirementsApprovalId: ref(
    'requirements_approval_id',
    () => configurationApprovals.id,
  ).notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const trialPhases = pgTable(
  'trial_phases',
  {
    id: id(),
    studyId: ref('study_id', () => trialStudies.id).notNull(),
    purpose: assessmentPurpose('purpose').notNull(),
    candidateQuestionVersionId: ref('candidate_question_version_id', () => questionVersions.id),
    baselineId: ref('baseline_id', (): AnyPgColumn => calibrationBaselines.id),
    referenceSetId: ref('reference_set_id', (): AnyPgColumn => referenceSets.id),
    blueprintVersionId: ref('blueprint_version_id', () => assessmentBlueprintVersions.id).notNull(),
    comparisonPolicyId: ref('comparison_policy_id', () => technicalPolicyVersions.id),
    operationalPolicy: jsonb('operational_policy').notNull(),
    operationalPolicyDigest: text('operational_policy_digest').notNull(),
    status: text('status').notNull().default('PLANNED'),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    cutoffAt: timestamp('cutoff_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('trial_phases_purpose_ck', sql`${t.purpose} <> 'REGULAR'`),
    check('trial_phases_status_ck', sql`${t.status} in ('PLANNED','OPEN','CLOSED','CANCELLED')`),
    check(
      'trial_phases_ab_pins_ck',
      sql`${t.purpose} <> 'VARIANT_AB' or ${t.status} = 'PLANNED' or (${t.candidateQuestionVersionId} is not null and ${t.baselineId} is not null and ${t.referenceSetId} is not null and ${t.comparisonPolicyId} is not null)`,
    ),
    check(
      'trial_phases_pilot_ck',
      sql`${t.purpose} <> 'ORIGINAL_PILOT' or ${t.candidateQuestionVersionId} is null`,
    ),
    check(
      'trial_phases_window_ck',
      sql`${t.cutoffAt} is null or (${t.opensAt} is not null and ${t.cutoffAt} > ${t.opensAt})`,
    ),
  ],
).enableRLS();

export const trialPhasePackages = pgTable(
  'trial_phase_packages',
  {
    id: id(),
    phaseId: ref('phase_id', () => trialPhases.id).notNull(),
    packageId: ref('package_id', () => assessmentPackages.id).notNull(),
    arm: text('arm').notNull(),
  },
  (t) => [
    uniqueIndex('trial_phase_packages_package_uq').on(t.phaseId, t.packageId),
    uniqueIndex('trial_phase_packages_identity_uq').on(t.phaseId, t.packageId, t.arm),
    check('trial_phase_packages_arm_ck', sql`${t.arm} in ('PILOT','A','B')`),
  ],
).enableRLS();

export const trialCohorts = pgTable(
  'trial_cohorts',
  {
    id: id(),
    studyId: ref('study_id', () => trialStudies.id).notNull(),
    role: text('role').notNull(),
    classId: ref('class_id', () => classes.id),
    periodStartsAt: timestamp('period_starts_at', { withTimezone: true }).notNull(),
    periodEndsAt: timestamp('period_ends_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('trial_cohorts_role_ck', sql`${t.role} in ('PILOT','AB')`),
    check('trial_cohorts_window_ck', sql`${t.periodEndsAt} > ${t.periodStartsAt}`),
  ],
).enableRLS();

export const trialCohortMembers = pgTable(
  'trial_cohort_members',
  {
    id: id(),
    cohortId: ref('cohort_id', () => trialCohorts.id).notNull(),
    studentId: ref('student_id', () => users.id).notNull(),
    status: text('status').notNull().default('PLANNED'),
    dropoutReason: text('dropout_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('trial_cohort_members_student_uq').on(t.cohortId, t.studentId),
    check(
      'trial_cohort_members_status_ck',
      sql`${t.status} in ('PLANNED','ELIGIBLE','INELIGIBLE','ASSIGNED','COMPLETED','DROPPED')`,
    ),
  ],
).enableRLS();

export const trialFamilyReservations = pgTable(
  'trial_family_reservations',
  {
    id: id(),
    cohortMemberId: ref('cohort_member_id', () => trialCohortMembers.id).notNull(),
    familyId: ref('family_id', () => questions.id).notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull().defaultNow(),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    invalidatingExposureId: ref(
      'invalidating_exposure_id',
      (): AnyPgColumn => studentItemExposures.id,
    ),
    reason: text('reason'),
  },
  (t) => [
    uniqueIndex('trial_family_reservations_member_family_uq').on(t.cohortMemberId, t.familyId),
    check(
      'trial_family_reservations_invalid_ck',
      sql`(${t.invalidatedAt} is null and ${t.invalidatingExposureId} is null and ${t.reason} is null) or (${t.invalidatedAt} is not null and ${t.invalidatingExposureId} is not null and ${t.reason} is not null)`,
    ),
  ],
).enableRLS();

export const trialAssignments = pgTable(
  'trial_assignments',
  {
    id: id(),
    phaseId: ref('phase_id', () => trialPhases.id).notNull(),
    cohortMemberId: ref('cohort_member_id', () => trialCohortMembers.id).notNull(),
    studentId: ref('student_id', () => users.id).notNull(),
    packageId: ref('package_id', () => assessmentPackages.id).notNull(),
    arm: text('arm').notNull(),
    allocationDigest: text('allocation_digest').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('trial_assignments_student_phase_uq').on(t.phaseId, t.studentId),
    uniqueIndex('trial_assignments_scope_uq').on(t.id, t.studentId, t.packageId, t.phaseId),
    foreignKey({
      name: 'trial_assignments_phase_package_fk',
      columns: [t.phaseId, t.packageId, t.arm],
      foreignColumns: [
        trialPhasePackages.phaseId,
        trialPhasePackages.packageId,
        trialPhasePackages.arm,
      ],
    }).onDelete('restrict'),
  ],
).enableRLS();

export const trialEligibilitySnapshots = pgTable('trial_eligibility_snapshots', {
  id: id(),
  phaseId: ref('phase_id', () => trialPhases.id).notNull(),
  studentId: ref('student_id', () => users.id).notNull(),
  assignmentId: ref('assignment_id', () => trialAssignments.id),
  eligible: boolean('eligible').notNull(),
  reasons: jsonb('reasons').notNull(),
  facts: jsonb('facts').notNull(),
  policyDigest: text('policy_digest').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const trialCheckpoints = pgTable(
  'trial_checkpoints',
  {
    id: id(),
    phaseId: ref('phase_id', () => trialPhases.id).notNull(),
    cutoffAt: timestamp('cutoff_at', { withTimezone: true }).notNull(),
    counts: jsonb('counts').notNull(),
    responseSnapshotId: ref('response_snapshot_id', (): AnyPgColumn => responseSnapshots.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('trial_checkpoints_cutoff_uq').on(t.phaseId, t.cutoffAt)],
).enableRLS();

export const contentDeliveryManifests = pgTable(
  'content_delivery_manifests',
  {
    id: id(),
    studentId: ref('student_id', () => users.id).notNull(),
    module: text('module').notNull(),
    kind: text('kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('content_delivery_manifests_key_uq').on(t.studentId, t.idempotencyKey),
    check(
      'content_delivery_manifests_module_ck',
      sql`${t.module} in ('PRETEST','DRILL','TRYOUT','PVP')`,
    ),
    check(
      'content_delivery_manifests_kind_ck',
      sql`${t.kind} in ('ITEM_PAYLOAD_ISSUED','EXPLANATION_PAYLOAD_ISSUED','LEGACY_UNVERIFIED')`,
    ),
  ],
).enableRLS();

export const contentDeliveryItems = pgTable(
  'content_delivery_items',
  {
    id: id(),
    manifestId: ref('manifest_id', () => contentDeliveryManifests.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    familyId: ref('family_id', () => questions.id).notNull(),
    attemptItemId: ref('attempt_item_id', () => attemptItems.id),
    pvpMatchQuestionId: uuid('pvp_match_question_id'),
  },
  (t) => [
    uniqueIndex('content_delivery_items_manifest_version_uq').on(t.manifestId, t.questionVersionId),
    foreignKey({
      name: 'content_delivery_items_pvp_fk',
      columns: [t.pvpMatchQuestionId],
      foreignColumns: [pvpMatchQuestions.id],
    }).onDelete('restrict'),
    check(
      'content_delivery_items_source_ck',
      sql`num_nonnulls(${t.attemptItemId}, ${t.pvpMatchQuestionId}) = 1`,
    ),
  ],
).enableRLS();

export const studentItemExposures = pgTable(
  'student_item_exposures',
  {
    id: id(),
    deliveryItemId: ref('delivery_item_id', () => contentDeliveryItems.id).notNull(),
    studentId: ref('student_id', () => users.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    familyId: ref('family_id', () => questions.id).notNull(),
    kind: text('kind').notNull(),
    module: text('module').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('student_item_exposures_delivery_uq').on(t.deliveryItemId),
    index('student_item_exposures_family_time_idx').on(t.studentId, t.familyId, t.occurredAt),
  ],
).enableRLS();

export const responseSnapshots = pgTable(
  'response_snapshots',
  {
    id: id(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    phaseId: ref('phase_id', () => trialPhases.id),
    status: text('status').notNull().default('BUILDING'),
    cutoffAt: timestamp('cutoff_at', { withTimezone: true }).notNull(),
    policy: jsonb('policy').notNull(),
    policyDigest: text('policy_digest').notNull(),
    respondentKeyVersion: text('respondent_key_version').notNull(),
    digest: text('digest'),
    rowCount: integer('row_count'),
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    replacesSnapshotId: ref('replaces_snapshot_id', (): AnyPgColumn => responseSnapshots.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('response_snapshots_status_ck', sql`${t.status} in ('BUILDING','FROZEN')`),
    check(
      'response_snapshots_freeze_ck',
      sql`${t.status} <> 'FROZEN' or (${t.digest} is not null and ${t.rowCount} >= 0 and ${t.frozenAt} is not null)`,
    ),
  ],
).enableRLS();

export const responseSnapshotItems = pgTable(
  'response_snapshot_items',
  {
    id: id(),
    snapshotId: ref('snapshot_id', () => responseSnapshots.id).notNull(),
    respondentId: text('respondent_id').notNull(),
    attemptId: ref('attempt_id', () => assessmentAttempts.id).notNull(),
    attemptItemId: ref('attempt_item_id', () => attemptItems.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    rubricVersionId: ref('rubric_version_id', () => scoringRubricVersions.id).notNull(),
    assignmentId: ref('assignment_id', () => trialAssignments.id),
    arm: text('arm'),
    rawAnswer: jsonb('raw_answer'),
    scoreCategory: integer('score_category'),
    maximumScoreCategory: integer('maximum_score_category').notNull(),
    fullyCorrect: boolean('fully_correct'),
    awardedPoints: numeric('awarded_points'),
    maxPoints: numeric('max_points').notNull(),
    responseState: text('response_state').notNull(),
    operationalEligible: boolean('operational_eligible').notNull(),
    operationalExclusionReasons: jsonb('operational_exclusion_reasons').notNull(),
    exposureFacts: jsonb('exposure_facts').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('response_snapshot_items_source_uq').on(t.snapshotId, t.attemptItemId),
    uniqueIndex('response_snapshot_items_id_snapshot_uq').on(t.id, t.snapshotId),
    check(
      'response_snapshot_items_category_ck',
      sql`${t.maximumScoreCategory} > 0 and (${t.scoreCategory} is null or ${t.scoreCategory} between 0 and ${t.maximumScoreCategory})`,
    ),
    check(
      'response_snapshot_items_state_ck',
      sql`${t.responseState} in ('RESPONDED','OMITTED','NOT_PRESENTED','INVALID')`,
    ),
    check(
      'response_snapshot_items_points_ck',
      sql`${t.maxPoints} > 0 and (${t.awardedPoints} is null or ${t.awardedPoints} between 0 and ${t.maxPoints})`,
    ),
  ],
).enableRLS();

export const analysisRequests = pgTable(
  'analysis_requests',
  {
    id: id(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestType: text('request_type').notNull(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    snapshotId: ref('snapshot_id', () => responseSnapshots.id),
    waveItemId: ref('wave_item_id', () => generationWaveItems.id),
    packageId: ref('package_id', () => assessmentPackages.id),
    baselineId: ref('baseline_id', (): AnyPgColumn => calibrationBaselines.id),
    referenceSetId: ref('reference_set_id', (): AnyPgColumn => referenceSets.id),
    configurationPins: jsonb('configuration_pins').notNull(),
    inputDigest: text('input_digest').notNull(),
    contractVersion: integer('contract_version').notNull().default(3),
    status: text('status').notNull().default('PENDING'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    acceptedExecutionId: ref('accepted_execution_id', (): AnyPgColumn => computeExecutions.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('analysis_requests_idempotency_uq').on(t.idempotencyKey),
    check(
      'analysis_requests_type_ck',
      sql`${t.requestType} in ('CALIBRATE_ORIGINAL','GENERATE_VARIANTS','COMPARE_VARIANTS','EVALUATE_PACKAGE','MONITOR_PRODUCTION','CALIBRATE_TRYOUT')`,
    ),
    check(
      'analysis_requests_status_ck',
      sql`${t.status} in ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')`,
    ),
    check(
      'analysis_requests_input_ck',
      sql`(${t.requestType} = 'GENERATE_VARIANTS' and ${t.waveItemId} is not null) or (${t.requestType} = 'EVALUATE_PACKAGE' and ${t.packageId} is not null) or (${t.requestType} in ('CALIBRATE_ORIGINAL','COMPARE_VARIANTS','MONITOR_PRODUCTION','CALIBRATE_TRYOUT') and ${t.snapshotId} is not null)`,
    ),
  ],
).enableRLS();

export const outboxDeliveries = pgTable(
  'outbox_deliveries',
  {
    id: id(),
    outboxId: ref('outbox_id', () => analyticsOutbox.id).notNull(),
    consumer: text('consumer').notNull(),
    attempts: integer('attempts').notNull().default(0),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    retryAt: timestamp('retry_at', { withTimezone: true }),
    failureCode: text('failure_code'),
  },
  (t) => [
    uniqueIndex('outbox_deliveries_consumer_uq').on(t.outboxId, t.consumer),
    check('outbox_deliveries_attempts_ck', sql`${t.attempts} >= 0`),
  ],
).enableRLS();

/** Main-owned immutable authorization to run one compute execution. */
export const analysisRequestDispatches = pgTable(
  'analysis_request_dispatches',
  {
    id: id(),
    requestId: ref('request_id', () => analysisRequests.id).notNull(),
    generation: integer('generation').notNull(),
    operationKey: text('operation_key').notNull(),
    operationFingerprint: text('operation_fingerprint').notNull(),
    actorUserId: ref('actor_user_id', () => users.id).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('analysis_dispatch_operation_uq').on(t.operationKey),
    uniqueIndex('analysis_dispatch_generation_uq').on(t.requestId, t.generation),
    uniqueIndex('analysis_dispatch_id_request_uq').on(t.id, t.requestId),
    check('analysis_dispatch_generation_ck', sql`${t.generation} > 0`),
  ],
).enableRLS();

export const calibrationBaselines = pgTable(
  'calibration_baselines',
  {
    id: id(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    rubricVersionId: ref('rubric_version_id', () => scoringRubricVersions.id).notNull(),
    sourceItemResultId: ref('source_item_result_id', () => irtItemResults.id).notNull(),
    sourceOutputId: ref('source_output_id', () => computeOutputs.id).notNull(),
    qualityApprovalId: ref('quality_approval_id', () => configurationApprovals.id).notNull(),
    version: integer('version').notNull(),
    parameterSnapshot: jsonb('parameter_snapshot').notNull(),
    uncertainty: jsonb('uncertainty').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('calibration_baselines_version_uq').on(t.contextId, t.questionVersionId, t.version),
    check('calibration_baselines_version_ck', sql`${t.version} > 0`),
  ],
).enableRLS();

export const referenceSets = pgTable(
  'reference_sets',
  {
    id: id(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    version: integer('version').notNull(),
    sourceOutputId: ref('source_output_id', () => computeOutputs.id).notNull(),
    qualityApprovalId: ref('quality_approval_id', () => configurationApprovals.id).notNull(),
    evidence: jsonb('evidence').notNull(),
    digest: text('digest').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reference_sets_context_version_uq').on(t.contextId, t.version),
    check('reference_sets_version_ck', sql`${t.version} > 0`),
  ],
).enableRLS();

export const referenceSetItems = pgTable(
  'reference_set_items',
  {
    id: id(),
    referenceSetId: ref('reference_set_id', () => referenceSets.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    rubricVersionId: ref('rubric_version_id', () => scoringRubricVersions.id).notNull(),
    sourceItemResultId: ref('source_item_result_id', () => irtItemResults.id).notNull(),
    parameterSnapshot: jsonb('parameter_snapshot').notNull(),
    uncertainty: jsonb('uncertainty').notNull(),
  },
  (t) => [uniqueIndex('reference_set_items_version_uq').on(t.referenceSetId, t.questionVersionId)],
).enableRLS();

export const activeParameterBindings = pgTable(
  'active_parameter_bindings',
  {
    id: id(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    rubricVersionId: ref('rubric_version_id', () => scoringRubricVersions.id).notNull(),
    itemResultId: ref('item_result_id', () => irtItemResults.id).notNull(),
    activatedByUserId: ref('activated_by_user_id', () => users.id).notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('active_parameter_bindings_scope_uq').on(
      t.contextId,
      t.questionVersionId,
      t.rubricVersionId,
    ),
  ],
).enableRLS();

export const packageQualityResults = pgTable('package_quality_results', {
  id: id(),
  packageId: ref('package_id', () => assessmentPackages.id).notNull(),
  contextId: ref('context_id', () => measurementContexts.id).notNull(),
  blueprintVersionId: ref('blueprint_version_id', () => assessmentBlueprintVersions.id).notNull(),
  sourceOutputId: ref('source_output_id', () => computeOutputs.id).notNull(),
  evaluationApprovalId: ref('evaluation_approval_id', () => configurationApprovals.id).notNull(),
  packageDigest: text('package_digest').notNull(),
  decision: comparisonState('decision').notNull(),
  evidence: jsonb('evidence').notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const itemDistributionDecisions = pgTable(
  'item_distribution_decisions',
  {
    id: id(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    contextId: ref('context_id', () => measurementContexts.id).notNull(),
    purpose: text('purpose').notNull(),
    state: distributionState('state').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    sourceOutputId: ref('source_output_id', () => computeOutputs.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('item_distribution_decisions_scope_idx').on(
      t.questionVersionId,
      t.contextId,
      t.purpose,
      t.createdAt,
    ),
  ],
).enableRLS();

export const monitoringFindings = pgTable('monitoring_findings', {
  id: id(),
  requestId: ref('request_id', () => analysisRequests.id).notNull(),
  sourceOutputId: ref('source_output_id', () => computeOutputs.id).notNull(),
  questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
  state: measurementState('state').notNull(),
  evidence: jsonb('evidence').notNull(),
  distributionDecisionId: ref('distribution_decision_id', () => itemDistributionDecisions.id),
  createdAt: createdAt(),
}).enableRLS();

export const tryoutBatches = pgTable(
  'tryout_batches',
  {
    id: id(),
    packageId: ref('package_id', () => assessmentPackages.id).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    cutoffAt: timestamp('cutoff_at', { withTimezone: true }).notNull(),
    resultDueAt: timestamp('result_due_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('PLANNED'),
    releasePolicy: jsonb('release_policy'),
    releasePolicyDigest: text('release_policy_digest'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tryout_batches_package_uq').on(t.packageId),
    check(
      'tryout_batches_status_ck',
      sql`${t.status} in ('PLANNED','OPEN','CLOSED','PROCESSING','PUBLISHED')`,
    ),
    check(
      'tryout_batches_window_ck',
      sql`${t.closesAt} > ${t.startsAt} and ${t.cutoffAt} >= ${t.closesAt} and ${t.resultDueAt} = ${t.closesAt} + interval '72 hours'`,
    ),
  ],
).enableRLS();

export const assessmentErrata = pgTable(
  'assessment_errata',
  {
    id: id(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    correctionVersion: integer('correction_version').notNull(),
    definition: jsonb('definition').notNull(),
    digest: text('digest').notNull(),
    approvedByUserId: ref('approved_by_user_id', () => users.id).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('assessment_errata_version_uq').on(t.questionVersionId, t.correctionVersion),
    check('assessment_errata_version_ck', sql`${t.correctionVersion} > 0`),
  ],
).enableRLS();

export const tryoutResultFinalizations = pgTable(
  'tryout_result_finalizations',
  {
    id: id(),
    batchId: ref('batch_id', () => tryoutBatches.id).notNull(),
    version: integer('version').notNull(),
    mode: text('mode').notNull(),
    sourceOutputId: ref('source_output_id', () => computeOutputs.id),
    scoringPolicyVersionId: ref(
      'scoring_policy_version_id',
      () => scoringPolicyVersions.id,
    ).notNull(),
    mappingApprovalId: ref('mapping_approval_id', () => configurationApprovals.id),
    policySnapshot: jsonb('policy_snapshot').notNull(),
    digest: text('digest').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tryout_result_finalizations_version_uq').on(t.batchId, t.version),
    uniqueIndex('tryout_result_finalizations_published_uq')
      .on(t.batchId)
      .where(sql`${t.publishedAt} is not null`),
    check('tryout_result_finalizations_mode_ck', sql`${t.mode} in ('IRT','FALLBACK','UNSCORABLE')`),
    check(
      'tryout_result_finalizations_irt_ck',
      sql`${t.mode} <> 'IRT' or (${t.sourceOutputId} is not null and ${t.mappingApprovalId} is not null)`,
    ),
  ],
).enableRLS();

export const tryoutFinalizationItems = pgTable(
  'tryout_finalization_items',
  {
    id: id(),
    finalizationId: ref('finalization_id', () => tryoutResultFinalizations.id).notNull(),
    questionVersionId: ref('question_version_id', () => questionVersions.id).notNull(),
    included: boolean('included').notNull(),
    maxPoints: numeric('max_points').notNull(),
    reason: text('reason').notNull(),
    erratumId: ref('erratum_id', () => assessmentErrata.id),
  },
  (t) => [
    uniqueIndex('tryout_finalization_items_version_uq').on(t.finalizationId, t.questionVersionId),
    check('tryout_finalization_items_points_ck', sql`${t.maxPoints} >= 0`),
  ],
).enableRLS();

export const tryoutAttemptResults = pgTable(
  'tryout_attempt_results',
  {
    id: id(),
    finalizationId: ref('finalization_id', () => tryoutResultFinalizations.id).notNull(),
    attemptId: ref('attempt_id', () => assessmentAttempts.id).notNull(),
    score: numeric('score'),
    theta: numeric('theta'),
    standardError: numeric('standard_error'),
    rawPoints: numeric('raw_points'),
    maximumPoints: numeric('maximum_points'),
    rank: integer('rank'),
    percentile: numeric('percentile'),
    coverage: jsonb('coverage').notNull(),
  },
  (t) => [
    uniqueIndex('tryout_attempt_results_attempt_uq').on(t.finalizationId, t.attemptId),
    check(
      'tryout_attempt_results_bounds_ck',
      sql`(${t.rank} is null or ${t.rank} > 0) and (${t.percentile} is null or ${t.percentile} between 0 and 100) and (${t.standardError} is null or ${t.standardError} >= 0)`,
    ),
  ],
).enableRLS();
