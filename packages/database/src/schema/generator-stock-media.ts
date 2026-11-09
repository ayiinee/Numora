import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  customType,
  integer,
  bigint,
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { questions, questionVersions } from './content.js';
import { generationWaveItems } from './measurement.js';
import { generationCandidates } from './intelligence.js';
import { computeExecutions } from './measurement-compute.js';
import { irtCompute } from './measurement-foundation.js';
import { users } from './identity.js';

const id = () => uuid('id').defaultRandom().primaryKey();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const generatorStockSets = pgTable(
  'generator_stock_sets',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => questions.id),
    originalQuestionVersionId: uuid('original_question_version_id')
      .notNull()
      .references(() => questionVersions.id),
    version: integer('version').notNull(),
    digest: text('digest').notNull(),
    definition: jsonb('definition').notNull(),
    itemCount: integer('item_count').notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('generator_stock_sets_family_id_version_key').on(t.familyId, t.version),
    uniqueIndex('generator_stock_sets_id_digest_key').on(t.id, t.digest),
    check('generator_stock_sets_version_check', sql`${t.version}>0`),
    check('generator_stock_sets_digest_check', sql`${t.digest} ~ '^[a-f0-9]{64}$'`),
    check('generator_stock_sets_item_count_check', sql`${t.itemCount} between 1 and 4`),
  ],
).enableRLS();

export const generatorStockReservations = pgTable(
  'generator_stock_reservations',
  {
    id: id(),
    stockSetId: uuid('stock_set_id')
      .notNull()
      .references(() => generatorStockSets.id),
    waveItemId: uuid('wave_item_id')
      .notNull()
      .unique()
      .references((): AnyPgColumn => generationWaveItems.id),
    ordinal: bigint('ordinal', { mode: 'number' }).notNull(),
    stockIndex: integer('stock_index').notNull(),
    cycle: integer('cycle').notNull(),
    reused: boolean('reused').notNull(),
    stockVariantId: text('stock_variant_id').notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('generator_stock_reservations_stock_set_id_ordinal_key').on(
      t.stockSetId,
      t.ordinal,
    ),
    check('generator_stock_reservations_ordinal_check', sql`${t.ordinal}>0`),
    check('generator_stock_reservations_stock_index_check', sql`${t.stockIndex}>0`),
    check('generator_stock_reservations_cycle_check', sql`${t.cycle}>0`),
  ],
).enableRLS();

export const generatorStockReservationEvents = pgTable(
  'generator_stock_reservation_events',
  {
    id: id(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => generatorStockReservations.id),
    state: text('state').notNull(),
    reason: text('reason').notNull(),
    eventKey: text('event_key').notNull().unique(),
    createdAt: created(),
  },
  (t) => [
    check(
      'generator_stock_reservation_events_state_check',
      sql`${t.state} in ('RESERVED','SUCCEEDED','FAILED','CANCELLED')`,
    ),
  ],
).enableRLS();

export const generatorMediaArtifacts = irtCompute
  .table(
    'generator_media_artifacts',
    {
      executionId: uuid('execution_id')
        .notNull()
        .references((): AnyPgColumn => computeExecutions.id),
      sha256: text('sha256').notNull(),
      pngBytes: bytea('png_bytes').notNull(),
      byteLength: integer('byte_length').notNull(),
      width: integer('width').notNull(),
      height: integer('height').notNull(),
      provenance: jsonb('provenance').notNull(),
      sealedAt: timestamp('sealed_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      primaryKey({ columns: [t.executionId, t.sha256] }),
      check('generator_media_artifacts_sha256_check', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
      check(
        'generator_media_artifacts_byte_length_check',
        sql`${t.byteLength} between 1 and 5242880`,
      ),
      check('generator_media_artifacts_width_check', sql`${t.width}>0`),
      check('generator_media_artifacts_height_check', sql`${t.height}>0`),
      check('generator_media_artifacts_check', sql`octet_length(${t.pngBytes})=${t.byteLength}`),
      check(
        'generator_media_artifacts_check1',
        sql`encode(sha256(${t.pngBytes}),'hex')=${t.sha256}`,
      ),
      check(
        'generator_media_artifacts_check2',
        sql`substring(${t.pngBytes} from 1 for 8)=decode('89504e470d0a1a0a','hex')`,
      ),
    ],
  )
  .enableRLS();

export const generatorCandidateMaterializations = pgTable('generator_candidate_materializations', {
  candidateId: uuid('candidate_id')
    .primaryKey()
    .references((): AnyPgColumn => generationCandidates.id),
  sourceFingerprint: text('source_fingerprint').notNull(),
  canonicalPayload: jsonb('canonical_payload').notNull(),
  receiptIds: uuid('receipt_ids').array().notNull(),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: created(),
}).enableRLS();
