import { expect, it } from 'vitest';
import { offhostConfig, snapshotEvidence } from './offhost-config.js';

const id = 'a'.repeat(64),
  manifest = 'b'.repeat(64);
const env: NodeJS.ProcessEnv = {
  RESTIC_REPOSITORY: 's3:https://storage.example.test/backup-bucket/numora-production',
  NUMORA_OFFHOST_EXPECTED_ORIGIN: 'https://storage.example.test',
  NUMORA_OFFHOST_EXPECTED_PATH: '/backup-bucket/numora-production',
  NUMORA_OFFHOST_REPOSITORY_ID: id,
  NUMORA_OFFHOST_RESTIC: '/usr/local/bin/restic',
  RESTIC_PASSWORD_FILE: '/private/password',
  NUMORA_OFFHOST_HOST_ALIAS: 'production-main',
  AWS_ACCESS_KEY_ID: 'TEST_ONLY_KEY',
  AWS_SECRET_ACCESS_KEY: 'NEVER_PRINT',
  AWS_DEFAULT_REGION: 'auto',
  NUMORA_OFFHOST_LIMIT_KIB: '2048',
};
it('accepts reviewed HTTPS S3 pins and a separately escrowed password file', () => {
  expect(offhostConfig(env)).toMatchObject({
    repositoryId: id,
    hostAlias: 'production-main',
    limitKiB: 2048,
  });
});
it.each([
  { RESTIC_REPOSITORY: '/private/local-repo' },
  { RESTIC_REPOSITORY: 's3:http://storage.example.test/backup-bucket/numora-production' },
  {
    RESTIC_REPOSITORY: 's3:https://key:secret@storage.example.test/backup-bucket/numora-production',
  },
  { RESTIC_REPOSITORY: env.RESTIC_REPOSITORY + '?insecure=true' },
  { RESTIC_REPOSITORY: 's3:https://storage.example.test/backup-bucket/other/../numora-production' },
  { NUMORA_OFFHOST_EXPECTED_ORIGIN: 'https://other.test' },
  { NUMORA_OFFHOST_EXPECTED_PATH: '/backup-bucket/other' },
  { NUMORA_OFFHOST_REPOSITORY_ID: 'latest' },
  { RESTIC_PASSWORD: 'NEVER_PRINT' },
  { RESTIC_PASSWORD_COMMAND: 'unsafe-command' },
  { RESTIC_REPOSITORY_FILE: '/private/override' },
  { RESTIC_INSECURE_NO_PASSWORD: 'true' },
  { HTTPS_PROXY: 'https://proxy.test' },
  { AWS_SECRET_ACCESS_KEY: '' },
  { NUMORA_OFFHOST_LIMIT_KIB: '0' },
  { NUMORA_OFFHOST_HOST_ALIAS: 'operator@example.test' },
])('rejects unsafe or mismatched off-host configuration %#', (change) => {
  expect(() => offhostConfig({ ...env, ...change })).toThrow();
});
it('rejects loopback and IP repositories even when the pins agree', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]'])
    expect(() =>
      offhostConfig({
        ...env,
        RESTIC_REPOSITORY: `s3:https://${host}/backup-bucket/numora-production`,
        NUMORA_OFFHOST_EXPECTED_ORIGIN: `https://${host}`,
      }),
    ).toThrow();
});
it('requires an exact snapshot, archive, manifest and deployment alias', () => {
  const snapshot = {
    id,
    paths: ['/private/archive'],
    hostname: 'production-main',
    tags: ['numora-application-v1', 'manifest:' + manifest],
  };
  expect(snapshotEvidence([snapshot], id, '/private/archive', manifest, 'production-main')).toBe(
    id,
  );
  for (const change of [
    { id: 'c'.repeat(64) },
    { paths: ['/private/other'] },
    { hostname: 'other' },
    { tags: ['numora-application-v1'] },
  ])
    expect(() =>
      snapshotEvidence(
        [{ ...snapshot, ...change }],
        id,
        '/private/archive',
        manifest,
        'production-main',
      ),
    ).toThrow(/snapshot/);
  expect(() =>
    snapshotEvidence([snapshot, snapshot], id, '/private/archive', manifest, 'production-main'),
  ).toThrow();
});
