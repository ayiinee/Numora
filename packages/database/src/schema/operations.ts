import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

export const analyticsOutbox = pgTable('analytics_outbox', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventName: text('event_name').notNull(),
  eventVersion: text('event_version').notNull().default('1'),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  correlationId: uuid('correlation_id'),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
}, (table) => [
  index('analytics_outbox_pending_idx').on(table.processedAt, table.occurredAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_logs_actor_time_idx').on(table.actorUserId, table.createdAt),
  index('audit_logs_entity_time_idx').on(table.entityType, table.entityId, table.createdAt),
]);
