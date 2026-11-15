import { backupCheck, backupTarget } from './backup-config.js';
import {
  backupFailure,
  createBackup,
  inspectBackupSource,
  rehearseBackup,
  verifyBackup,
} from './backup-runtime.js';

async function run() {
  process.umask(0o077);
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inventory') {
    backupCheck(
      args.length === 2,
      'Usage: db:backup inventory /private/new-inventory.json /private/writers.json',
    );
    await inspectBackupSource(backupTarget(process.env, 'SOURCE'), args[0]!, args[1]!);
    console.log(
      'Read-only source inventory recorded. No dump, restore or writer shutdown was performed.',
    );
  } else if (command === 'create') {
    backupCheck(
      args.length === 2,
      'Usage: db:backup create /absolute/new-folder /private/writers.json',
    );
    await createBackup(backupTarget(process.env, 'SOURCE'), args[0]!, args[1]!);
    console.log(
      'Application backup committed. Verify checksums and rehearse restore before accepting recovery.',
    );
  } else if (command === 'verify') {
    backupCheck(args.length === 1, 'Usage: db:backup verify /absolute/backup-folder');
    await verifyBackup(args[0]!);
    console.log('Backup checksums and scope verified. Recoverability is not yet established.');
  } else if (command === 'rehearse') {
    backupCheck(
      args.length === 2,
      'Usage: db:backup rehearse /absolute/backup-folder /private/new-report.json',
    );
    await rehearseBackup(backupTarget(process.env, 'REHEARSAL'), args[0]!, args[1]!);
    console.log(
      'Local original-owner restore rehearsal passed. Production cutover is a separate procedure.',
    );
  } else
    backupCheck(
      false,
      'Expected inventory, create, verify or rehearse; run without database credentials for verify',
    );
}
void run().catch((error: unknown) => {
  console.error(backupFailure(error));
  process.exitCode = 1;
});
