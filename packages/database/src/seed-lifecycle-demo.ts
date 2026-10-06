import { seedLifecycleDemo } from './lifecycle-demo.js';
import { closeDatabaseConnection } from './client.js';
async function run() {
  try {
    if (process.env.ALLOW_DEMO_SEED !== 'true')
      throw new Error('Lifecycle DEMO seed needs ALLOW_DEMO_SEED=true.');
    console.log(JSON.stringify(await seedLifecycleDemo()));
  } finally {
    await closeDatabaseConnection();
  }
}
void run().catch(() => {
  console.error('Local lifecycle DEMO seed failed. No production content was published.');
  process.exitCode = 1;
});
