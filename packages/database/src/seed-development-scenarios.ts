import { closeDatabaseConnection } from './client.js';
import { seedDevelopmentScenarios } from './development-scenarios.js';
void seedDevelopmentScenarios()
  .then((result) => console.log(JSON.stringify(result)))
  .catch(() => {
    console.error('Development scenario seed failed; transaction rolled back.');
    process.exitCode = 1;
  })
  .finally(closeDatabaseConnection);
