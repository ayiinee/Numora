import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chapters, levels, questionVersions } from './content.js';
import { classes } from './classes.js';
import { users } from './identity.js';

export const assessmentType = pgEnum('assessment_type', ['PRETEST', 'DRILL', 'TRYOUT', 'PVP']);
export const packageStatus = pgEnum('package_status', ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);
export const attemptStatus = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'CANCELLED']);

export const scoringPolicyVersions = pgTable('scoring_policy_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  policyCode: text('policy_code').notNull(),
  version: integer('version').notNull(),
  configuration: jsonb('configuration').notNull(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }),
  status: packageStatus('status').notNull().default('DRAFT'),
}, (table) => [
  uniqueIndex('scoring_policy_versions_code_version_uq').on(table.policyCode, table.version),
  check('scoring_policy_versions_version_ck', sql`${table.version} > 0`),
]).enableRLS();

export const assessmentPackages = pgTable('assessment_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  familyCode: text('family_code').notNull(),
  packageVersion: integer('package_version').notNull(),
  name: text('name').notNull(),
  assessmentType: assessmentType('assessment_type').notNull(),
  chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'restrict' }),
  levelId: uuid('level_id').references(() => levels.id, { onDelete: 'restrict' }),
  variantIndex: integer('variant_index'),
  durationSeconds: integer('duration_seconds'),
  isDemo: boolean('is_demo').notNull().default(false),
  scoringPolicyVersionId: uuid('scoring_policy_version_id').references(() => scoringPolicyVersions.id, { onDelete: 'restrict' }),
  releaseAt: timestamp('release_at', { withTimezone: true }),
  closeAt: timestamp('close_at', { withTimezone: true }),
  status: packageStatus('status').notNull().default('DRAFT'),
}, (table) => [
  uniqueIndex('assessment_packages_family_version_uq').on(table.familyCode, table.packageVersion),
  uniqueIndex('assessment_packages_id_type_uq').on(table.id, table.assessmentType),
  uniqueIndex('assessment_packages_id_level_uq').on(table.id, table.levelId),
  uniqueIndex('assessment_packages_published_tryout_release_uq').on(table.releaseAt)
    .where(sql`${table.assessmentType} = 'TRYOUT' and ${table.status} = 'PUBLISHED'`),
  index('assessment_packages_type_status_idx').on(table.assessmentType, table.status),
  check('assessment_packages_version_ck', sql`${table.packageVersion} > 0`),
  check('assessment_packages_duration_ck', sql`${table.durationSeconds} is null or ${table.durationSeconds} > 0`),
  check('assessment_packages_release_ck', sql`${table.closeAt} is null or ${table.releaseAt} is null or ${table.closeAt} > ${table.releaseAt}`),
  check('assessment_packages_scope_ck', sql`(${table.assessmentType} <> 'PRETEST' or ${table.chapterId} is not null) and (${table.assessmentType} <> 'DRILL' or ${table.levelId} is not null)`),
  check('assessment_packages_published_policy_ck', sql`${table.status} <> 'PUBLISHED' or ${table.scoringPolicyVersionId} is not null`),
  check('assessment_packages_published_tryout_release_ck', sql`${table.assessmentType} <> 'TRYOUT' or ${table.status} <> 'PUBLISHED' or ${table.releaseAt} is not null`),
]).enableRLS();

