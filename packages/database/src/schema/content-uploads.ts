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
import { assessmentPackages } from './assessments.js';
import { contentImports } from './content-preview.js';
import type { IntakeQuestion, UploadDestination } from '../content-import-contract.js';

export type UploadPreview = {
  intakeVersion?: 1;
  destination?: UploadDestination | null;
  validationCounts?: { content: number; mapping: number };
  questions: IntakeQuestion[];
  selectedIds: string[];
  issues: { sheet: string; row: number; cell: string; code: string; detail: string }[];
};
export const contentUploadSessions = pgTable(
  'content_upload_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSha256: text('file_sha256').notNull(),
    byteLength: integer('byte_length').notNull(),
    objectKey: text('object_key'),
    state: text('state').notNull().default('RECEIVED'),
    revision: integer('revision').notNull().default(0),
    preview: jsonb('preview').$type<UploadPreview>(),
    report: jsonb('report'),
    error: text('error'),
    packageId: uuid('package_id').references(() => assessmentPackages.id, { onDelete: 'restrict' }),
    importId: uuid('import_id').references(() => contentImports.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('content_upload_operation_uq').on(t.actorUserId, t.idempotencyKey),
    index('content_upload_created_idx').on(t.createdAt),
    check(
      'content_upload_state_ck',
      sql`${t.state} in ('RECEIVED','INVALID','PREVIEW','VALIDATED','SAVED')`,
    ),
    check('content_upload_revision_ck', sql`${t.revision} >= 0 and ${t.byteLength} >= 0`),
  ],
).enableRLS();
