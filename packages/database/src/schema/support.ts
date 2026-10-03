import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { attemptAnswers } from './assessments.js';
import { classes } from './classes.js';
import { subchapters } from './content.js';
import { users } from './identity.js';

export const reportStatus = pgEnum('report_status', ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']);
export const curationStatus = pgEnum('curation_status', ['DRAFT', 'READY', 'ARCHIVED']);

export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  classIdAtSend: uuid('class_id_at_send').notNull().references(() => classes.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, (table) => [
  index('feedback_student_time_idx').on(table.studentId, table.sentAt),
  index('feedback_teacher_class_idx').on(table.teacherId, table.classIdAtSend),
  check('feedback_body_ck', sql`length(trim(${table.body})) between 1 and 1000`),
  check('feedback_read_at_ck', sql`${table.readAt} is null or ${table.readAt} >= ${table.sentAt}`),
]).enableRLS();

export const learningVideos = pgTable('learning_videos', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  source: text('source').notNull(),
  curationStatus: curationStatus('curation_status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('learning_videos_title_ck', sql`length(trim(${table.title})) > 0`)]).enableRLS();

export const videoSubchapterMappings = pgTable('video_subchapter_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id').notNull().references(() => learningVideos.id, { onDelete: 'restrict' }),
  subchapterId: uuid('subchapter_id').notNull().references(() => subchapters.id, { onDelete: 'restrict' }),
  recommendationOrder: integer('recommendation_order').notNull(),
  status: curationStatus('status').notNull().default('DRAFT'),
}, (table) => [
  uniqueIndex('video_subchapter_mappings_pair_uq').on(table.videoId, table.subchapterId),
  index('video_subchapter_mappings_subchapter_order_idx').on(table.subchapterId, table.recommendationOrder),
  check('video_subchapter_mappings_order_ck', sql`${table.recommendationOrder} > 0`),
]).enableRLS();

export const questionReports = pgTable('question_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterStudentId: uuid('reporter_student_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  attemptAnswerId: uuid('attempt_answer_id').notNull().references(() => attemptAnswers.id, { onDelete: 'restrict' }),
  category: text('category').notNull(),
  details: text('details'),
  status: reportStatus('status').notNull().default('OPEN'),
  followUp: text('follow_up'),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('question_reports_status_time_idx').on(table.status, table.reportedAt)]).enableRLS();

export const videoReports = pgTable('video_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterStudentId: uuid('reporter_student_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  mappingId: uuid('mapping_id').notNull().references(() => videoSubchapterMappings.id, { onDelete: 'restrict' }),
  // Immutable report context; older reports keep null because their original attempt is unknown.
  attemptContext: jsonb('attempt_context').$type<{ attemptId: string; levelId: string | null; subchapterId: string; videoId: string }>(),
  category: text('category').notNull(),
  details: text('details'),
  status: reportStatus('status').notNull().default('OPEN'),
  followUp: text('follow_up'),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('video_reports_status_time_idx').on(table.status, table.reportedAt)]).enableRLS();

export const analyticsEvents = pgTable('analytics_events', {
  eventId: uuid('event_id').primaryKey(),
  correlationId: uuid('correlation_id'),
  eventName: text('event_name').notNull(),
  eventVersion: text('event_version').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  payload: jsonb('payload').notNull(),
}, (table) => [index('analytics_events_name_time_idx').on(table.eventName, table.occurredAt)]).enableRLS();

export const accountRestrictions = pgTable('account_restrictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  actorAdminId: uuid('actor_admin_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (table) => [
  index('account_restrictions_user_idx').on(table.userId),
  check('account_restrictions_end_ck', sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`),
  check('account_restrictions_revoked_ck', sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.startsAt}`),
]).enableRLS();
