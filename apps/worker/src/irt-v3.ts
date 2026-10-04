import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { getDatabase } from '@tka/database';
import {
  pendingComputeNotifications,
  recordNotificationDelivery,
  reconcileTryoutArtifacts,
} from '@tka/irt-orchestration';

export function createIrtQueue(connection: Redis, prefix: string) {
  return new Queue('irt-compute', { connection, prefix });
}
export async function pollIrtV3(queue: Pick<Queue, 'add'>) {
  if (process.env.IRT_V3_ENABLED !== 'true') return { notified: 0, adopted: 0, failed: 0 };
  const { client } = getDatabase();
  let notified = 0;
  for (const notification of await pendingComputeNotifications(client)) {
    try {
      await queue.add('analysis-requested', notification, {
        jobId: `irt-${notification.requestId}-${notification.dispatchGeneration}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      });
      await recordNotificationDelivery(client, notification);
      notified++;
    } catch (error) {
      try {
        await recordNotificationDelivery(client, notification, true);
      } catch {
        /* PG keeps pending authorization if bookkeeping fails. */
      }
      // The runtime handles quota exhaustion; do not swallow it here.
      throw error;
    }
  }
  return { notified, ...(await reconcileTryoutArtifacts(client)) };
}
