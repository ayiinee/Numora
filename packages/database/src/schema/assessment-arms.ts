import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { assessmentAttempts, assessmentPackages } from './assessments.js';
import { measurementContexts, tryoutBatches } from './measurement.js';
import { assessmentBlueprintVersions, distributionState } from './measurement-foundation.js';
import { computeOutputs } from './measurement-compute.js';

const id = () => uuid('id').defaultRandom().primaryKey();
const created = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const assessmentDistributionPolicies = pgTable(
  'assessment_distribution_policies',
  {
    id: id(),
    code: text('code').notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    digest: text('digest').notNull(),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('assessment_distribution_policies_code_version_key').on(t.code, t.version)],
).enableRLS();

export const assessmentArmSets = pgTable(
  'assessment_arm_sets',
  {
    id: id(),
    contextId: uuid('context_id')
      .notNull()
      .references(() => measurementContexts.id),
    blueprintVersionId: uuid('blueprint_version_id')
      .notNull()
      .references(() => assessmentBlueprintVersions.id),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => assessmentDistributionPolicies.id),
    status: text('status').notNull().default('DRAFT'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('assessment_arm_sets_open_uq')
      .on(t.contextId)
      .where(sql`${t.status}='OPEN'`),
  ],
).enableRLS();

export const assessmentArms = pgTable(
  'assessment_arms',
  {
    id: id(),
    setId: uuid('set_id')
      .notNull()
      .references(() => assessmentArmSets.id),
    code: text('code').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    currentRevisionId: uuid('current_revision_id'),
  },
  (t) => [
    uniqueIndex('assessment_arms_set_id_code_key').on(t.setId, t.code),
    uniqueIndex('assessment_arms_id_set_id_key').on(t.id, t.setId),
    foreignKey({
      name: 'assessment_arms_current_revision_fk',
      columns: [t.currentRevisionId, t.id],
      foreignColumns: [assessmentArmRevisions.id, assessmentArmRevisions.armId],
    }),
  ],
).enableRLS();

export const assessmentArmRevisions = pgTable(
  'assessment_arm_revisions',
  {
    id: id(),
    armId: uuid('arm_id')
      .notNull()
      .references((): AnyPgColumn => assessmentArms.id),
    packageId: uuid('package_id')
      .notNull()
      .unique()
      .references(() => assessmentPackages.id),
    revision: integer('revision').notNull(),
    anchorQuestionVersionIds: uuid('anchor_question_version_ids').array().notNull(),
    manifestDigest: text('manifest_digest').notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('assessment_arm_revisions_arm_id_revision_key').on(t.armId, t.revision),
    uniqueIndex('assessment_arm_revisions_id_arm_id_key').on(t.id, t.armId),
  ],
).enableRLS();

export const tryoutBatchPackages = pgTable(
  'tryout_batch_packages',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => tryoutBatches.id),
    packageId: uuid('package_id')
      .notNull()
      .references(() => assessmentPackages.id),
    armId: uuid('arm_id').references(() => assessmentArms.id),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.packageId] }),
    uniqueIndex('tryout_batch_packages_batch_id_arm_id_key').on(t.batchId, t.armId),
  ],
).enableRLS();

export const assessmentArmAssignments = pgTable(
  'assessment_arm_assignments',
  {
    id: id(),
    setId: uuid('set_id')
      .notNull()
      .references(() => assessmentArmSets.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    assignedArmId: uuid('assigned_arm_id').notNull(),
    firstValidEvidence: boolean('first_valid_evidence').notNull().default(false),
    exposureFacts: jsonb('exposure_facts').notNull().default({}),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_arm_assignments_set_id_student_id_key').on(t.setId, t.studentId),
    foreignKey({
      columns: [t.assignedArmId, t.setId],
      foreignColumns: [assessmentArms.id, assessmentArms.setId],
    }),
  ],
).enableRLS();

export const assessmentAttemptArmDeliveries = pgTable('assessment_attempt_arm_deliveries', {
  attemptId: uuid('attempt_id')
    .primaryKey()
    .references(() => assessmentAttempts.id),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => assessmentArmAssignments.id),
  deliveredRevisionId: uuid('delivered_revision_id')
    .notNull()
    .references(() => assessmentArmRevisions.id),
  deliveryMode: text('delivery_mode').notNull(),
  fallbackReason: text('fallback_reason'),
  createdAt: created(),
}).enableRLS();

export const assessmentArmDistributionEvents = pgTable('assessment_arm_distribution_events', {
  id: id(),
  revisionId: uuid('revision_id')
    .notNull()
    .references(() => assessmentArmRevisions.id),
  state: distributionState('state').notNull(),
  reason: text('reason').notNull(),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  comparisonOutputId: uuid('comparison_output_id').references(() => computeOutputs.id),
  createdAt: created(),
}).enableRLS();
