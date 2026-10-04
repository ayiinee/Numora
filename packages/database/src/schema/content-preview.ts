import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { questions, questionVersions } from './content.js';
import type { ContentAnswer, PreviewSnapshot } from '../content-import-contract.js';

export const contentImports = pgTable(
  'content_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    sourceNamespace: text('source_namespace').notNull(),
    report: jsonb('report').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('content_imports_operation_uq').on(t.actorUserId, t.idempotencyKey)],
).enableRLS();

export const contentImportIdentities = pgTable(
  'content_import_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceNamespace: text('source_namespace').notNull(),
    externalId: text('external_id').notNull(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('content_import_identities_source_uq').on(t.sourceNamespace, t.externalId),
    uniqueIndex('content_import_identities_question_uq').on(t.questionId),
  ],
).enableRLS();

export const contentImportVersions = pgTable('content_import_versions', {
  questionVersionId: uuid('question_version_id')
    .primaryKey()
    .references(() => questionVersions.id, { onDelete: 'restrict' }),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => contentImportIdentities.id, { onDelete: 'restrict' }),
  importId: uuid('import_id')
    .notNull()
    .references(() => contentImports.id, { onDelete: 'restrict' }),
  contentHash: text('content_hash').notNull(),
  provenance: jsonb('provenance').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const contentPreviewSessions = pgTable(
  'content_preview_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    state: text('state').notNull().default('IN_PROGRESS'),
    submitKey: text('submit_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('content_preview_operation_uq').on(t.actorUserId, t.idempotencyKey),
    check(
      'content_preview_state_ck',
      sql`(${t.state}='IN_PROGRESS' and ${t.submittedAt} is null and ${t.submitKey} is null) or (${t.state}='SUBMITTED' and ${t.submittedAt} is not null and ${t.submitKey} is not null)`,
    ),
  ],
).enableRLS();

export const contentPreviewItems = pgTable(
  'content_preview_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => contentPreviewSessions.id, { onDelete: 'restrict' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    snapshot: jsonb('snapshot').$type<PreviewSnapshot>().notNull(),
  },
  (t) => [
    uniqueIndex('content_preview_item_position_uq').on(t.sessionId, t.position),
    check('content_preview_position_ck', sql`${t.position}>0`),
  ],
).enableRLS();

export const contentPreviewAnswers = pgTable(
  'content_preview_answers',
  {
    itemId: uuid('item_id')
      .primaryKey()
      .references(() => contentPreviewItems.id, { onDelete: 'restrict' }),
    answer: jsonb('answer').$type<ContentAnswer>(),
    revision: integer('revision').notNull().default(0),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('content_preview_answer_revision_ck', sql`${t.revision}>=0`)],
).enableRLS();
