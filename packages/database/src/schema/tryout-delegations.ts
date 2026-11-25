import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tryoutBatches, tryoutWaves } from './measurement.js';
import { tryoutBatchPackages } from './assessment-arms.js';
import { schools, users } from './identity.js';
import { assessmentAttempts } from './assessments.js';

export const tryoutSchoolDelegations = pgTable(
  'tryout_school_delegations',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => tryoutBatches.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    packageId: uuid('package_id').notNull(),
    allocationMode: text('allocation_mode').notNull().default('SINGLE_PACKAGE'),
    variantPackageId: uuid('variant_package_id'),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.schoolId] }),
    foreignKey({
      columns: [t.batchId, t.packageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
    foreignKey({
      columns: [t.batchId, t.variantPackageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
    check(
      'tryout_school_delegations_allocation_ck',
      sql`(${t.allocationMode} = 'SINGLE_PACKAGE' AND ${t.variantPackageId} IS NULL) OR (${t.allocationMode} = 'BALANCED_50_50' AND ${t.variantPackageId} IS NOT NULL AND ${t.variantPackageId} <> ${t.packageId})`,
    ),
  ],
).enableRLS();

export const tryoutBatchStudentAllocations = pgTable(
  'tryout_batch_student_allocations',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => tryoutBatches.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    packageId: uuid('package_id').notNull(),
    allocationMode: text('allocation_mode').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.studentId, t.schoolId] }),
    foreignKey({
      columns: [t.batchId, t.packageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
    check(
      'tryout_batch_student_allocations_mode_ck',
      sql`${t.allocationMode} = 'BALANCED_50_50'`,
    ),
  ],
).enableRLS();

export const tryoutStudentAssignments = pgTable(
  'tryout_student_assignments',
  {
    attemptId: uuid('attempt_id')
      .primaryKey()
      .references(() => assessmentAttempts.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => tryoutBatches.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    schoolId: uuid('school_id').references(() => schools.id),
    packageId: uuid('package_id').notNull(),
    allocationMethod: text('allocation_method').notNull().default('ADMIN_DELEGATION'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tryout_student_assignments_batch_student_uq').on(t.batchId, t.studentId),
    foreignKey({
      columns: [t.batchId, t.packageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
  ],
).enableRLS();

export const tryoutWaveClaims = pgTable(
  'tryout_wave_claims',
  {
    attemptId: uuid('attempt_id')
      .primaryKey()
      .references(() => assessmentAttempts.id),
    waveId: uuid('wave_id')
      .notNull()
      .references(() => tryoutWaves.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    schoolId: uuid('school_id').references(() => schools.id),
    packageId: uuid('package_id').notNull(),
  },
  (t) => [
    uniqueIndex('tryout_wave_claims_school_uq')
      .on(t.waveId, t.studentId, t.schoolId)
      .where(sql`${t.schoolId} is not null`),
    uniqueIndex('tryout_wave_claims_mandiri_uq')
      .on(t.waveId, t.studentId)
      .where(sql`${t.schoolId} is null`),
  ],
).enableRLS();
