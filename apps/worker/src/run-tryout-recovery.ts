import { closeDatabaseConnection } from '@tka/database';
import { recoverOverdueTryouts, type RecoveryCursor } from './tryout-recovery.js';

// A PostgreSQL-only recovery runner for deployments where Redis is unavailable.
async function main() {
  let stopping = false;
  let cursor: RecoveryCursor | undefined;
  let lastLogAt = 0;
  let lastErrorAt = 0;
  let wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    do {
      try {
        const result = await recoverOverdueTryouts(100, cursor);
        cursor = result.nextCursor;
        if (process.argv.includes('--once') || result.finalized || Date.now() - lastLogAt >= 60_000) {
          console.log('[tryout] recovery', { ...result, nextCursor: undefined });
          lastLogAt = Date.now();
        }
        if (process.argv.includes('--once') && result.failed) process.exitCode = 1;
      }
      catch {
        if (process.argv.includes('--once') || Date.now() - lastErrorAt >= 60_000) {
          console.error('[tryout] recovery failed; retry after controlled interval');
          lastErrorAt = Date.now();
        }
        if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      }
      if (process.argv.includes('--once') || stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, 5_000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    } while (!stopping);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await closeDatabaseConnection();
  }
}
void main().catch(() => { console.error('[tryout] recovery shutdown failed'); process.exitCode = 1; });
