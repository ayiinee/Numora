import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tryoutBatches } from './measurement.js';
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
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.schoolId] }),
    foreignKey({
      columns: [t.batchId, t.packageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
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
