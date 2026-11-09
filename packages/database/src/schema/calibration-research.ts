import { bigint, integer, jsonb, pgTable, text, timestamp, uuid, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { irtCompute } from './measurement-foundation.js';
import { measurementContexts } from './measurement.js';
import { users } from './identity.js';
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const irtCalibrationRequestsV1 = pgTable('irt_calibration_requests_v1', {
  id: uuid('id').primaryKey(), snapshotId: uuid('snapshot_id').notNull().unique(),
  contextId: uuid('context_id').notNull().references(() => measurementContexts.id),
  body: jsonb('body').notNull(), resources: jsonb('resources').notNull(),
  runtimeProfile: jsonb('runtime_profile').notNull(), inputDigest: text('input_digest').notNull(), createdAt: created(),
}).enableRLS();
export const irtCalibrationDispatchesV1 = pgTable('irt_calibration_dispatches_v1', {
  requestId: uuid('request_id').notNull().references(() => irtCalibrationRequestsV1.id),
  generation: integer('generation').notNull(), actorUserId: uuid('actor_user_id').notNull().references(() => users.id), createdAt: created(),
}, t => [uniqueIndex('irt_calibration_dispatches_v1_pkey').on(t.requestId,t.generation)]).enableRLS();
export const irtCalibrationCancellationsV1 = pgTable('irt_calibration_cancellations_v1', {
  requestId: uuid('request_id').primaryKey().references(() => irtCalibrationRequestsV1.id),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id), createdAt: created(),
}).enableRLS();
export const calibrationJobsV1 = irtCompute.table('calibration_jobs_v1', {
  id: uuid('id').defaultRandom().primaryKey(), requestId: uuid('request_id').notNull(), generation: integer('generation').notNull(),
  status: text('status').notNull().default('ACCEPTED'), executionId: uuid('execution_id').unique(),
  fencingToken: bigint('fencing_token', { mode: 'number' }).generatedAlwaysAsIdentity(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }), heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  failureCode: text('failure_code'), createdAt: created(), finishedAt: timestamp('finished_at', { withTimezone: true }),
},t=>[uniqueIndex('calibration_jobs_v1_request_id_generation_key').on(t.requestId,t.generation),
  foreignKey({columns:[t.requestId,t.generation],foreignColumns:[irtCalibrationDispatchesV1.requestId,irtCalibrationDispatchesV1.generation]})]).enableRLS();
export const calibrationArtifactsV1 = irtCompute.table('calibration_artifacts_v1', {
  id: uuid('id').defaultRandom().primaryKey(),jobId: uuid('job_id').notNull().unique().references(()=>calibrationJobsV1.id),
  payload: jsonb('payload').notNull(),diagnostics: jsonb('diagnostics').notNull(),digest: text('digest').notNull(),createdAt: created(),
}).enableRLS();
