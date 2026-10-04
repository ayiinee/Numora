import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { assessmentPackages } from './assessments.js';
import { questionVersions } from './content.js';
import { users } from './identity.js';
import {
  comparisonState,
  configurationState,
  generatorTemplates,
  irtCompute,
  measurementState,
  scoringRubricVersions,
} from './measurement-foundation.js';
import {
  analysisRequests,
  calibrationBaselines,
  generationWaveItems,
  measurementContexts,
  referenceSets,
  responseSnapshots,
  trialPhases,
} from './measurement.js';
import { computeExecutions, computeOutputs } from './measurement-compute.js';

export const dataJobStatus = pgEnum('data_job_status', [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);
export const evaluationDecision = pgEnum('evaluation_decision', [
  'PASS',
  'DRIFT',
  'ANOMALY',
  'NOT_ENOUGH_DATA',
  'DEMO',
]);

export const generatorConfigs = irtCompute
  .table(
    'generator_configs',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      templateOrCompetencyId: text('template_or_competency_id').notNull(),
      configVersion: integer('config_version').notNull(),
      parameters: jsonb('parameters').notNull(),
      curriculumLimits: jsonb('curriculum_limits').notNull(),
      templateVersionId: uuid('template_version_id').references(() => generatorTemplates.id, {
        onDelete: 'restrict',
      }),
      contextId: uuid('context_id').references((): AnyPgColumn => measurementContexts.id, {
        onDelete: 'restrict',
      }),
      digest: text('digest'),
      status: configurationState('status').notNull().default('DRAFT'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex('generator_configs_template_version_uq').on(
        table.templateOrCompetencyId,
        table.configVersion,
      ),
      check('generator_configs_version_ck', sql`${table.configVersion} > 0`),
    ],
  )
  .enableRLS();

export const generationRuns = irtCompute
  .table(
    'generation_runs',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      configId: uuid('config_id')
        .notNull()
        .references(() => generatorConfigs.id, { onDelete: 'restrict' }),
      originalQuestionVersionId: uuid('original_question_version_id')
        .notNull()
        .references(() => questionVersions.id, { onDelete: 'restrict' }),
      waveItemId: uuid('wave_item_id').references((): AnyPgColumn => generationWaveItems.id, {
        onDelete: 'restrict',
      }),
      executionId: uuid('execution_id').references((): AnyPgColumn => computeExecutions.id, {
        onDelete: 'restrict',
      }),
      generatorVersion: text('generator_version').notNull(),
      randomSeed: text('random_seed').notNull(),
      parameterValues: jsonb('parameter_values').notNull(),
      startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
      finishedAt: timestamp('finished_at', { withTimezone: true }),
      status: dataJobStatus('status').notNull().default('PENDING'),
    },
    (table) => [
      index('generation_runs_original_idx').on(table.originalQuestionVersionId),
      check(
        'generation_runs_finished_ck',
        sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`,
      ),
    ],
  )
  .enableRLS();

export const generationCandidates = irtCompute
  .table(
    'generation_candidates',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      generationRunId: uuid('generation_run_id')
        .notNull()
        .references(() => generationRuns.id, { onDelete: 'restrict' }),
      // Legacy linkage only. New canonical mappings belong to public.candidate_imports.
      candidateQuestionVersionId: uuid('candidate_question_version_id').references(
        () => questionVersions.id,
        { onDelete: 'restrict' },
      ),
      parentOriginalQuestionVersionId: uuid('parent_original_question_version_id').references(
        () => questionVersions.id,
        { onDelete: 'restrict' },
      ),
      replacementOfId: uuid('replacement_of_id').references(
        (): AnyPgColumn => generationCandidates.id,
        { onDelete: 'restrict' },
      ),
      payload: jsonb('payload'),
      payloadDigest: text('payload_digest'),
      randomSeed: text('random_seed'),
      parameterValues: jsonb('parameter_values'),
      sealedAt: timestamp('sealed_at', { withTimezone: true }),
      validationStatus: text('validation_status').notNull(),
      failureReason: text('failure_reason'),
    },
    (table) => [
      uniqueIndex('generation_candidates_version_uq').on(table.candidateQuestionVersionId),
      index('generation_candidates_run_idx').on(table.generationRunId),
      check(
        'generation_candidates_payload_ck',
        sql`${table.candidateQuestionVersionId} is not null or (${table.payload} is not null and ${table.payloadDigest} is not null and ${table.randomSeed} is not null and ${table.parameterValues} is not null and ${table.parentOriginalQuestionVersionId} is not null)`,
      ),
    ],
  )
  .enableRLS();

export const calibrationRuns = pgTable(
  'calibration_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemRole: text('item_role').notNull(),
    anchorScaleId: text('anchor_scale_id'),
    modelVersion: text('model_version').notNull(),
    sampleSize: integer('sample_size').notNull(),
    status: dataJobStatus('status').notNull().default('PENDING'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    notes: text('notes'),
    parameters: jsonb('parameters').notNull().default({}),
  },
  (table) => [check('calibration_runs_sample_ck', sql`${table.sampleSize} >= 0`)],
).enableRLS();

export const variantEvaluations = pgTable(
  'variant_evaluations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    candidateQuestionVersionId: uuid('candidate_question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    originalQuestionVersionId: uuid('original_question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    calibrationRunId: uuid('calibration_run_id').references(() => calibrationRuns.id, {
      onDelete: 'restrict',
    }),
    deltaA: numeric('delta_a', { precision: 12, scale: 6 }),
    deltaB: numeric('delta_b', { precision: 12, scale: 6 }),
    deltaD: numeric('delta_d', { precision: 12, scale: 6 }),
    decision: evaluationDecision('decision').notNull(),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
    phaseId: uuid('phase_id').references((): AnyPgColumn => trialPhases.id, {
      onDelete: 'restrict',
    }),
    baselineId: uuid('baseline_id').references((): AnyPgColumn => calibrationBaselines.id, {
      onDelete: 'restrict',
    }),
    referenceSetId: uuid('reference_set_id').references((): AnyPgColumn => referenceSets.id, {
      onDelete: 'restrict',
    }),
    sourceOutputId: uuid('source_output_id').references((): AnyPgColumn => computeOutputs.id, {
      onDelete: 'restrict',
    }),
    controlItemResultId: uuid('control_item_result_id').references(
      (): AnyPgColumn => irtItemResults.id,
      { onDelete: 'restrict' },
    ),
    candidateItemResultId: uuid('candidate_item_result_id').references(
      (): AnyPgColumn => irtItemResults.id,
      { onDelete: 'restrict' },
    ),
    comparisonState: comparisonState('comparison_state'),
    evidence: jsonb('evidence'),
  },
  (table) => [index('variant_evaluations_candidate_idx').on(table.candidateQuestionVersionId)],
).enableRLS();

export const irtBatches = pgTable(
  'irt_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    packageId: uuid('package_id').references(() => assessmentPackages.id, { onDelete: 'restrict' }),
    batchKind: text('batch_kind').notNull(),
    modelVersion: text('model_version').notNull(),
    status: dataJobStatus('status').notNull().default('PENDING'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    resultReleasedAt: timestamp('result_released_at', { withTimezone: true }),
    inputSnapshot: jsonb('input_snapshot'),
    outputSnapshot: jsonb('output_snapshot'),
    outputDigest: text('output_digest'),
    failureCode: text('failure_code'),
    contextId: uuid('context_id').references((): AnyPgColumn => measurementContexts.id, {
      onDelete: 'restrict',
    }),
    responseSnapshotId: uuid('response_snapshot_id').references(
      (): AnyPgColumn => responseSnapshots.id,
      { onDelete: 'restrict' },
    ),
    analysisRequestId: uuid('analysis_request_id').references(
      (): AnyPgColumn => analysisRequests.id,
      { onDelete: 'restrict' },
    ),
    sourceOutputId: uuid('source_output_id').references((): AnyPgColumn => computeOutputs.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [index('irt_batches_package_idx').on(table.packageId),
    uniqueIndex('irt_batches_source_output_uq').on(table.sourceOutputId)],
).enableRLS();

export const irtItemResults = pgTable(
  'irt_item_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => irtBatches.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    sampleSize: integer('sample_size').notNull(),
    difficultyB: numeric('difficulty_b', { precision: 12, scale: 6 }),
    discriminationA: numeric('discrimination_a', { precision: 12, scale: 6 }),
    guessingC: numeric('guessing_c', { precision: 12, scale: 6 }),
    standardError: jsonb('standard_error'),
    scaleId: text('scale_id'),
    dataStatus: text('data_status').notNull(),
    modelFamily: text('model_family').notNull().default('LEGACY'),
    rubricVersionId: uuid('rubric_version_id').references(() => scoringRubricVersions.id, {
      onDelete: 'restrict',
    }),
    eligibleRespondentCount: integer('eligible_respondent_count'),
    measurementState: measurementState('measurement_state').notNull().default('UNCALIBRATED'),
    qualityEvidence: jsonb('quality_evidence'),
  },
  (table) => [
    uniqueIndex('irt_item_results_batch_version_uq').on(table.batchId, table.questionVersionId),
    check('irt_item_results_sample_ck', sql`${table.sampleSize} >= 0`),
    check(
      'irt_item_results_insufficient_ck',
      sql`${table.modelFamily} <> 'LEGACY' or ${table.sampleSize} >= 30 or (${table.difficultyB} is null and ${table.discriminationA} is null and ${table.guessingC} is null)`,
    ),
    check(
      'irt_item_results_model_ck',
      sql`${table.modelFamily} in ('LEGACY','2PL','GPCM') and (${table.modelFamily} = 'LEGACY' or (${table.guessingC} is null and ${table.rubricVersionId} is not null and ${table.eligibleRespondentCount} is not null and ${table.eligibleRespondentCount} between 0 and ${table.sampleSize}))`,
    ),
  ],
).enableRLS();

export const irtItemStepParameters = pgTable(
  'irt_item_step_parameters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemResultId: uuid('item_result_id')
      .notNull()
      .references(() => irtItemResults.id, { onDelete: 'restrict' }),
    step: integer('step').notNull(),
    value: numeric('value').notNull(),
    standardError: numeric('standard_error'),
  },
  (t) => [
    uniqueIndex('irt_item_step_parameters_step_uq').on(t.itemResultId, t.step),
    check(
      'irt_item_step_parameters_bounds_ck',
      sql`${t.step} > 0 and (${t.standardError} is null or ${t.standardError} >= 0)`,
    ),
  ],
).enableRLS();
