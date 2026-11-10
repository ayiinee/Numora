// @ts-expect-error Shared JavaScript server-mode boundary.
import { assertIrtEnabled, irtPurpose } from '../src/runtime-mode.mjs';
import type { Sql } from 'postgres';
import postgres from 'postgres';
import { requireTlsDatabaseUrl } from '@tka/database';
// @ts-expect-error Existing research adapter is shared JavaScript.
import * as research from '../src/calibration-research.mjs';

// Drizzle replaces JSON/date codecs on its client. Research SQL needs native codecs.
let connection: Sql | undefined;
export function getIrtResearchDatabaseV1(): Sql {
  if (!connection) {
    const url =
      irtPurpose() === 'PRODUCTION'
        ? process.env.NUMORA_IRT_DATABASE_URL
        : process.env.DATABASE_URL;
    if (!url) throw new Error('IRT_DELIVERY_DATABASE_NOT_CONFIGURED');
    try {
      new URL(url);
    } catch {
      throw new Error('IRT_DELIVERY_DATABASE_NOT_CONFIGURED');
    }
    if (irtPurpose() === 'PRODUCTION' && new URL(url).searchParams.get('sslmode') !== 'verify-full')
      throw new Error('IRT_DELIVERY_DATABASE_TLS_REQUIRED');
    connection = postgres(requireTlsDatabaseUrl(url), {
      max: 2,
      idle_timeout: 20,
    });
  }
  return connection;
}
export async function closeIrtResearchDatabaseV1() {
  await connection?.end();
  connection = undefined;
}

export interface DeliveryBindingV1 {
  expectedRevision: number;
  contextId: string;
  armSetId: string;
  batchRevision: number;
  configuration: Record<string, unknown>;
}
export function saveTryoutDeliveryBindingV1(
  sql: Sql,
  batchId: string,
  actorId: string,
  input: DeliveryBindingV1,
) {
  return research.saveCalibrationDeliveryBinding(sql, batchId, actorId, input);
}
export function tryoutDeliveryReadinessV1(sql: Sql, batchId: string) {
  return research.inspectBoundCalibrationDelivery(sql, batchId, {
    secret: process.env.NUMORA_IRT_PSEUDONYM_SECRET,
    keyVersion: process.env.NUMORA_IRT_PSEUDONYM_KEY_VERSION,
  });
}

export function requireIrtModeV1(purpose: 'RESEARCH_ONLY' | 'PRODUCTION') {
  if (assertIrtEnabled() !== purpose) throw new Error('IRT_DELIVERY_MODE_MISMATCH');
}
