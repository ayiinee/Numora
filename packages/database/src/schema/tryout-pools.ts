import { sql } from 'drizzle-orm';
import { pgTable, uuid, primaryKey, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { assessmentPackages } from './assessments.js';
import { schools } from './identity.js';
import { tryoutBatches, tryoutWaves } from './measurement.js';
import { tryoutBatchPackages } from './assessment-arms.js';

export const tryoutWavePackages = pgTable(
  'tryout_wave_packages',
  {
    waveId: uuid('wave_id')
      .notNull()
      .references(() => tryoutWaves.id),
    packageId: uuid('package_id')
      .notNull()
      .references(() => assessmentPackages.id),
  },
  (t) => [primaryKey({ columns: [t.waveId, t.packageId] })],
).enableRLS();

export const tryoutAllocationPools = pgTable(
  'tryout_allocation_pools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => tryoutBatches.id),
    schoolId: uuid('school_id').references(() => schools.id),
  },
  (t) => [
    uniqueIndex('tryout_pool_school_uq')
      .on(t.batchId, t.schoolId)
      .where(sql`${t.schoolId} is not null`),
    uniqueIndex('tryout_pool_mandiri_uq')
      .on(t.batchId)
      .where(sql`${t.schoolId} is null`),
    uniqueIndex('tryout_pool_id_batch_uq').on(t.id, t.batchId),
  ],
).enableRLS();

export const tryoutPoolPackages = pgTable(
  'tryout_pool_packages',
  {
    poolId: uuid('pool_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    packageId: uuid('package_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.poolId, t.packageId] }),
    foreignKey({
      columns: [t.poolId, t.batchId],
      foreignColumns: [tryoutAllocationPools.id, tryoutAllocationPools.batchId],
    }),
    foreignKey({
      columns: [t.batchId, t.packageId],
      foreignColumns: [tryoutBatchPackages.batchId, tryoutBatchPackages.packageId],
    }),
  ],
).enableRLS();
