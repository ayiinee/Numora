import { isIP } from 'node:net';

export const backupSchemas = ['public', 'irt_compute', 'drizzle'] as const;
export const writerKinds = [
  'api',
  'worker',
  'scheduler',
  'generator',
  'irt',
  'cron',
  'localDevelopment',
  'localStaging',
  'migrationRunner',
  'other',
] as const;

/** Only fixed messages are suitable for console output. Never print provider/process errors. */
export class BackupError extends Error {}
export function backupCheck(value: unknown, message: string): asserts value {
  if (!value) throw new BackupError(message);
}

export function backupTarget(env: NodeJS.ProcessEnv, purpose: 'SOURCE' | 'REHEARSAL') {
  const prefix = `NUMORA_BACKUP_${purpose}_`;
  let url: URL;
  try {
    url = new URL(env[prefix + 'URL'] ?? '');
  } catch {
    throw new BackupError('A pinned PostgreSQL backup connection is required');
  }
  backupCheck(
    ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname &&
      url.username &&
      url.password &&
      !url.hash &&
      !isIP(url.hostname),
    'Use a complete PostgreSQL URL with a TLS DNS hostname',
  );
  backupCheck(
    url.hostname === env[prefix + 'HOST'] &&
      (url.port || '5432') === env[prefix + 'PORT'] &&
      decodeURIComponent(url.pathname.slice(1)) === env[prefix + 'DATABASE'] &&
      decodeURIComponent(url.username) === env[prefix + 'USER'],
    'Backup connection differs from the operator-pinned target',
  );
  backupCheck(
    url.searchParams.getAll('sslmode').length === 1 &&
      url.searchParams.get('sslmode') === 'verify-full' &&
      [...url.searchParams.keys()].every((key) => key === 'sslmode') &&
      env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    'Backup requires verified TLS without connection overrides',
  );
  backupCheck(!env.PGOPTIONS, 'Remove inherited PGOPTIONS from the operator backup process');
  // Direct/session endpoints are required: transaction poolers cannot retain exported snapshots.
  backupCheck(
    url.port !== '6543',
    'Use a direct or session PostgreSQL endpoint, not the transaction pooler',
  );
  if (purpose === 'REHEARSAL')
    backupCheck(
      url.hostname === 'localhost' && /^\/numora_restore_test_[a-f0-9]{32}$/.test(url.pathname),
      'Restore rehearsal is limited to an owned localhost test database',
    );
  return url;
}

export function backupLoginRole(url: URL) {
  const login = decodeURIComponent(url.username);
  if (url.hostname.endsWith('.pooler.supabase.com')) {
    backupCheck(
      /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-z0-9]{20}$/.test(login),
      'Session pooler login must include its explicit project reference',
    );
    return login.slice(0, -21);
  }
  return login;
}

export function writerInventory(input: unknown) {
  const value = input as {
    reviewedAt?: string;
    reviewedBy?: string;
    writers?: { kind: string; id: string; owner: string; state: string }[];
  };
  backupCheck(
    value &&
      typeof value.reviewedBy === 'string' &&
      value.reviewedBy.trim() &&
      typeof value.reviewedAt === 'string' &&
      Number.isFinite(Date.parse(value.reviewedAt)) &&
      Array.isArray(value.writers),
    'A reviewed writer inventory is required',
  );
  const ids = new Set<string>();
  for (const item of value.writers) {
    backupCheck(
      item &&
        (writerKinds as readonly string[]).includes(item.kind) &&
        typeof item.id === 'string' &&
        /^[a-zA-Z0-9_-]+$/.test(item.id) &&
        !ids.has(item.id) &&
        typeof item.owner === 'string' &&
        item.owner.trim() &&
        ['active', 'stopped', 'not-deployed'].includes(item.state),
      'Every writer needs a unique alias, owner and explicit state',
    );
    ids.add(item.id);
  }
  backupCheck(
    writerKinds.every((kind) => value.writers!.some((writer) => writer.kind === kind)),
    'Inventory must explicitly cover every writer category, including local Development/Staging',
  );
  return value;
}
