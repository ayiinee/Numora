import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { backupCheck, BackupError } from './backup-config.js';

export const resticVersion = '0.19.1';
export interface OffhostConfig {
  binary: string;
  repository: string;
  repositoryId: string;
  passwordFile: string;
  hostAlias: string;
  key: string;
  secret: string;
  region: string;
  caFile?: string;
  limitKiB: number;
}
export const hashId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Explicit S3/TLS profile only. Local repositories are never accepted by the operator CLI. */
export function offhostConfig(env: NodeJS.ProcessEnv): OffhostConfig {
  const repository = env.RESTIC_REPOSITORY ?? '';
  let endpoint: URL;
  try {
    endpoint = new URL(repository.slice(3));
  } catch {
    throw new BackupError('Invalid off-host repository configuration');
  }
  backupCheck(
    repository.startsWith('s3:https://') &&
      endpoint.protocol === 'https:' &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      /^[a-z0-9][a-z0-9.-]*$/.test(endpoint.hostname) &&
      !isIP(endpoint.hostname) &&
      !['localhost', 'localhost.localdomain'].includes(endpoint.hostname) &&
      !endpoint.hostname.endsWith('.localhost') &&
      /^\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(endpoint.pathname) &&
      !endpoint.pathname.endsWith('/') &&
      repository === 's3:' + endpoint.origin + endpoint.pathname &&
      endpoint.origin === env.NUMORA_OFFHOST_EXPECTED_ORIGIN &&
      endpoint.pathname === env.NUMORA_OFFHOST_EXPECTED_PATH,
    'Off-host repository must match the reviewed HTTPS S3 origin and bucket/prefix pins',
  );
  backupCheck(
    hashId(env.NUMORA_OFFHOST_REPOSITORY_ID),
    'A full independently reviewed repository ID is required',
  );
  backupCheck(
    env.NUMORA_OFFHOST_RESTIC && isAbsolute(env.NUMORA_OFFHOST_RESTIC),
    'Use an absolute reviewed restic executable path',
  );
  backupCheck(
    env.RESTIC_PASSWORD_FILE && isAbsolute(env.RESTIC_PASSWORD_FILE),
    'Use a private absolute repository password-file path',
  );
  backupCheck(
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_DEFAULT_REGION,
    'Explicit scoped S3 credentials and region are required',
  );
  backupCheck(
    env.NUMORA_OFFHOST_HOST_ALIAS &&
      /^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.NUMORA_OFFHOST_HOST_ALIAS),
    'Use a non-personal deployment alias for backup snapshots',
  );
  backupCheck(
    !env.RESTIC_PASSWORD &&
      !env.RESTIC_PASSWORD_COMMAND &&
      !env.RESTIC_REPOSITORY_FILE &&
      !env.RESTIC_INSECURE_NO_PASSWORD &&
      env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' &&
      !env.HTTP_PROXY &&
      !env.HTTPS_PROXY &&
      !env.ALL_PROXY &&
      !env.http_proxy &&
      !env.https_proxy &&
      !env.all_proxy,
    'Remove password/repository commands, insecure modes and proxy overrides from the backup process',
  );
  const limitKiB = Number(env.NUMORA_OFFHOST_LIMIT_KIB);
  backupCheck(
    /^\d+$/.test(env.NUMORA_OFFHOST_LIMIT_KIB ?? '') &&
      Number.isSafeInteger(limitKiB) &&
      limitKiB >= 1 &&
      limitKiB <= 1048576,
    'Declare a reviewed positive transfer limit in KiB per second',
  );
  backupCheck(
    !env.RESTIC_CACERT || isAbsolute(env.RESTIC_CACERT),
    'Custom storage CA must use an absolute path',
  );
  return {
    binary: env.NUMORA_OFFHOST_RESTIC,
    repository,
    repositoryId: env.NUMORA_OFFHOST_REPOSITORY_ID,
    passwordFile: env.RESTIC_PASSWORD_FILE,
    hostAlias: env.NUMORA_OFFHOST_HOST_ALIAS,
    key: env.AWS_ACCESS_KEY_ID,
    secret: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_DEFAULT_REGION,
    limitKiB,
    ...(env.RESTIC_CACERT ? { caFile: env.RESTIC_CACERT } : {}),
  };
}

export function snapshotEvidence(
  input: unknown,
  id: string,
  archive: string,
  manifest: string,
  host: string,
) {
  const snapshots = input as {
    id?: string;
    paths?: string[];
    tags?: string[];
    hostname?: string;
  }[];
  backupCheck(
    Array.isArray(snapshots) &&
      snapshots.length === 1 &&
      hashId(snapshots[0]?.id) &&
      snapshots[0].id.startsWith(id) &&
      Array.isArray(snapshots[0].tags) &&
      JSON.stringify(snapshots[0].paths) === JSON.stringify([archive]) &&
      snapshots[0].hostname === host &&
      snapshots[0].tags?.includes('numora-application-v1') &&
      snapshots[0].tags.includes('manifest:' + manifest),
    'Encrypted snapshot does not match the archive, manifest, host alias and requested ID',
  );
  return snapshots[0].id;
}
