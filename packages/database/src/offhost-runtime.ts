import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { backupCheck, BackupError } from './backup-config.js';
import { fileHash, privatePath, privateWrite, verifyBackup } from './backup-runtime.js';
import { newReport } from './restore-vps.js';
import { hashId, resticVersion, snapshotEvidence, type OffhostConfig } from './offhost-config.js';

// Injectable only for isolated storage integration tests. No application-barrel export.
export type ResticRunner = (
  config: OffhostConfig,
  args: string[],
  privateTemp: string,
) => Promise<string>;
export const resticRun: ResticRunner = async (config, args, privateTemp) =>
  new Promise((done, reject) => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      TMPDIR: privateTemp,
      RESTIC_REPOSITORY: config.repository,
      RESTIC_PASSWORD_FILE: config.passwordFile,
      AWS_ACCESS_KEY_ID: config.key,
      AWS_SECRET_ACCESS_KEY: config.secret,
      AWS_DEFAULT_REGION: config.region,
      AWS_EC2_METADATA_DISABLED: 'true',
      GOMAXPROCS: '2',
      ...(config.caFile ? { RESTIC_CACERT: config.caFile } : {}),
    };
    const storageOptions = config.repository.startsWith('s3:')
      ? ['-o', 's3.bucket-lookup=path', '-o', 's3.connections=2']
      : [];
    const child = spawn(config.binary, ['--no-cache', '--json', ...storageOptions, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      stderr = 0,
      tooLarge = false,
      timedOut = false;
    child.stdout.on('data', (part: Buffer) => {
      if (output.length + part.length > 16 * 1024 * 1024) {
        tooLarge = true;
        child.kill('SIGTERM');
      } else output += part.toString('utf8');
    });
    child.stderr.on('data', (part: Buffer) => {
      stderr += part.length;
    });
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, 900000);
    const force = setTimeout(() => child.kill('SIGKILL'), 905000);
    child.once('error', () => {
      clearTimeout(deadline);
      clearTimeout(force);
      reject(new BackupError('Encrypted backup utility could not start'));
    });
    child.once('close', (code) => {
      clearTimeout(deadline);
      clearTimeout(force);
      if (code !== 0 || stderr || tooLarge || timedOut)
        reject(
          new BackupError('Encrypted backup operation failed or warned; no acceptance recorded'),
        );
      else done(output);
    });
  });

async function storagePreflight(config: OffhostConfig, temporary: string, run: ResticRunner) {
  await privatePath(config.passwordFile, false);
  const secret = await readFile(config.passwordFile, 'utf8');
  const password = secret.replace(/\r?\n$/, '');
  backupCheck(
    password.trim().length >= 32 && !/[\r\n]/.test(password),
    'Use a single-line repository password of at least 32 characters, escrowed independently of the VPS',
  );
  const version = JSON.parse(await run(config, ['version'], temporary));
  backupCheck(
    version.message_type === 'version' && version.version === resticVersion,
    'The encrypted backup profile requires its reviewed restic version',
  );
  const repository = JSON.parse(await run(config, ['cat', 'config'], temporary));
  backupCheck(
    repository.id === config.repositoryId && repository.version === 2,
    'Repository identity or encrypted format differs from the reviewed pins',
  );
}

const within = (parent: string, child: string) => {
  const path = relative(resolve(parent), resolve(child));
  return !path || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path));
};

