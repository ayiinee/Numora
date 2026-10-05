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

export const notificationKinds = [
  'FEEDBACK_RECEIVED',
  'PVP_INVITED',
  'TRYOUT_OPENED',
  'TRYOUT_RESULT_READY',
  'LEVEL_UNLOCKED',
] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export type NotificationContext = {
  feedbackId?: string;
  inviteId?: string;
  matchId?: string;
  packageId?: string;
  attemptId?: string;
  chapterId?: string;
  subchapterId?: string;
  classId?: string;
};

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceKey: text('source_key').notNull(),
    kind: text('kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'restrict' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    audienceBefore: timestamp('audience_before', { withTimezone: true }).notNull().defaultNow(),
    cursor: uuid('cursor'),
    attempts: integer('attempts').notNull().default(0),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notification_outbox_source_uq').on(t.sourceKey),
    index('notification_outbox_pending_idx')
      .on(t.occurredAt, t.id)
      .where(sql`${t.processedAt} is null`),
    check(
      'notification_outbox_kind_ck',
      sql`${t.kind} in ('SYSTEM_STARTED', 'FEEDBACK_RECEIVED', 'PVP_INVITED', 'TRYOUT_OPENED', 'TRYOUT_RESULT_READY', 'LEVEL_UNLOCKED')`,
    ),
    check(
      'notification_outbox_recipient_ck',
      sql`${t.recipientId} is not null or ${t.kind} in ('SYSTEM_STARTED', 'TRYOUT_OPENED')`,
    ),
    check('notification_outbox_attempts_ck', sql`${t.attempts} >= 0`),
  ],
).enableRLS();

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceKey: text('source_key').notNull(),
    kind: text('kind').notNull().$type<NotificationKind>(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    context: jsonb('context').notNull().$type<NotificationContext>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notifications_recipient_source_uq').on(t.recipientId, t.sourceKey),
    index('notifications_recipient_time_idx').on(t.recipientId, t.occurredAt, t.id),
    index('notifications_unread_idx')
      .on(t.recipientId, t.occurredAt)
      .where(sql`${t.readAt} is null`),
    check(
      'notifications_kind_ck',
      sql`${t.kind} in ('FEEDBACK_RECEIVED', 'PVP_INVITED', 'TRYOUT_OPENED', 'TRYOUT_RESULT_READY', 'LEVEL_UNLOCKED')`,
    ),
    check('notifications_read_at_ck', sql`${t.readAt} is null or ${t.readAt} >= ${t.createdAt}`),
  ],
).enableRLS();
