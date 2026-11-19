import { closeDatabaseConnection, getDatabase } from './client.js';
import {
  ProductionPreflightError,
  productionTarget,
  startupFailureMessage,
  verifyProductionDatabase,
  type ProductionService,
} from './production-runtime.js';

async function run() {
  const args = process.argv.slice(2);
  const serviceArg = args.find((arg) => arg.startsWith('--service=')) ?? '--service=api';
  const service = serviceArg.slice('--service='.length);
  if (
    !['api', 'worker'].includes(service) ||
    args.some((arg) => arg !== '--database' && arg !== serviceArg)
  )
    throw new ProductionPreflightError(['Expected --service=api|worker and optional --database']);
  const target = productionTarget(service as ProductionService);
  if (!target)
    throw new ProductionPreflightError(['Production configuration is required for this command']);
  if (args.includes('--database')) await verifyProductionDatabase(getDatabase().client, target);
  console.log(
    args.includes('--database')
      ? 'Production configuration and read-only database preflight passed.'
      : 'Production configuration passed. Connectivity and role privileges have not been checked.',
  );
}
void run()
  .catch((error: unknown) => {
    console.error(startupFailureMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDatabaseConnection();
    } catch {
      console.error('Production database connection cleanup failed.');
      process.exitCode = 1;
    }
  });
