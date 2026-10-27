import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PvpGateway } from './pvp.gateway';

it('acknowledges committed room state before a stalled transient scheduler', async () => {
  const state = { matchId: randomUUID(), status: 'WAITING' };
  const service = {
    student: vi.fn().mockResolvedValue({ id: 'student' }),
    engine: { create: vi.fn().mockResolvedValue(state) },
  };
  const scheduler = { schedule: vi.fn(() => new Promise<void>(() => {})) };
  const gateway = new PvpGateway(service as never, scheduler as never);
  const socket = {
    data: { authorization: 'Bearer TEST_ONLY', studentId: 'student' },
    emit: vi.fn(),
  };
  const ack = vi.fn();
  const requestId = randomUUID();
  await gateway.create(
    socket as never,
    {
      event: 'room:create',
      eventVersion: '1',
      requestId,
      sentAt: new Date().toISOString(),
      payload: { difficulty: 'easy' },
    },
    ack,
  );
  expect(ack).toHaveBeenCalledWith(
    expect.objectContaining({ requestId, payload: { ok: true, state, response: null } }),
  );
  expect(scheduler.schedule).not.toHaveBeenCalled();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(scheduler.schedule).toHaveBeenCalledWith(state.matchId, 'student');
});
