import { closeDatabaseConnection } from './client.js';
import { seedDemoMonitoring, verifyDemoMonitoring } from './demo-monitoring.js';

async function seedMonitoring() {
  await seedDemoMonitoring();
  console.log('Seeded DEMO monitoring fixtures: teachers, classes, students, Drill attempts, progress.');

  const problems = await verifyDemoMonitoring();
  if (problems.length > 0) {
    for (const problem of problems) console.error(` - ${problem}`);
    throw new Error('DEMO monitoring verification failed.');
  }
  console.log('Verified DEMO monitoring state against the expected Teacher Monitoring results.');
  await closeDatabaseConnection();
}

seedMonitoring().catch(async (error) => {
  console.error(error);
  await closeDatabaseConnection();
  process.exit(1);
});
