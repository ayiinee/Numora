import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { checkDatabaseConnection, closeDatabaseConnection } from '@tka/database';
import { drainOutboxBatch, outboxStatus } from './outbox.js';
import { projectClassLeaderboard } from './class-leaderboard.js';
import { recoverOverdueTryouts, type RecoveryCursor } from './tryout-recovery.js';

const OPERATION_TIMEOUT_MS = 5_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

export function isRedisQuotaError(error: unknown): boolean {
  return error instanceof Error && /max requests limit exceeded/i.test(error.message);
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('WORKER_OPERATION_TIMEOUT')),
          OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The injectable exit callback lets outage tests exercise shutdown without a cloud connection.
export async function runWorker(exit: (code: number) => void = (code) => process.exit(code)) {
  let connection: Redis | undefined;
  let worker: Worker | undefined;
  let outboxTimer: ReturnType<typeof setInterval> | undefined;
  let leaderboardTimer: ReturnType<typeof setTimeout> | undefined;
  let tryoutTimer: ReturnType<typeof setInterval> | undefined;
  let tryoutBusy = false;
  let recoveryCursor: RecoveryCursor | undefined;
  let lastRecoveryLogAt = 0;
  let outboxBusy = false;
  let lastOutboxStatusAt = 0;
  let leaderboardBusy = false;
  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;
  let lastErrorLogAt: number | undefined;

  function shutdown(code: number, force = false): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    if (outboxTimer) clearInterval(outboxTimer);
    if (tryoutTimer) clearInterval(tryoutTimer);
    if (leaderboardTimer) clearTimeout(leaderboardTimer);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    shutdownPromise = (async () => {
      try {
        await bounded(
          Promise.all([
            worker?.close(force),
            (async () => {
              while (outboxBusy || leaderboardBusy || tryoutBusy) {
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            })(),
          ]),
        );
      } catch {
        console.error('[worker] shutdown did not finish within its grace period');
      } finally {
        // QUIT itself can be rejected by an exhausted provider. Disconnect sends no command.
        connection?.disconnect();
        try {
          await bounded(closeDatabaseConnection());
        } catch {
          console.error('[worker] database shutdown did not finish');
        }
        exit(code);
      }
    })();
    return shutdownPromise;
  }

  function reportError(error: unknown) {
    if (stopping) return;
    if (isRedisQuotaError(error)) {
      console.error(
        '[worker] REDIS_QUOTA_EXCEEDED: worker stopped. Restore Redis quota or use a dedicated instance, then restart dev:worker.',
      );
      void shutdown(1, true);
      return;
    }
    const now = Date.now();
    if (lastErrorLogAt === undefined || now - lastErrorLogAt >= ERROR_LOG_INTERVAL_MS) {
      // Provider errors may contain endpoint credentials; log only a fixed diagnostic.
      console.error(
        '[worker] dependency unavailable; retrying with backoff (logs limited to once per minute)',
      );
      lastErrorLogAt = now;
    }
  }

  function onSignal() {
    void shutdown(0);
  }
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const redisUrl = process.env.REDIS_URL;
    const prefix = process.env.BULLMQ_PREFIX;
    if (!redisUrl?.startsWith('rediss://') || !prefix || prefix.includes('<')) {
      throw new Error('WORKER_CONFIGURATION_INVALID');
    }
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: OPERATION_TIMEOUT_MS,
      retryStrategy: (times) => Math.min(1_000 * 2 ** Math.min(times - 1, 5), 20_000),
    });
    connection.on('error', reportError);
    // Do not create the BullMQ retry loop until the provider accepts a command.
    await bounded(connection.connect());
    await bounded(connection.ping());
    if (stopping) return;
    await bounded(checkDatabaseConnection());
    if (stopping) return;
    worker = new Worker(
      'bootstrap',
      async (job) => ({ processedAt: new Date().toISOString(), jobName: job.name }),
      { connection, prefix, autorun: false, drainDelay: 30, runRetryDelay: 30_000 },
    );
    worker.on('error', reportError);
    worker.on('failed', (_job, error) => reportError(error));
    worker.on('completed', () => console.log('[worker] bootstrap probe completed'));
    await bounded(worker.waitUntilReady());
    if (stopping) return;
    void worker.run().catch(reportError);
    console.log('[worker] Redis connected; background processing enabled');

    const poll = async () => {
      if (stopping || outboxBusy) return;
      outboxBusy = true;
      try {
        const result = await drainOutboxBatch();
        if (result.processed || result.failed) console.log('[outbox] batch', result);
        if (Date.now() - lastOutboxStatusAt >= 60_000) {
          console.log('[outbox] status', await outboxStatus());
          lastOutboxStatusAt = Date.now();
        }
      } catch {
        reportError(new Error('OUTBOX_POLL_FAILED'));
      } finally {
        outboxBusy = false;
      }
    };
    const project = async () => {
      if (stopping || leaderboardBusy) return;
      leaderboardBusy = true;
      try {
        console.log('[leaderboard] class projection', await projectClassLeaderboard());
      } catch {
        reportError(new Error('LEADERBOARD_PROJECTION_FAILED'));
      } finally {
        leaderboardBusy = false;
      }
    };
    const scheduleNextHour = () => {
      if (stopping) return;
      leaderboardTimer = setTimeout(
        async () => {
          await project();
          scheduleNextHour();
        },
        3_600_000 - (Date.now() % 3_600_000),
      );
    };
    const recover = async () => {
      if (stopping || tryoutBusy) return;
      tryoutBusy = true;
      try {
        const result = await recoverOverdueTryouts(100, recoveryCursor);
        recoveryCursor = result.nextCursor;
        if (result.finalized || ((result.failed || result.backlog) && Date.now() - lastRecoveryLogAt >= ERROR_LOG_INTERVAL_MS)) {
          lastRecoveryLogAt = Date.now();
          console.log('[tryout] recovery', { ...result, nextCursor: undefined });
        }
      } catch { reportError(new Error('TRYOUT_RECOVERY_FAILED')); }
      finally { tryoutBusy = false; }
    };
    await recover();
    if (stopping) return;
    tryoutTimer = setInterval(() => void recover(), 5_000);
    await poll();
    if (stopping) return;
    outboxTimer = setInterval(() => void poll(), 5_000);
    await project();
    if (stopping) return;
    scheduleNextHour();
    return { stop: () => shutdown(0) };
  } catch (error) {
    if (!stopping) {
      if (isRedisQuotaError(error)) reportError(error);
      else
        console.error(
          '[worker] startup failed; check Redis TLS/prefix and database availability, then restart manually',
        );
    }
    await shutdown(1, true);
  }
}
