import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
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
import { scoringRubricVersions, validationState } from './measurement-foundation.js';
import { contentValidationDecisions } from './measurement.js';

export const contentStatus = pgEnum('content_status', ['DRAFT', 'READY', 'ARCHIVED']);
export const questionType = pgEnum('question_type', [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
  'CATEGORY',
]);
export const variantKind = pgEnum('variant_kind', ['ORIGINAL', 'VARIANT']);

export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    materialCategory: text('material_category'),
    displayOrder: integer('display_order').notNull(),
    status: contentStatus('status').notNull().default('DRAFT'),
  },
  (table) => [
    check(
      'chapters_category_ck',
      sql`${table.materialCategory} is null or ${table.materialCategory} in ('algebra', 'geometry', 'numbers', 'statistics')`,
    ),
    uniqueIndex('chapters_code_uq').on(table.code),
    uniqueIndex('chapters_slug_uq').on(table.slug),
    check('chapters_slug_ck', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    uniqueIndex('chapters_order_uq').on(table.displayOrder),
    check('chapters_order_ck', sql`${table.displayOrder} > 0`),
    check('chapters_name_ck', sql`length(trim(${table.name})) > 0`),
  ],
).enableRLS();

export const subchapters = pgTable(
  'subchapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    displayOrder: integer('display_order').notNull(),
    status: contentStatus('status').notNull().default('DRAFT'),
  },
  (table) => [
    uniqueIndex('subchapters_chapter_code_uq').on(table.chapterId, table.code),
    uniqueIndex('subchapters_chapter_slug_uq').on(table.chapterId, table.slug),
    check('subchapters_slug_ck', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    uniqueIndex('subchapters_chapter_order_uq').on(table.chapterId, table.displayOrder),
    check('subchapters_order_ck', sql`${table.displayOrder} > 0`),
  ],
).enableRLS();

export const competencies = pgTable(
  'competencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subchapterId: uuid('subchapter_id')
      .notNull()
      .references(() => subchapters.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    description: text('description').notNull(),
    status: contentStatus('status').notNull().default('DRAFT'),
  },
  (table) => [uniqueIndex('competencies_subchapter_code_uq').on(table.subchapterId, table.code)],
).enableRLS();

export const levels = pgTable(
  'levels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subchapterId: uuid('subchapter_id')
      .notNull()
      .references(() => subchapters.id, { onDelete: 'restrict' }),
    levelNumber: integer('level_number').notNull(),
    description: text('description'),
    difficultyCriteria: jsonb('difficulty_criteria'),
    status: contentStatus('status').notNull().default('DRAFT'),
  },
  (table) => [
    uniqueIndex('levels_subchapter_number_uq').on(table.subchapterId, table.levelNumber),
    check('levels_number_ck', sql`${table.levelNumber} > 0`),
  ],
).enableRLS();

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    primaryCompetencyId: uuid('primary_competency_id')
      .notNull()
      .references(() => competencies.id, { onDelete: 'restrict' }),
    // Source level within an indicator; learner progress remains scoped to subchapter levels.
    curriculumLevelNumber: integer('curriculum_level_number'),
    sourceRef: text('source_ref'),
    status: contentStatus('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('questions_competency_idx').on(table.primaryCompetencyId),
    index('questions_competency_level_idx').on(
      table.primaryCompetencyId,
      table.curriculumLevelNumber,
    ),
    check(
      'questions_curriculum_level_ck',
      sql`${table.curriculumLevelNumber} is null or ${table.curriculumLevelNumber} > 0`,
    ),
  ],
).enableRLS();

export const questionVariants = pgTable(
  'question_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    originalVariantId: uuid('original_variant_id').references(
      (): AnyPgColumn => questionVariants.id,
      { onDelete: 'restrict' },
    ),
    variantCode: text('variant_code').notNull(),
    kind: variantKind('kind').notNull(),
    origin: text('origin').notNull(),
  },
  (table) => [
    uniqueIndex('question_variants_question_code_uq').on(table.questionId, table.variantCode),
    uniqueIndex('question_variants_id_question_uq').on(table.id, table.questionId),
    uniqueIndex('question_variants_original_family_uq')
      .on(table.questionId)
      .where(sql`${table.kind} = 'ORIGINAL'`),
    index('question_variants_original_idx').on(table.originalVariantId),
    foreignKey({
      name: 'question_variants_same_family_fk',
      columns: [table.originalVariantId, table.questionId],
      foreignColumns: [table.id, table.questionId],
    }).onDelete('restrict'),
    check(
      'question_variants_original_ck',
      sql`(${table.kind} = 'ORIGINAL' and ${table.originalVariantId} is null) or (${table.kind} = 'VARIANT' and ${table.originalVariantId} is not null)`,
    ),
  ],
).enableRLS();

export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => questionVariants.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    questionType: questionType('question_type').notNull(),
    stem: jsonb('stem').notNull(),
    optionsOrStatements: jsonb('options_or_statements').notNull(),
    answerKey: jsonb('answer_key').notNull(),
    explanation: jsonb('explanation').notNull(),
    media: jsonb('media'),
    difficulty: text('difficulty'),
    parentOriginalQuestionVersionId: uuid('parent_original_question_version_id').references(
      (): AnyPgColumn => questionVersions.id,
      { onDelete: 'restrict' },
    ),
    revisedFromQuestionVersionId: uuid('revised_from_question_version_id').references(
      (): AnyPgColumn => questionVersions.id,
      { onDelete: 'restrict' },
    ),
    levelId: uuid('level_id').references(() => levels.id, { onDelete: 'restrict' }),
    scoringRubricVersionId: uuid('scoring_rubric_version_id').references(
      () => scoringRubricVersions.id,
      { onDelete: 'restrict' },
    ),
    contentFingerprint: text('content_fingerprint'),
    validationState: validationState('validation_state').notNull().default('DRAFT'),
    validationDecisionId: uuid('validation_decision_id').references(
      (): AnyPgColumn => contentValidationDecisions.id,
      { onDelete: 'restrict' },
    ),
    contentStatus: contentStatus('content_status').notNull().default('DRAFT'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('question_versions_id_variant_uq').on(table.id, table.variantId),
    uniqueIndex('question_versions_variant_version_uq').on(table.variantId, table.versionNumber),
    index('question_versions_status_idx').on(table.contentStatus),
    check('question_versions_number_ck', sql`${table.versionNumber} > 0`),
    index('question_versions_fingerprint_idx').on(table.contentFingerprint),
    check(
      'question_versions_review_ck',
      sql`${table.contentStatus} <> 'READY' or (${table.reviewedByUserId} is not null and ${table.reviewedAt} is not null) or ${table.validationDecisionId} is not null`,
    ),
  ],
).enableRLS();
