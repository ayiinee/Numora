import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: { connect: vi.fn(), ping: vi.fn(), disconnect: vi.fn(), on: vi.fn() },
  worker: { close: vi.fn(), waitUntilReady: vi.fn(), run: vi.fn(), on: vi.fn() },
  redisConstructor: vi.fn(),
  workerConstructor: vi.fn(),
  checkDatabase: vi.fn(),
  closeDatabase: vi.fn(),
  outbox: vi.fn(),
  status: vi.fn(),
  recover: vi.fn(),
  project: vi.fn(),
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
vi.mock('@tka/database', () => ({
  checkDatabaseConnection: mocks.checkDatabase,
  closeDatabaseConnection: mocks.closeDatabase,
}));
vi.mock('./tryout-recovery.js', () => ({ recoverOverdueTryouts: mocks.recover }));
vi.mock('./outbox.js', () => ({ drainOutboxBatch: mocks.outbox, outboxStatus: mocks.status }));
vi.mock('./class-leaderboard.js', () => ({ projectClassLeaderboard: mocks.project }));
import { runWorker } from './worker-runtime.js';

describe('worker Redis outage lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv('REDIS_URL', 'rediss://fixture-secret@redis.invalid:6379');
    vi.stubEnv('BULLMQ_PREFIX', 'numora:dev:fixture');
    mocks.workerHandlers.clear();
    mocks.redisHandlers.clear();
    mocks.redis.on.mockImplementation((event, handler) => mocks.redisHandlers.set(event, handler));
    mocks.worker.on.mockImplementation((event, handler) =>
      mocks.workerHandlers.set(event, handler),
    );
    mocks.redis.connect.mockResolvedValue(undefined);
    mocks.redis.ping.mockResolvedValue('PONG');
    mocks.worker.waitUntilReady.mockResolvedValue(undefined);
    mocks.worker.run.mockImplementation(() => new Promise(() => {}));
    mocks.worker.close.mockResolvedValue(undefined);
    mocks.checkDatabase.mockResolvedValue(undefined);
    mocks.closeDatabase.mockResolvedValue(undefined);
    mocks.status.mockResolvedValue({ pending: 0, failed: 0, retryReady: 0, coolingDown: 0 });
    mocks.outbox.mockResolvedValue({ processed: 0, failed: 0 });
    mocks.project.mockResolvedValue({});
    mocks.recover.mockResolvedValue({ finalized: 0, failed: 0, backlog: 0 });
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
});
