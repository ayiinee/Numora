import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { analysisRequestDispatches, analysisRequests, responseSnapshotItems, responseSnapshots } from './measurement.js';
import { generationCandidates, generatorConfigs } from './intelligence.js';
import {
  irtCompute,
  servicePrincipals,
  technicalPolicyVersions,
} from './measurement-foundation.js';

export const computeExecutions = irtCompute
  .table(
    'compute_executions',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      requestId: uuid('request_id')
        .notNull()
        .references((): AnyPgColumn => analysisRequests.id, { onDelete: 'restrict' }),
      dispatchId: uuid('dispatch_id').references(() => analysisRequestDispatches.id, { onDelete: 'restrict' }),
      attemptNumber: integer('attempt_number').notNull(),
      fencingToken: uuid('fencing_token').defaultRandom().notNull(),
      servicePrincipalId: uuid('service_principal_id')
        .notNull()
        .references(() => servicePrincipals.id, { onDelete: 'restrict' }),
      status: text('status').notNull().default('RUNNING'),
      leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
      heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
      startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
      finishedAt: timestamp('finished_at', { withTimezone: true }),
      failureCode: text('failure_code'),
    },
    (t) => [
      uniqueIndex('compute_executions_request_attempt_uq').on(t.requestId, t.attemptNumber),
      uniqueIndex('compute_executions_dispatch_uq').on(t.dispatchId),
      uniqueIndex('compute_executions_request_active_uq')
        .on(t.requestId)
        .where(sql`${t.status} = 'RUNNING'`),
      uniqueIndex('compute_executions_id_request_uq').on(t.id, t.requestId),
      check('compute_executions_attempt_ck', sql`${t.attemptNumber} > 0`),
      check(
        'compute_executions_status_ck',
        sql`${t.status} in ('RUNNING','SUCCEEDED','FAILED','EXPIRED')`,
      ),
      check(
        'compute_executions_finished_ck',
        sql`(${t.status} = 'RUNNING' and ${t.finishedAt} is null) or (${t.status} <> 'RUNNING' and ${t.finishedAt} >= ${t.startedAt})`,
      ),
    ],
  )
  .enableRLS();

export const analysisDatasets = irtCompute
  .table(
    'analysis_datasets',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      executionId: uuid('execution_id')
        .notNull()
        .references(() => computeExecutions.id, { onDelete: 'restrict' }),
      snapshotId: uuid('snapshot_id')
        .notNull()
        .references(() => responseSnapshots.id, { onDelete: 'restrict' }),
      selectionPolicyId: uuid('selection_policy_id')
        .notNull()
        .references(() => technicalPolicyVersions.id, { onDelete: 'restrict' }),
      status: text('status').notNull().default('BUILDING'),
      digest: text('digest'),
      selectedCount: integer('selected_count'),
      sealedAt: timestamp('sealed_at', { withTimezone: true }),
    },
    (t) => [
      uniqueIndex('analysis_datasets_id_snapshot_uq').on(t.id, t.snapshotId),
      check('analysis_datasets_status_ck', sql`${t.status} in ('BUILDING','SEALED')`),
      check(
        'analysis_datasets_sealed_ck',
        sql`${t.status} <> 'SEALED' or (${t.digest} is not null and ${t.selectedCount} >= 0 and ${t.sealedAt} is not null)`,
      ),
    ],
  )
  .enableRLS();

export const analysisResponseSelections = irtCompute
  .table(
    'analysis_response_selections',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      datasetId: uuid('dataset_id').notNull(),
      snapshotId: uuid('snapshot_id').notNull(),
      snapshotItemId: uuid('snapshot_item_id').notNull(),
      decision: text('decision').notNull(),
      reasons: jsonb('reasons').notNull(),
    },
    (t) => [
      uniqueIndex('analysis_response_selections_source_uq').on(t.datasetId, t.snapshotItemId),
      check(
        'analysis_response_selections_decision_ck',
        sql`${t.decision} in ('INCLUDE','EXCLUDE')`,
      ),
      foreignKey({
        name: 'analysis_response_selections_dataset_fk',
        columns: [t.datasetId, t.snapshotId],
        foreignColumns: [analysisDatasets.id, analysisDatasets.snapshotId],
      }).onDelete('restrict'),
      foreignKey({
        name: 'analysis_response_selections_snapshot_fk',
        columns: [t.snapshotItemId, t.snapshotId],
        foreignColumns: [responseSnapshotItems.id, responseSnapshotItems.snapshotId],
      }).onDelete('restrict'),
    ],
  )
  .enableRLS();

