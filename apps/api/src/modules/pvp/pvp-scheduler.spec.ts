import { expect, it, vi } from 'vitest';
import { PvpSchedulerService } from './pvp-scheduler.service';
import type { PvpEngineService } from './pvp-engine.service';
it('processes durable deadlines without Redis and restores readiness', async () => {
  const engine = {
    sweepCandidates: vi.fn().mockResolvedValue([
      { id: 'match', due: true },
      { id: 'live', due: false },
    ]),
    tick: vi.fn().mockResolvedValue(undefined),
    setSchedulerReady: vi.fn(),
  };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  const notify = vi.fn().mockResolvedValue(undefined);
  scheduler.notify = notify;
  await (scheduler as unknown as { sweep(): Promise<void> }).sweep();
  expect(engine.tick).toHaveBeenCalledExactlyOnceWith('match');
  expect(notify.mock.calls).toEqual([['match'], ['live']]);
  expect(engine.setSchedulerReady).toHaveBeenCalledWith(true);
});
it('does not cancel a match when transient queue is absent', async () => {
  const engine = { cancelUnavailable: vi.fn(), setSchedulerReady: vi.fn() };
  const scheduler = new PvpSchedulerService(
    engine as unknown as PvpEngineService,
    { mode: 'demo' } as never,
  );
  await scheduler.schedule('match', 'student');
  expect(engine.cancelUnavailable).not.toHaveBeenCalled();
  expect(engine.setSchedulerReady).not.toHaveBeenCalledWith(false);
});

it('keeps processing other deadlines when a notification fails', async () => {
  const engine = {
    sweepCandidates: vi.fn().mockResolvedValue([
      { id: 'first', due: true },
      { id: 'second', due: true },
    ]),
    tick: vi.fn().mockResolvedValue(undefined),
    setSchedulerReady: vi.fn(),
  };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  scheduler.notify = vi
    .fn()
    .mockRejectedValueOnce(new Error('Socket unavailable'))
    .mockResolvedValue(undefined);
  await (scheduler as unknown as { sweep(): Promise<void> }).sweep();
  expect(engine.tick.mock.calls).toEqual([['first'], ['second']]);
  expect(engine.setSchedulerReady).toHaveBeenCalledWith(true);
});

it('keeps sweeping expired reconnects while a live snapshot is stalled', async () => {
  const live = Promise.withResolvers<void>();
  const engine = {
    sweepCandidates: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'live', due: false }])
      .mockResolvedValueOnce([{ id: 'expired', due: true }]),
    tick: vi.fn().mockResolvedValue(undefined),
    setSchedulerReady: vi.fn(),
  };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  scheduler.notify = vi.fn((id: string) => (id === 'live' ? live.promise : Promise.resolve()));
  const sweep = () => (scheduler as unknown as { sweep(): Promise<void> }).sweep();
  try {
    await sweep();
    expect(scheduler.notify).toHaveBeenCalledWith('live');
    await sweep();
    expect(engine.tick).toHaveBeenCalledExactlyOnceWith('expired');
    expect(scheduler.notify).toHaveBeenCalledWith('expired');
  } finally {
    live.resolve();
    await scheduler.onModuleDestroy();
  }
});

it('does not report readiness when durable deadline processing fails', async () => {
  const engine = {
    sweepCandidates: vi.fn().mockResolvedValue([{ id: 'match', due: true }]),
    tick: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    setSchedulerReady: vi.fn(),
  };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  await expect((scheduler as unknown as { sweep(): Promise<void> }).sweep()).rejects.toThrow(
    'Database unavailable',
  );
  expect(engine.setSchedulerReady).not.toHaveBeenCalledWith(true);
});
