import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: {
    connect: vi.fn(),
    ping: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  worker: { close: vi.fn(), waitUntilReady: vi.fn(), run: vi.fn(), on: vi.fn() },
  redisConstructor: vi.fn(),
  workerConstructor: vi.fn(),
  checkDatabase: vi.fn(),
  productionCheck: vi.fn(),
  closeDatabase: vi.fn(),
  outbox: vi.fn(),
  status: vi.fn(),
  recover: vi.fn(),
  project: vi.fn(),
  notify: vi.fn(),
  irt: vi.fn(),
  irtQueue: { close: vi.fn() },
  workerHandlers: new Map<string, (...args: unknown[]) => void>(),
  redisHandlers: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn(function () {
    mocks.redisConstructor();
    return mocks.redis;
  }),
}));
vi.mock('bullmq', () => ({
  Worker: vi.fn(function () {
    mocks.workerConstructor();
    return mocks.worker;
  }),
}));
vi.mock('@tka/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tka/database')>()),
  checkDatabaseConnection: mocks.checkDatabase,
  closeDatabaseConnection: mocks.closeDatabase,
  getDatabase: () => ({ client: {} }),
  verifyProductionDatabase: mocks.productionCheck,
}));
vi.mock('./tryout-recovery.js', () => ({ recoverOverdueTryouts: mocks.recover }));
vi.mock('./notifications.js', () => ({
  discoverNotificationReleases: vi.fn(async () => {}),
  drainNotificationBatch: mocks.notify,
}));
vi.mock('./outbox.js', () => ({ drainOutboxBatch: mocks.outbox, outboxStatus: mocks.status }));
vi.mock('./class-leaderboard.js', () => ({ projectClassLeaderboard: mocks.project }));
vi.mock('./irt-v3.js', () => ({
  createIrtQueue: vi.fn(() => mocks.irtQueue),
  pollIrtV3: mocks.irt,
}));
import { runWorker } from './worker-runtime.js';

