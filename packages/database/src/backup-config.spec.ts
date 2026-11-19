import { describe, expect, it } from 'vitest';
import { backupTarget, backupLoginRole, writerInventory, writerKinds } from './backup-config.js';
import { backupFailure } from './backup-runtime.js';

const source: NodeJS.ProcessEnv = {
  NUMORA_BACKUP_SOURCE_HOST: 'db.example.test',
  NUMORA_BACKUP_SOURCE_PORT: '5432',
  NUMORA_BACKUP_SOURCE_DATABASE: 'postgres',
  NUMORA_BACKUP_SOURCE_USER: 'backup',
  NUMORA_BACKUP_SOURCE_URL:
    'postgres://backup:DO_NOT_PRINT@db.example.test:5432/postgres?sslmode=verify-full',
};
describe('operator backup boundaries', () => {
  it('accepts a pinned verified direct/session endpoint independently of application env', () => {
    expect(backupTarget({ ...source, DATABASE_URL: 'invalid' }, 'SOURCE').hostname).toBe(
      'db.example.test',
    );
  });
  it.each([
    { NUMORA_BACKUP_SOURCE_HOST: 'wrong.test' },
    { NUMORA_BACKUP_SOURCE_PORT: '6543' },
    { NUMORA_BACKUP_SOURCE_DATABASE: 'wrong' },
    { NUMORA_BACKUP_SOURCE_USER: 'wrong' },
    {
      NUMORA_BACKUP_SOURCE_URL: source.NUMORA_BACKUP_SOURCE_URL!.replace('verify-full', 'require'),
    },
    { NUMORA_BACKUP_SOURCE_URL: source.NUMORA_BACKUP_SOURCE_URL! + '&host=wrong.test' },
    { NUMORA_BACKUP_SOURCE_URL: source.NUMORA_BACKUP_SOURCE_URL! + '&sslmode=disable' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { PGOPTIONS: '-c role=postgres' },
    { NUMORA_BACKUP_SOURCE_URL: 'invalid' },
    {
      NUMORA_BACKUP_SOURCE_URL: source.NUMORA_BACKUP_SOURCE_URL!.replace(
        'db.example.test',
        '127.0.0.1',
      ),
    },
    {
      NUMORA_BACKUP_SOURCE_URL: source.NUMORA_BACKUP_SOURCE_URL!.replace(':5432', ':6543'),
      NUMORA_BACKUP_SOURCE_PORT: '6543',
    },
  ])('rejects unsafe route/TLS changes without leaking credentials: %j', (change) => {
    expect(() => backupTarget({ ...source, ...change }, 'SOURCE')).toThrow();
    try {
      backupTarget({ ...source, ...change }, 'SOURCE');
    } catch (error) {
      expect(backupFailure(error)).not.toContain('DO_NOT_PRINT');
    }
  });
  it('limits rehearsal to a separate explicitly named localhost fixture', () => {
    const name = 'numora_restore_test_' + 'a'.repeat(32);
    const env = {
      NUMORA_BACKUP_REHEARSAL_HOST: 'localhost',
      NUMORA_BACKUP_REHEARSAL_PORT: '5432',
      NUMORA_BACKUP_REHEARSAL_DATABASE: name,
      NUMORA_BACKUP_REHEARSAL_USER: 'backup',
      NUMORA_BACKUP_REHEARSAL_URL: `postgres://backup:TEST@localhost:5432/${name}?sslmode=verify-full`,
    };
    expect(backupTarget(env, 'REHEARSAL').hostname).toBe('localhost');
    for (const database of [
      'postgres',
      'numora_production',
      'numora_test',
      'numora_restore_test_wrong',
    ])
      expect(() =>
        backupTarget(
          {
            ...env,
            NUMORA_BACKUP_REHEARSAL_DATABASE: database,
            NUMORA_BACKUP_REHEARSAL_URL: env.NUMORA_BACKUP_REHEARSAL_URL.replace(name, database),
          },
          'REHEARSAL',
        ),
      ).toThrow();
  });
  it('matches the actual backend role behind a Supabase session pooler', () => {
    expect(
      backupLoginRole(
        new URL(
          'postgres://backup.abcdefghijklmnopqrst:TEST@aws-0.example.pooler.supabase.com:5432/postgres?sslmode=verify-full',
        ),
      ),
    ).toBe('backup');
    expect(() =>
      backupLoginRole(
        new URL(
          'postgres://backup:TEST@aws-0.example.pooler.supabase.com:5432/postgres?sslmode=verify-full',
        ),
      ),
    ).toThrow();
  });
  it('requires every writer category, owners, explicit states and a real review timestamp', () => {
    const inventory = {
      reviewedBy: 'operator',
      reviewedAt: new Date().toISOString(),
      writers: writerKinds.map((kind) => ({
        kind,
        id: kind,
        owner: 'operator',
        state: 'stopped',
      })),
    };
    expect(writerInventory(inventory)).toEqual(inventory);
    expect(() => writerInventory({ ...inventory, reviewedAt: 'REPLACE' })).toThrow();
    for (const kind of writerKinds)
      expect(() =>
        writerInventory({
          ...inventory,
          writers: inventory.writers.filter((row) => row.kind !== kind),
        }),
      ).toThrow();
    expect(() =>
      writerInventory({ ...inventory, writers: [...inventory.writers, inventory.writers[0]] }),
    ).toThrow();
    expect(() =>
      writerInventory({
        ...inventory,
        writers: inventory.writers.map((row) => ({ ...row, state: 'unknown' })),
      }),
    ).toThrow();
    expect(() =>
      writerInventory({
        ...inventory,
        writers: inventory.writers.map((row) => ({ ...row, owner: '' })),
      }),
    ).toThrow();
  });
  it('sanitizes unexpected database, filesystem and utility errors', () => {
    expect(backupFailure(new Error('DO_NOT_PRINT postgres://secret'))).not.toContain(
      'DO_NOT_PRINT',
    );
  });
});
