import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';

export const attemptStatus = pgEnum('drill_attempt_status', ['IN_PROGRESS', 'COMPLETED']);

export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('chapters_order_uq').on(t.sortOrder)],
).enableRLS();

export const subchapters = pgTable(
  'subchapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('subchapters_chapter_order_uq').on(t.chapterId, t.sortOrder)],
).enableRLS();

export const levels = pgTable(
  'levels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subchapterId: uuid('subchapter_id')
      .notNull()
      .references(() => subchapters.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('levels_subchapter_order_uq').on(t.subchapterId, t.sortOrder)],
).enableRLS();

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    levelId: uuid('level_id')
      .notNull()
      .references(() => levels.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
  },
  (t) => [uniqueIndex('questions_code_uq').on(t.code), index('questions_level_idx').on(t.levelId)],
).enableRLS();

export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('question_versions_question_version_uq').on(t.questionId, t.version)],
).enableRLS();

export type ChoiceOption = { id: string; text: string };

export const questionVariants = pgTable(
  'question_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    variantNo: integer('variant_no').notNull(),
    stem: text('stem').notNull(),
    options: jsonb('options').$type<ChoiceOption[]>().notNull(),
    correctOptionId: text('correct_option_id').notNull(),
    explanation: text('explanation').notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
  },
  (t) => [uniqueIndex('question_variants_version_no_uq').on(t.questionVersionId, t.variantNo)],
).enableRLS();

export const drillPackages = pgTable(
  'drill_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    levelId: uuid('level_id')
      .notNull()
      .references(() => levels.id, { onDelete: 'restrict' }),
    variantSet: integer('variant_set').notNull(),
    isDemo: boolean('is_demo').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('drill_packages_level_set_uq').on(t.levelId, t.variantSet)],
).enableRLS();

export const drillPackageQuestions = pgTable(
  'drill_package_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => drillPackages.id, { onDelete: 'restrict' }),
    questionVariantId: uuid('question_variant_id')
      .notNull()
      .references(() => questionVariants.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [uniqueIndex('drill_package_questions_order_uq').on(t.packageId, t.sortOrder)],
).enableRLS();

export const drillAttempts = pgTable(
  'drill_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    levelId: uuid('level_id')
      .notNull()
      .references(() => levels.id, { onDelete: 'restrict' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => drillPackages.id, { onDelete: 'restrict' }),
    status: attemptStatus('status').notNull().default('IN_PROGRESS'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    score: integer('score'),
    rawPoints: integer('raw_points'),
    correctCount: integer('correct_count'),
    questionCount: integer('question_count'),
    mastered: boolean('mastered'),
    stars: integer('stars'),
    unlockedLevelId: uuid('unlocked_level_id').references(() => levels.id, {
      onDelete: 'restrict',
    }),
    isDemo: boolean('is_demo').notNull().default(true),
    scoringPolicyVersion: text('scoring_policy_version').notNull().default('DRILL_PG_DEMO_V1'),
  },
  (t) => [
    uniqueIndex('drill_attempts_id_student_uq').on(t.id, t.studentId),
    uniqueIndex('drill_attempts_one_active_uq')
      .on(t.studentId, t.levelId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    index('drill_attempts_student_level_idx').on(t.studentId, t.levelId),
    check('drill_attempts_score_range', sql`${t.score} is null or (${t.score} between 0 and 100)`),
  ],
).enableRLS();

export const drillAttemptQuestions = pgTable(
  'drill_attempt_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => drillAttempts.id, { onDelete: 'restrict' }),
    questionVariantId: uuid('question_variant_id')
      .notNull()
      .references(() => questionVariants.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull(),
    stem: text('stem').notNull(),
    options: jsonb('options').$type<ChoiceOption[]>().notNull(),
    correctOptionId: text('correct_option_id').notNull(),
    explanation: text('explanation').notNull(),
    selectedOptionId: text('selected_option_id'),
  },
  (t) => [uniqueIndex('drill_attempt_questions_order_uq').on(t.attemptId, t.sortOrder)],
).enableRLS();

export const levelProgress = pgTable(
  'level_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    levelId: uuid('level_id')
      .notNull()
      .references(() => levels.id, { onDelete: 'restrict' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    latestScore: integer('latest_score'),
    bestScore: integer('best_score'),
    latestAttemptId: uuid('latest_attempt_id').references(() => drillAttempts.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [uniqueIndex('level_progress_student_level_uq').on(t.studentId, t.levelId)],
).enableRLS();
