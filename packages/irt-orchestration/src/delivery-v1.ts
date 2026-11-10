import type { Sql } from 'postgres';
import postgres from 'postgres';
import { requireTlsDatabaseUrl } from '@tka/database';
// @ts-expect-error Existing research adapter is shared JavaScript.
import * as research from '../src/calibration-research.mjs';

// Drizzle replaces JSON/date codecs on its client. Research SQL needs native codecs.
let connection: Sql | undefined;
export function getIrtResearchDatabaseV1(): Sql {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw new Error('IRT_DELIVERY_DATABASE_NOT_CONFIGURED');
    connection = postgres(requireTlsDatabaseUrl(process.env.DATABASE_URL), {
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
