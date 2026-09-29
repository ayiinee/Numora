import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { assessmentPackages } from './assessments.js';
import { questionVersions } from './learning.js';
import { users } from './identity.js';

export const dataJobStatus = pgEnum('data_job_status', ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export const evaluationDecision = pgEnum('evaluation_decision', ['PASS', 'DRIFT', 'ANOMALY', 'NOT_ENOUGH_DATA', 'DEMO']);

export const generatorConfigs = pgTable('generator_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateOrCompetencyId: text('template_or_competency_id').notNull(),
  configVersion: integer('config_version').notNull(),
  parameters: jsonb('parameters').notNull(),
  curriculumLimits: jsonb('curriculum_limits').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('generator_configs_template_version_uq').on(table.templateOrCompetencyId, table.configVersion),
  check('generator_configs_version_ck', sql`${table.configVersion} > 0`),
]).enableRLS();

export const generationRuns = pgTable('generation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  configId: uuid('config_id').notNull().references(() => generatorConfigs.id, { onDelete: 'restrict' }),
  originalQuestionVersionId: uuid('original_question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  generatorVersion: text('generator_version').notNull(),
  randomSeed: text('random_seed').notNull(),
  parameterValues: jsonb('parameter_values').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: dataJobStatus('status').notNull().default('PENDING'),
}, (table) => [
  index('generation_runs_original_idx').on(table.originalQuestionVersionId),
  check('generation_runs_finished_ck', sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`),
]).enableRLS();

export const generationCandidates = pgTable('generation_candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  generationRunId: uuid('generation_run_id').notNull().references(() => generationRuns.id, { onDelete: 'restrict' }),
  candidateQuestionVersionId: uuid('candidate_question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  validationStatus: text('validation_status').notNull(),
  failureReason: text('failure_reason'),
}, (table) => [
  uniqueIndex('generation_candidates_version_uq').on(table.candidateQuestionVersionId),
  index('generation_candidates_run_idx').on(table.generationRunId),
]).enableRLS();

export const calibrationRuns = pgTable('calibration_runs', {
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
}, (table) => [check('calibration_runs_sample_ck', sql`${table.sampleSize} >= 0`)]).enableRLS();

export const variantEvaluations = pgTable('variant_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateQuestionVersionId: uuid('candidate_question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  originalQuestionVersionId: uuid('original_question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  calibrationRunId: uuid('calibration_run_id').references(() => calibrationRuns.id, { onDelete: 'restrict' }),
  deltaA: numeric('delta_a', { precision: 12, scale: 6 }),
  deltaB: numeric('delta_b', { precision: 12, scale: 6 }),
  deltaD: numeric('delta_d', { precision: 12, scale: 6 }),
  decision: evaluationDecision('decision').notNull(),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('variant_evaluations_candidate_idx').on(table.candidateQuestionVersionId)]).enableRLS();

export const irtBatches = pgTable('irt_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  packageId: uuid('package_id').references(() => assessmentPackages.id, { onDelete: 'restrict' }),
  batchKind: text('batch_kind').notNull(),
  modelVersion: text('model_version').notNull(),
  status: dataJobStatus('status').notNull().default('PENDING'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  resultReleasedAt: timestamp('result_released_at', { withTimezone: true }),
}, (table) => [index('irt_batches_package_idx').on(table.packageId)]).enableRLS();

export const irtItemResults = pgTable('irt_item_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').notNull().references(() => irtBatches.id, { onDelete: 'restrict' }),
  questionVersionId: uuid('question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  sampleSize: integer('sample_size').notNull(),
  difficultyB: numeric('difficulty_b', { precision: 12, scale: 6 }),
  discriminationA: numeric('discrimination_a', { precision: 12, scale: 6 }),
  guessingC: numeric('guessing_c', { precision: 12, scale: 6 }),
  standardError: jsonb('standard_error'),
  scaleId: text('scale_id'),
  dataStatus: text('data_status').notNull(),
}, (table) => [
  uniqueIndex('irt_item_results_batch_version_uq').on(table.batchId, table.questionVersionId),
  check('irt_item_results_sample_ck', sql`${table.sampleSize} >= 0`),
  check('irt_item_results_insufficient_ck', sql`${table.sampleSize} >= 30 or (${table.difficultyB} is null and ${table.discriminationA} is null and ${table.guessingC} is null)`),
]).enableRLS();