export const computeOutputs = irtCompute
  .table(
    'compute_outputs',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      executionId: uuid('execution_id')
        .notNull()
        .references(() => computeExecutions.id, { onDelete: 'restrict' }),
      datasetId: uuid('dataset_id').references(() => analysisDatasets.id, { onDelete: 'restrict' }),
      kind: text('kind').notNull(),
      sequenceNumber: integer('sequence_number').notNull().default(1),
      contractVersion: integer('contract_version').notNull().default(3),
      inputDigest: text('input_digest').notNull(),
      digest: text('digest').notNull(),
      payload: jsonb('payload').notNull(),
      scientificDecision: text('scientific_decision').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex('compute_outputs_execution_kind_sequence_uq').on(
        t.executionId,
        t.kind,
        t.sequenceNumber,
      ),
      index('compute_outputs_digest_idx').on(t.digest),
      check(
        'compute_outputs_sequence_ck',
        sql`${t.sequenceNumber} > 0 and ${t.contractVersion} >= 3`,
      ),
      check(
        'compute_outputs_decision_ck',
        sql`${t.scientificDecision} in ('PASS','DRIFT','ANOMALY','INSUFFICIENT','CALIBRATION_FAILED','NOT_COMPARABLE','CONTENT_VALID','REVIEW','TRYOUT_QUALITY_PASS')`,
      ),
    ],
  )
  .enableRLS();

export const candidateValidationResults = irtCompute
  .table(
    'candidate_validation_results',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      candidateId: uuid('candidate_id')
        .notNull()
        .references(() => generationCandidates.id, { onDelete: 'restrict' }),
      validatorPolicyId: uuid('validator_policy_id')
        .notNull()
        .references(() => technicalPolicyVersions.id, { onDelete: 'restrict' }),
      sourceOutputId: uuid('source_output_id')
        .notNull()
        .references(() => computeOutputs.id, { onDelete: 'restrict' }),
      decision: text('decision').notNull(),
      checks: jsonb('checks').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      check(
        'candidate_validation_results_decision_ck',
        sql`${t.decision} in ('CONTENT_VALID','REVIEW','QUARANTINED')`,
      ),
    ],
  )
  .enableRLS();

export const adjustmentIterations = irtCompute
  .table(
    'adjustment_iterations',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      sourceOutputId: uuid('source_output_id')
        .notNull()
        .references(() => computeOutputs.id, { onDelete: 'restrict' }),
      candidateId: uuid('candidate_id')
        .notNull()
        .references(() => generationCandidates.id, { onDelete: 'restrict' }),
      replacementCandidateId: uuid('replacement_candidate_id').references(
        () => generationCandidates.id,
        { onDelete: 'restrict' },
      ),
      fromConfigId: uuid('from_config_id')
        .notNull()
        .references(() => generatorConfigs.id, { onDelete: 'restrict' }),
      toConfigId: uuid('to_config_id').references(() => generatorConfigs.id, {
        onDelete: 'restrict',
      }),
      policyId: uuid('policy_id')
        .notNull()
        .references(() => technicalPolicyVersions.id, { onDelete: 'restrict' }),
      iteration: integer('iteration').notNull(),
      changes: jsonb('changes').notNull(),
      stopReason: text('stop_reason'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex('adjustment_iterations_candidate_iteration_uq').on(t.candidateId, t.iteration),
      check('adjustment_iterations_iteration_ck', sql`${t.iteration} > 0`),
    ],
  )
  .enableRLS();