export async function publishOffhost(
  config: OffhostConfig,
  folder: string,
  report: string,
  run: ResticRunner = resticRun,
) {
  backupCheck(
    isAbsolute(folder) && resolve(folder) === folder && !folder.includes(':'),
    'Use a canonical absolute POSIX archive path without a colon',
  );
  backupCheck(!within(folder, report), 'Keep publication receipts outside the immutable archive');
  await newReport(report);
  await verifyBackup(folder);
  const manifestSha256 = await fileHash(resolve(folder, 'manifest.json'));
  await storagePreflight(config, dirname(report), run);
  const output = await run(
    config,
    [
      'backup',
      '--force',
      '--host',
      config.hostAlias,
      '--tag',
      'numora-application-v1',
      '--tag',
      'manifest:' + manifestSha256,
      '--limit-upload',
      String(config.limitKiB),
      '--',
      folder,
    ],
    dirname(report),
  );
  const rows = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const summaries = rows.filter((row) => row.message_type === 'summary');
  const id = summaries[0]?.snapshot_id;
  backupCheck(
    summaries.length === 1 &&
      typeof id === 'string' &&
      /^[a-f0-9]{8,64}$/.test(id) &&
      !summaries[0].dry_run &&
      !rows.some((row) => row.message_type === 'error'),
    'Encrypted backup did not return one successful committed snapshot',
  );
  const snapshotId = snapshotEvidence(
    JSON.parse(await run(config, ['snapshots', id], dirname(report))),
    id,
    folder,
    manifestSha256,
    config.hostAlias,
  );
  // Detect accidental archive changes while restic was reading it.
  await verifyBackup(folder);
  backupCheck(
    (await fileHash(resolve(folder, 'manifest.json'))) === manifestSha256,
    'Archive changed during encrypted publication',
  );
  await privateWrite(
    report,
    JSON.stringify(
      {
        format: 'NUMORA_OFFHOST_PUBLICATION_V1',
        completedAt: new Date().toISOString(),
        result: 'PASS',
        repositoryId: config.repositoryId,
        snapshotId,
        manifestSha256,
        archivePath: folder,
        hostAlias: config.hostAlias,
        resticVersion,
        scope: 'ENCRYPTED_SNAPSHOT_WRITTEN_NOT_RECOVERED',
        recoveryReady: false,
      },
      null,
      2,
    ) + '\n',
  );
}

export async function recoverOffhost(
  config: OffhostConfig,
  receiptFile: string,
  expectedManifest: string,
  folder: string,
  report: string,
  run: ResticRunner = resticRun,
) {
  backupCheck(
    hashId(expectedManifest),
    'Provide the independently recorded full manifest checksum',
  );
  backupCheck(
    isAbsolute(receiptFile) && isAbsolute(folder),
    'Use absolute private receipt and new recovery paths',
  );
  backupCheck(
    !within(folder, report) && !within(folder, receiptFile),
    'Recovery output must not contain its receipt or report',
  );
  await newReport(report);
  await privatePath(receiptFile, false);
  const receiptText = await readFile(receiptFile, 'utf8');
  const receiptSha256 = createHash('sha256').update(receiptText).digest('hex');
  const receipt = JSON.parse(receiptText);
  backupCheck(
    receipt.format === 'NUMORA_OFFHOST_PUBLICATION_V1' &&
      receipt.result === 'PASS' &&
      receipt.repositoryId === config.repositoryId &&
      receipt.manifestSha256 === expectedManifest &&
      hashId(receipt.snapshotId) &&
      typeof receipt.archivePath === 'string' &&
      receipt.archivePath.startsWith('/') &&
      !receipt.archivePath.includes(':') &&
      resolve(receipt.archivePath) === receipt.archivePath &&
      receipt.hostAlias === config.hostAlias,
    'Publication receipt differs from the reviewed repository, manifest or snapshot identity',
  );
  await privatePath(dirname(folder), true);
  backupCheck(
    (await realpath(dirname(folder))) === resolve(dirname(folder)),
    'Recovery parent must not traverse symbolic links',
  );
  try {
    await lstat(folder);
    throw new BackupError('Recovery target already exists; no overwrite is supported');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  await storagePreflight(config, dirname(report), run);
  snapshotEvidence(
    JSON.parse(await run(config, ['snapshots', receipt.snapshotId], dirname(report))),
    receipt.snapshotId,
    receipt.archivePath,
    expectedManifest,
    config.hostAlias,
  );
  // A unique target plus subtree restore prevents recreating source absolute parent paths.
  await mkdir(folder, { mode: 0o700 });
  await run(
    config,
    [
      'restore',
      receipt.snapshotId + ':' + receipt.archivePath,
      '--target',
      folder,
      '--overwrite',
      'never',
      '--verify',
      '--limit-download',
      String(config.limitKiB),
    ],
    dirname(report),
  );
  await verifyBackup(folder);
  backupCheck(
    (await fileHash(resolve(folder, 'manifest.json'))) === expectedManifest,
    'Downloaded archive differs from the independently recorded manifest',
  );
  await privateWrite(
    report,
    JSON.stringify(
      {
        format: 'NUMORA_OFFHOST_RECOVERY_V1',
        completedAt: new Date().toISOString(),
        result: 'PASS',
        repositoryId: config.repositoryId,
        snapshotId: receipt.snapshotId,
        manifestSha256: expectedManifest,
        publicationReceiptSha256: receiptSha256,
        resticVersion,
        scope: 'DECRYPTED_ARCHIVE_VERIFIED_NOT_DATABASE_RESTORED',
        databaseRestored: false,
        runtimeReady: false,
        cutoverReady: false,
      },
      null,
      2,
    ) + '\n',
  );
}
