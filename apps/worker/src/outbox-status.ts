import { closeDatabaseConnection } from '@tka/database';
import { outboxStatus } from './outbox.js';

async function main() {
  try { console.log(JSON.stringify(await outboxStatus())); }
  finally { await closeDatabaseConnection(); }
}
void main().catch(() => { console.error('[outbox] status unavailable'); process.exitCode = 1; });
