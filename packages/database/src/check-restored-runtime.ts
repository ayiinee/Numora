import postgres from 'postgres';
import { backupCheck } from './backup-config.js';
import { backupFailure, privateWrite } from './backup-runtime.js';
import { newReport } from './restore-vps.js';
import {
  productionTarget,
  ProductionPreflightError,
  type ProductionService,
} from './production-runtime.js';
import {
  assertRestoredTarget,
  inspectRestoredRuntime,
  readRestoreEvidence,
} from './post-restore-runtime.js';

async function run() {
  const [service, restoreReport, plan, output, ...extra] = process.argv.slice(2);
  backupCheck(
    (service === 'api' || service === 'worker') && restoreReport && plan && output && !extra.length,
    'Expected api|worker /private/restore-report.json /private/restore-plan.json /private/new-runtime-report.json',
  );
  await newReport(output);
  const evidence = await readRestoreEvidence(restoreReport, plan);
  const target = productionTarget(service as ProductionService);
  backupCheck(target, 'An injected Production VPS configuration is required');
  assertRestoredTarget(service as ProductionService, target, evidence);
  const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
    connection: {
      application_name: 'numora-restored-runtime-inspection',
      default_transaction_read_only: true,
    },
  });
  try {
    const result = await inspectRestoredRuntime(
      client,
      service as ProductionService,
      target,
      evidence,
    );
    // Write acceptance only after the single inspection connection closes successfully.
    await client.end({ timeout: 5 });
    await privateWrite(output, JSON.stringify(result, null, 2) + '\n');
    console.log(
      'Read-only restored runtime database inspection passed; full runtime and cutover readiness remain unverified.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}
void run().catch((error: unknown) => {
  // Deliberately avoid raw PostgreSQL, URL, JSON, filesystem or static-config errors.
  console.error(error instanceof ProductionPreflightError ? error.message : backupFailure(error));
  process.exitCode = 1;
});
