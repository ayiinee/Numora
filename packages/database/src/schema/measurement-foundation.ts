import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';

// Both namespaces belong to the same migration stream. Runtime roles are not owners.
export const irtCompute = pgSchema('irt_compute');
export const assessmentPurpose = pgEnum('assessment_purpose', [
  'REGULAR',
  'ORIGINAL_PILOT',
  'VARIANT_AB',
]);
export const validationState = pgEnum('content_validation_state', [
  'DRAFT',
  'CONTENT_VALID',
  'REVIEW',
  'QUARANTINED',
  'ARCHIVED',
]);
export const measurementState = pgEnum('measurement_state', [
  'UNCALIBRATED',
  'INSUFFICIENT',
  'CALIBRATION_FAILED',
  'CALIBRATED',
  'WATCH',
  'DRIFT',
  'ANOMALY',
]);
export const comparisonState = pgEnum('comparison_state', [
  'PENDING',
  'INSUFFICIENT',
  'PASS',
  'DRIFT',
  'NOT_COMPARABLE',
  'ANOMALY',
]);
export const distributionState = pgEnum('distribution_state', [
  'PROVISIONAL',
  'READY',
  'HOLD',
  'RETIRED',
]);
export const responseState = pgEnum('response_state', [
  'RESPONDED',
  'OMITTED',
  'NOT_PRESENTED',
  'INVALID',
]);
export const configurationState = pgEnum('configuration_state', ['DRAFT', 'SEALED', 'RETIRED']);

export const servicePrincipals = pgTable(
  'service_principals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('service_principals_code_uq').on(t.code)],
).enableRLS();

export const scoringRubricVersions = pgTable(
  'scoring_rubric_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    version: integer('version').notNull(),
    questionType: text('question_type').notNull(),
    maximumScoreCategory: integer('maximum_score_category').notNull(),
    definition: jsonb('definition').notNull(),
    digest: text('digest').notNull(),
    status: configurationState('status').notNull().default('DRAFT'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scoring_rubric_versions_code_version_uq').on(t.code, t.version),
    check(
      'scoring_rubric_versions_bounds_ck',
      sql`${t.version} > 0 and ${t.maximumScoreCategory} > 0`,
    ),
    check(
      'scoring_rubric_versions_type_ck',
      sql`${t.questionType} in ('SINGLE_CHOICE','MULTIPLE_CHOICE_MULTIPLE_ANSWER','CATEGORY')`,
    ),
    check(
      'scoring_rubric_versions_approval_ck',
      sql`${t.status} <> 'SEALED' or (${t.approvedByUserId} is not null and ${t.approvedAt} is not null)`,
    ),
  ],
).enableRLS();

export const assessmentBlueprintVersions = pgTable(
  'assessment_blueprint_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    digest: text('digest').notNull(),
    status: configurationState('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assessment_blueprint_versions_code_version_uq').on(t.code, t.version),
    check('assessment_blueprint_versions_version_ck', sql`${t.version} > 0`),
  ],
).enableRLS();

export const generatorTemplates = irtCompute
  .table(
    'generator_templates',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      code: text('code').notNull(),
      version: integer('version').notNull(),
      definition: jsonb('definition').notNull(),
      digest: text('digest').notNull(),
      status: configurationState('status').notNull().default('DRAFT'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex('generator_templates_code_version_uq').on(t.code, t.version),
      check('generator_templates_version_ck', sql`${t.version} > 0`),
    ],
  )
  .enableRLS();

export const technicalPolicyVersions = irtCompute
  .table(
    'technical_policy_versions',
    {
      id: uuid('id').defaultRandom().primaryKey(),
      code: text('code').notNull(),
      version: integer('version').notNull(),
      kind: text('kind').notNull(),
      definition: jsonb('definition').notNull(),
      digest: text('digest').notNull(),
      status: configurationState('status').notNull().default('DRAFT'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      uniqueIndex('technical_policy_versions_code_version_uq').on(t.code, t.version),
      check('technical_policy_versions_version_ck', sql`${t.version} > 0`),
      check(
        'technical_policy_versions_kind_ck',
        sql`${t.kind} in ('VALIDATOR','IRT_MODEL','QUALITY_GATE','COMPARISON','ADJUSTMENT','SCORE_MAPPING','PACKAGE_EVALUATION','TRIAL_REQUIREMENTS')`,
      ),
    ],
  )
  .enableRLS();
