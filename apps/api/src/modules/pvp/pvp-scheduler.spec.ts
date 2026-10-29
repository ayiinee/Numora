import { expect, it, vi } from 'vitest';
const rows = vi.hoisted(() => vi.fn());
vi.mock('@tka/database', () => ({
  getDatabase: () => ({ db: { select: () => ({ from: () => ({ where: rows }) }) } }),
  pvpMatches: { id: 'id', status: 'status' },
}));
import { PvpSchedulerService } from './pvp-scheduler.service';
import type { PvpEngineService } from './pvp-engine.service';
it('processes durable deadlines without Redis and restores readiness', async () => {
  rows.mockResolvedValue([{ id: 'match' }]);
  const engine = { tick: vi.fn().mockResolvedValue(undefined), setSchedulerReady: vi.fn() };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  const notify = vi.fn().mockResolvedValue(undefined);
  scheduler.notify = notify;
  await (scheduler as unknown as { sweep(): Promise<void> }).sweep();
  expect(engine.tick).toHaveBeenCalledWith('match');
  expect(notify).toHaveBeenCalledWith('match');
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
  rows.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);
  const engine = { tick: vi.fn().mockResolvedValue(undefined), setSchedulerReady: vi.fn() };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  scheduler.notify = vi
    .fn()
    .mockRejectedValueOnce(new Error('Socket unavailable'))
    .mockResolvedValue(undefined);
  await (scheduler as unknown as { sweep(): Promise<void> }).sweep();
  expect(engine.tick.mock.calls).toEqual([['first'], ['second']]);
  expect(engine.setSchedulerReady).toHaveBeenCalledWith(true);
});

it('does not report readiness when durable deadline processing fails', async () => {
  rows.mockResolvedValue([{ id: 'match' }]);
  const engine = {
    tick: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    setSchedulerReady: vi.fn(),
  };
  const scheduler = new PvpSchedulerService(engine as unknown as PvpEngineService, null);
  await expect((scheduler as unknown as { sweep(): Promise<void> }).sweep()).rejects.toThrow(
    'Database unavailable',
  );
  expect(engine.setSchedulerReady).not.toHaveBeenCalledWith(true);
});
