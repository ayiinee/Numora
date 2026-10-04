import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';

// Upload reservations are private operational state, not question approval.
export const contentMediaUploads = pgTable(
  'content_media_uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    externalId: text('external_id').notNull(),
    assetId: text('asset_id').notNull(),
    contentVersion: integer('content_version').notNull(),
    bucket: text('bucket').notNull(),
    pendingObjectKey: text('pending_object_key').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('content_media_uploads_actor_idempotency_uq').on(t.actorUserId, t.idempotencyKey),
    uniqueIndex('content_media_uploads_pending_key_uq').on(t.bucket, t.pendingObjectKey),
    index('content_media_uploads_actor_time_idx').on(t.actorUserId, t.createdAt),
    check('content_media_uploads_size_ck', sql`${t.byteLength} > 0 and ${t.byteLength} <= 5242880`),
    check('content_media_uploads_version_ck', sql`${t.contentVersion} > 0`),
    check('content_media_uploads_sha256_ck', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      'content_media_uploads_type_ck',
      sql`${t.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    check(
      'content_media_uploads_status_ck',
      sql`(${t.status} = 'PENDING' and ${t.verifiedAt} is null) or (${t.status} = 'VERIFIED' and ${t.verifiedAt} is not null)`,
    ),
    check('content_media_uploads_expiry_ck', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
).enableRLS();