export const packageItems = pgTable('package_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  packageId: uuid('package_id').notNull().references(() => assessmentPackages.id, { onDelete: 'restrict' }),
  questionVersionId: uuid('question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  displayOrder: integer('display_order').notNull(),
  maxPoints: numeric('max_points', { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  uniqueIndex('package_items_package_order_uq').on(table.packageId, table.displayOrder),
  uniqueIndex('package_items_id_package_uq').on(table.id, table.packageId),
  uniqueIndex('package_items_id_question_version_uq').on(table.id, table.questionVersionId),
  index('package_items_question_version_idx').on(table.questionVersionId),
  check('package_items_order_ck', sql`${table.displayOrder} > 0`),
  check('package_items_points_ck', sql`${table.maxPoints} > 0`),
]).enableRLS();

export const assessmentAttempts = pgTable('assessment_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  packageId: uuid('package_id').notNull().references(() => assessmentPackages.id, { onDelete: 'restrict' }),
  assessmentType: assessmentType('assessment_type').notNull(),
  chapterIdAtStart: uuid('chapter_id_at_start').references(() => chapters.id, { onDelete: 'restrict' }),
  levelIdAtStart: uuid('level_id_at_start').references(() => levels.id, { onDelete: 'restrict' }),
  unlockedLevelId: uuid('unlocked_level_id').references(() => levels.id, { onDelete: 'restrict' }),
  classIdAtStart: uuid('class_id_at_start').references(() => classes.id, { onDelete: 'restrict' }),
  scoringPolicyVersionId: uuid('scoring_policy_version_id').references(() => scoringPolicyVersions.id, { onDelete: 'restrict' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: attemptStatus('status').notNull().default('IN_PROGRESS'),
  rawPoints: numeric('raw_points', { precision: 10, scale: 2 }),
  score0To100: numeric('score_0_100', { precision: 5, scale: 2 }),
  stars: integer('stars'),
}, (table) => [
  uniqueIndex('assessment_attempts_pretest_once_uq').on(table.studentId, table.chapterIdAtStart).where(sql`${table.assessmentType} = 'PRETEST' and ${table.status} in ('SUBMITTED', 'GRADED')`),
  uniqueIndex('assessment_attempts_tryout_once_uq').on(table.studentId, table.packageId).where(sql`${table.assessmentType} = 'TRYOUT'`),
  uniqueIndex('assessment_attempts_drill_active_uq').on(table.studentId, table.levelIdAtStart).where(sql`${table.assessmentType} = 'DRILL' and ${table.status} = 'IN_PROGRESS'`),
  uniqueIndex('assessment_attempts_id_package_uq').on(table.id, table.packageId),
  uniqueIndex('assessment_attempts_id_student_uq').on(table.id, table.studentId),
  index('assessment_attempts_student_time_idx').on(table.studentId, table.startedAt),
  index('assessment_attempts_package_idx').on(table.packageId),
  index('assessment_attempts_tryout_recovery_idx').on(table.deadlineAt, table.id)
    .where(sql`${table.assessmentType} = 'TRYOUT' and ${table.status} = 'IN_PROGRESS' and ${table.deadlineAt} is not null`),
  foreignKey({
    name: 'assessment_attempts_package_type_fk',
    columns: [table.packageId, table.assessmentType],
    foreignColumns: [assessmentPackages.id, assessmentPackages.assessmentType],
  }).onDelete('restrict'),
  foreignKey({
    name: 'assessment_attempts_package_level_fk',
    columns: [table.packageId, table.levelIdAtStart],
    foreignColumns: [assessmentPackages.id, assessmentPackages.levelId],
  }).onDelete('restrict'),
  check('assessment_attempts_pretest_chapter_ck', sql`${table.assessmentType} <> 'PRETEST' or ${table.chapterIdAtStart} is not null`),
  check('assessment_attempts_drill_level_ck', sql`${table.assessmentType} <> 'DRILL' or ${table.levelIdAtStart} is not null`),
  check('assessment_attempts_finished_ck', sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.startedAt}`),
  check('assessment_attempts_score_ck', sql`${table.score0To100} is null or (${table.score0To100} >= 0 and ${table.score0To100} <= 100)`),
  check('assessment_attempts_stars_ck', sql`${table.stars} is null or (${table.assessmentType} = 'DRILL' and ${table.stars} between 1 and 3)`),
]).enableRLS();

export const attemptItems = pgTable('attempt_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptId: uuid('attempt_id').notNull().references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
  packageId: uuid('package_id').notNull(),
  packageItemId: uuid('package_item_id').notNull().references(() => packageItems.id, { onDelete: 'restrict' }),
  questionVersionId: uuid('question_version_id').notNull().references(() => questionVersions.id, { onDelete: 'restrict' }),
  displayOrder: integer('display_order').notNull(),
  maxPoints: numeric('max_points', { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  uniqueIndex('attempt_items_attempt_order_uq').on(table.attemptId, table.displayOrder),
  uniqueIndex('attempt_items_attempt_package_item_uq').on(table.attemptId, table.packageItemId),
  foreignKey({
    name: 'attempt_items_attempt_package_fk',
    columns: [table.attemptId, table.packageId],
    foreignColumns: [assessmentAttempts.id, assessmentAttempts.packageId],
  }).onDelete('restrict'),
  foreignKey({
    name: 'attempt_items_package_item_scope_fk',
    columns: [table.packageItemId, table.packageId],
    foreignColumns: [packageItems.id, packageItems.packageId],
  }).onDelete('restrict'),
  foreignKey({
    name: 'attempt_items_package_item_version_fk',
    columns: [table.packageItemId, table.questionVersionId],
    foreignColumns: [packageItems.id, packageItems.questionVersionId],
  }).onDelete('restrict'),
  check('attempt_items_order_ck', sql`${table.displayOrder} > 0`),
  check('attempt_items_points_ck', sql`${table.maxPoints} > 0`),
]).enableRLS();

export const attemptAnswers = pgTable('attempt_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  attemptItemId: uuid('attempt_item_id').notNull().references(() => attemptItems.id, { onDelete: 'restrict' }),
  answer: jsonb('answer').notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  awardedPoints: numeric('awarded_points', { precision: 10, scale: 2 }),
  gradedAt: timestamp('graded_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('attempt_answers_attempt_item_uq').on(table.attemptItemId),
  check('attempt_answers_points_ck', sql`${table.awardedPoints} is null or ${table.awardedPoints} >= 0`),
]).enableRLS();

export const levelProgress = pgTable('level_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  levelId: uuid('level_id').notNull().references(() => levels.id, { onDelete: 'restrict' }),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  unlockSource: text('unlock_source'),
  unlockingAttemptId: uuid('unlocking_attempt_id').references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
  completionAttemptId: uuid('completion_attempt_id').references(() => assessmentAttempts.id, { onDelete: 'restrict' }),
  latestScore: numeric('latest_score', { precision: 5, scale: 2, mode: 'number' }),
  bestScore: numeric('best_score', { precision: 5, scale: 2, mode: 'number' }),
  bestStars: integer('best_stars'),
}, (table) => [
  uniqueIndex('level_progress_student_level_uq').on(table.studentId, table.levelId),
  check('level_progress_completed_ck', sql`${table.completedAt} is null or (${table.unlockedAt} is not null and ${table.completedAt} >= ${table.unlockedAt})`),
  check('level_progress_best_score_ck', sql`${table.bestScore} is null or (${table.bestScore} >= 0 and ${table.bestScore} <= 100)`),
]).enableRLS();