describe('worker Redis outage lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv('REDIS_URL', 'rediss://fixture-secret@redis.invalid:6379');
    vi.stubEnv('BULLMQ_PREFIX', 'numora:dev:fixture');
    vi.stubEnv('IRT_V3_ENABLED', 'false');
    mocks.workerHandlers.clear();
    mocks.redisHandlers.clear();
    mocks.redis.on.mockImplementation((event, handler) => mocks.redisHandlers.set(event, handler));
    mocks.worker.on.mockImplementation((event, handler) =>
      mocks.workerHandlers.set(event, handler),
    );
    mocks.redis.connect.mockResolvedValue(undefined);
    mocks.redis.ping.mockResolvedValue('PONG');
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.del.mockResolvedValue(1);
    mocks.worker.waitUntilReady.mockResolvedValue(undefined);
    mocks.worker.run.mockImplementation(() => new Promise(() => {}));
    mocks.worker.close.mockResolvedValue(undefined);
    mocks.checkDatabase.mockResolvedValue(undefined);
    mocks.productionCheck.mockResolvedValue(undefined);
    mocks.closeDatabase.mockResolvedValue(undefined);
    mocks.status.mockResolvedValue({ pending: 0, failed: 0, retryReady: 0, coolingDown: 0 });
    mocks.outbox.mockResolvedValue({ processed: 0, failed: 0 });
    mocks.project.mockResolvedValue({});
    mocks.recover.mockResolvedValue({ finalized: 0, failed: 0, backlog: 0 });
    mocks.notify.mockResolvedValue({ delivered: 0, failed: 0 });
    mocks.irt.mockResolvedValue({ notified: 0, adopted: 0, failed: 0 });
    mocks.irtQueue.close.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('exits once on quota exhaustion before creating a BullMQ consumer or touching business jobs', async () => {
    mocks.redis.ping.mockRejectedValue(
      new Error('ERR max requests limit exceeded: fixture-secret'),
    );
    const exit = vi.fn();
    await runWorker(exit);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.workerConstructor).not.toHaveBeenCalled();
    expect(mocks.outbox).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.redis.disconnect).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledOnce();
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('fixture-secret');
  });
  it('publishes optional reporting heartbeats without changing polling and removes its key on stop', async () => {
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
    const exit = vi.fn();
    const runtime = await runWorker(exit);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^numora:metrics:/),
      expect.any(String),
      'EX',
      45,
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.redis.set.mock.calls.length).toBeGreaterThan(1);
    await runtime!.stop();
    expect(mocks.redis.del).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('stops both job schedules on runtime quota errors and suppresses duplicate failures', async () => {
    const exit = vi.fn();
    await runWorker(exit);
    const quota = new Error('ERR max requests limit exceeded');
    mocks.workerHandlers.get('error')!(quota);
    mocks.redisHandlers.get('error')!(quota);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.worker.close).toHaveBeenCalledExactlyOnceWith(true);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(mocks.outbox).toHaveBeenCalledOnce();
    expect(mocks.project).toHaveBeenCalledOnce();
    expect(mocks.recover).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('limits transient error logs, keeps durable jobs running, and stops normally', async () => {
    const exit = vi.fn();
    const runtime = await runWorker(exit);
    const report = mocks.workerHandlers.get('error')!;
    for (let index = 0; index < 10; index++) report(new Error('network failure: fixture-secret'));
    expect(console.error).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    report(new Error('network failure'));
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(mocks.outbox.mock.calls.length).toBeGreaterThan(1);
    await runtime!.stop();
    expect(mocks.worker.close).toHaveBeenCalledExactlyOnceWith(false);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('fixture-secret');
  });

  it('bounds shutdown when the provider prevents BullMQ from closing', async () => {
    const exit = vi.fn();
    await runWorker(exit);
    mocks.worker.close.mockImplementation(() => new Promise(() => {}));
    mocks.workerHandlers.get('error')!(new Error('ERR max requests limit exceeded'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.redis.disconnect).toHaveBeenCalledOnce();
  });

  it('waits for both notification and IRT polling before closing the database', async () => {
    vi.stubEnv('IRT_V3_ENABLED', 'true');
    const exit = vi.fn();
    const runtime = await runWorker(exit);
    let finishNotification!: () => void;
    let finishIrt!: () => void;
    mocks.notify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNotification = () => resolve({ delivered: 0, failed: 0 });
        }),
    );
    mocks.irt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishIrt = () => resolve({ notified: 0, adopted: 0, failed: 0 });
        }),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    const stopping = runtime!.stop();
    expect(mocks.closeDatabase).not.toHaveBeenCalled();
    finishNotification();
    await vi.advanceTimersByTimeAsync(50);
    expect(mocks.closeDatabase).not.toHaveBeenCalled();
    finishIrt();
    await vi.advanceTimersByTimeAsync(50);
    await stopping;
    expect(mocks.irtQueue.close).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('bounds startup when Redis cannot connect and removes signal listeners', async () => {
    const initialListeners = process.listenerCount('SIGTERM');
    mocks.redis.connect.mockImplementation(() => new Promise(() => {}));
    const exit = vi.fn();
    const startup = runWorker(exit);
    await vi.advanceTimersByTimeAsync(5_000);
    await startup;
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.workerConstructor).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGTERM')).toBe(initialListeners);
  });
  it('rejects missing Production target before Redis, consumers or business jobs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NUMORA_DEPLOYMENT_PROFILE', '');
    const exit = vi.fn();
    await runWorker(exit);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
    expect(mocks.productionCheck).not.toHaveBeenCalled();
    expect(mocks.outbox).not.toHaveBeenCalled();
    expect(mocks.workerConstructor).not.toHaveBeenCalled();
  });
  it('waits for the Production database preflight before allowing the consumer to start', async () => {
    for (const [key, value] of Object.entries({
      NODE_ENV: 'production',
      NUMORA_DEPLOYMENT_PROFILE: 'production-vps',
      DATABASE_URL:
        'postgres://worker:TEST_ONLY@db.example.test:5432/numora_production?sslmode=verify-full',
      DATABASE_EXPECTED_HOST: 'db.example.test',
      DATABASE_EXPECTED_PORT: '5432',
      DATABASE_EXPECTED_NAME: 'numora_production',
      DATABASE_EXPECTED_USER: 'worker',
      DB_POOL_MAX: '1',
      DATABASE_MIGRATION_URL: '',
      ALLOW_SYNTHETIC_CONTENT: 'false',
      PVP_MODE: 'disabled',
      PVP_CONTENT_MODE: 'strict',
      REDIS_URL: 'rediss://default:TEST_ONLY@redis.example.test:6379',
      BULLMQ_PREFIX: 'numora:prod:fixture',
      NUMORA_OBSERVABILITY_ENABLED: 'false',
      NUMORA_IRT_DATABASE_URL: '',
      NUMORA_GENERATOR_ENABLED: 'false',
      PGOPTIONS: '',
      NODE_TLS_REJECT_UNAUTHORIZED: '1',
    }))
      vi.stubEnv(key, value);
    let release!: () => void;
    mocks.productionCheck.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    const exit = vi.fn();
    const starting = runWorker(exit);
    expect(mocks.productionCheck).toHaveBeenCalledOnce();
    expect(mocks.redisConstructor).not.toHaveBeenCalled();
    expect(mocks.workerConstructor).not.toHaveBeenCalled();
    release();
    const runtime = await starting;
    expect(mocks.workerConstructor).toHaveBeenCalledOnce();
    expect(mocks.productionCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redisConstructor.mock.invocationCallOrder[0]!,
    );
    await runtime!.stop();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
