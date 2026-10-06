import { closeDatabaseConnection } from './client.js';
import { seedAssessmentMocks } from './assessment-mock-seed.js';

async function run() {
  try {
    process.env.DATABASE_URL =
      process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL;
    console.log(JSON.stringify(await seedAssessmentMocks(), null, 2));
  } finally {
    await closeDatabaseConnection();
  }
}
void run().catch(() => {
  console.error(
    'Assessment mock seed failed. Check target/opt-in, READY DEMO chapters, content Admin, weekly package conflict or fixture drift. No existing content is overwritten.',
  );
  process.exitCode = 1;
});
