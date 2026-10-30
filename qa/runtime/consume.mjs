import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testEnvironment, requireFrom } from '../../scripts/qa/process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { environment, problems } = testEnvironment(root);
if (
  problems.length ||
  !/^\/numora_test_qa_[a-f0-9]{32}(?:_(?:volume|velocity|variety|recovery))?$/.test(
    new URL(environment.TEST_DATABASE_URL).pathname,
  )
)
  throw new Error('QA_OWNED_DATABASE_REQUIRED');
Object.assign(process.env, environment, { DATABASE_URL: environment.TEST_DATABASE_URL });
const { drainOutboxBatch } = await import(
  pathToFileURL(resolve(root, 'apps/worker/dist/outbox.js')).href
);
const { closeDatabaseConnection } = await import(
  pathToFileURL(requireFrom(root, 'apps/worker').resolve('@tka/database')).href
);
try {
  if (process.argv.includes('--once')) {
    while ((await drainOutboxBatch(1000)).processed > 0) {
      /* real production consumer */
    }
  } else {
    while (true) {
      await drainOutboxBatch(100);
      await new Promise((ready) => setTimeout(ready, 50));
    }
  }
} finally {
  await closeDatabaseConnection();
}
