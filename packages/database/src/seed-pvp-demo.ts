import { closeDatabaseConnection } from './client.js';
import { seedPvpDemo } from './pvp-demo-seed.js';
seedPvpDemo().then(result => console.log(result)).catch(error => {
  console.error(error instanceof Error ? error.message : 'PvP DEMO seed failed.');
  process.exitCode = 1;
}).finally(closeDatabaseConnection);
