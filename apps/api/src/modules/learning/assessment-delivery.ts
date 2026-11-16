import { contentDeliveryManifests } from '@tka/database';
import { sql } from 'drizzle-orm';

/** An existing immutable manifest was committed with all its delivery items. */
export function deliveryRecorded(
  studentId: string,
  attemptId: string,
  kind: 'ITEM' | 'EXPLANATION',
) {
  return sql<boolean>`exists (
    select 1 from ${contentDeliveryManifests}
    where ${contentDeliveryManifests.studentId} = ${studentId}
      and ${contentDeliveryManifests.idempotencyKey} = ${attemptId}::uuid::text || ${':' + kind + '_PAYLOAD_ISSUED'}
  )`;
}
