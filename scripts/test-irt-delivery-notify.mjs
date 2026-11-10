import assert from 'node:assert/strict';
import {
  getIrtResearchDatabaseV1,
  closeIrtResearchDatabaseV1,
} from '../packages/irt-orchestration/dist/index.js';
import { deliverPendingCalibrationResearch } from '../packages/irt-orchestration/src/calibration-research.mjs';
try {
  const options = {
    url: process.env.NUMORA_IRT_COMPUTE_URL,
    token: process.env.NUMORA_IRT_RESEARCH_TOKEN,
  };
  assert.equal(new URL(options.url).hostname, '127.0.0.1');
  assert.deepEqual(await deliverPendingCalibrationResearch(getIrtResearchDatabaseV1(), options), {
    acknowledged: 1,
    failed: 0,
  });
  assert.deepEqual(await deliverPendingCalibrationResearch(getIrtResearchDatabaseV1(), options), {
    acknowledged: 0,
    failed: 0,
  });
  console.log(JSON.stringify({ outboxHTTP: 'PASS', deliveryReplay: 'PASS' }));
} finally {
  await closeIrtResearchDatabaseV1();
}
