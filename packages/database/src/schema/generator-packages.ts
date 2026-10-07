import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { chapters, levels } from './content.js';
import { assessmentPackages } from './assessments.js';
export const generatorPackages = pgTable(
  'generator_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    operationKey: text('operation_key').notNull(),
    operationFingerprint: text('operation_fingerprint').notNull(),
    assessmentType: text('assessment_type').notNull(),
    title: text('title').notNull(),
    expectedCount: integer('expected_count').notNull(),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'restrict' }),
    levelId: uuid('level_id').references(() => levels.id, { onDelete: 'restrict' }),
    mappingIds: jsonb('mapping_ids').$type<string[]>().notNull(),
    requestIds: jsonb('request_ids').$type<string[]>().notNull(),
    canonicalPackageId: uuid('canonical_package_id').references(() => assessmentPackages.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('generator_packages_type_ck', sql`${t.assessmentType} in ('DRILL','PRETEST','TRYOUT')`),
    check('generator_packages_title_ck', sql`length(trim(${t.title})) between 1 and 160`),
    check(
      'generator_packages_arrays_ck',
      sql`jsonb_typeof(${t.mappingIds})='array' and jsonb_typeof(${t.requestIds})='array'`,
    ),
    uniqueIndex('generator_packages_operation_uq').on(t.actorUserId, t.operationKey),
    index('generator_packages_created_idx').on(t.createdAt),
    check(
      'generator_packages_count_ck',
      sql`${t.expectedCount}=case ${t.assessmentType} when 'DRILL' then 10 when 'PRETEST' then 20 when 'TRYOUT' then 30 end and jsonb_array_length(${t.mappingIds})=${t.expectedCount} and jsonb_array_length(${t.requestIds})=${t.expectedCount}`,
    ),
    check(
      'generator_packages_scope_ck',
      sql`(${t.assessmentType}='TRYOUT' and ${t.chapterId} is null and ${t.levelId} is null) or (${t.assessmentType}='DRILL' and ${t.chapterId} is not null and ${t.levelId} is not null) or (${t.assessmentType}='PRETEST' and ${t.chapterId} is not null and ${t.levelId} is null)`,
    ),
  ],
).enableRLS();
