// Separate opt-in Main daemon. Database remains durable; no Redis prerequisite.
import {
  getIrtResearchDatabaseV1,
  closeIrtResearchDatabaseV1,
  reconcileTryoutDeliveryV1,
} from '../packages/irt-orchestration/dist/index.js';
import { setTimeout } from 'node:timers/promises';

if (process.env.NUMORA_IRT_DELIVERY_RECONCILER_ENABLED !== 'true')
  throw new Error('IRT_DELIVERY_DISABLED');
let stopping = false;
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    controller.abort();
  });
try {
  while (!stopping) {
    try {
      await reconcileTryoutDeliveryV1(getIrtResearchDatabaseV1());
    } catch {
      console.error('IRT_DELIVERY_RECONCILE_FAILED');
    }
    if (!stopping)
      await setTimeout(30000, undefined, { signal: controller.signal }).catch(() => {});
  }
} finally {
  await closeIrtResearchDatabaseV1();
}
