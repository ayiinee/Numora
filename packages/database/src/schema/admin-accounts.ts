import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminRole, users } from './identity.js';

export const adminRecoveryStatus = pgEnum('admin_recovery_status', [
  'RESERVED',
  'SENDING',
  'SENT',
  'FAILED',
]);
export const adminRecoveryOperations = pgTable(
  'admin_recovery_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: adminRecoveryStatus('status').notNull().default('RESERVED'),
    failureCode: text('failure_code'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_recovery_actor_key_uq').on(t.actorUserId, t.idempotencyKey)],
).enableRLS();

export const adminInvitationStatus = pgEnum('admin_invitation_status', [
  'RESERVED',
  'SENDING',
  'INVITED',
  'FAILED',
  'ACCEPTED',
  'CANCELLED',
]);
export const adminInvitations = pgTable(
  'admin_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    targetRole: adminRole('target_role').notNull(),
    status: adminInvitationStatus('status').notNull().default('RESERVED'),
    authUserId: uuid('auth_user_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    failureCode: text('failure_code'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('admin_invitations_actor_key_uq').on(t.actorUserId, t.idempotencyKey),
    uniqueIndex('admin_invitations_live_email_uq')
      .on(t.email)
      .where(sql`${t.status} <> 'CANCELLED'`),
    index('admin_invitations_state_time_idx').on(t.status, t.updatedAt),
    check(
      'admin_invitations_email_ck',
      sql`${t.email} = lower(trim(${t.email})) and length(${t.email}) > 3`,
    ),
    check(
      'admin_invitations_accepted_ck',
      sql`${t.status} <> 'ACCEPTED' or (${t.userId} is not null and ${t.authUserId} is not null and ${t.acceptedAt} is not null)`,
    ),
  ],
).enableRLS();
