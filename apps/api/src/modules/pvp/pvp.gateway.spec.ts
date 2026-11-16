import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PvpGateway } from './pvp.gateway';
import type { PvpSnapshotDto } from './pvp.dto';

it('batches tabs once and sends each student only their own answer', async () => {
  const state = (selected: string | null) =>
    ({
      matchId: 'match',
      status: 'RUNNING',
      question: { id: 'question', selectedOptionId: selected },
    }) as PvpSnapshotDto;
  const own = state('A'),
    peer = state(null);
  const snapshotViews = vi.fn().mockResolvedValue({
    creatorStudentId: 'one',
    views: new Map([
      ['one', own],
      ['two', peer],
    ]),
  });
  const engine = { snapshotViews, snapshot: vi.fn() };
  const gateway = new PvpGateway({ engine } as never, {} as never);
  const sockets = ['one', 'one', 'two'].map((id, i) => ({
    id: String(i),
    data: { matchId: 'match', studentId: id },
    emit: vi.fn(),
  }));
  gateway.server = { sockets: new Map(sockets.map((s) => [s.id, s])) } as never;
  const broadcast = gateway as unknown as {
    broadcast(id: string, creator: boolean): Promise<PvpSnapshotDto>;
  };
  expect(await broadcast.broadcast('match', true)).toBe(own);
  expect(snapshotViews).toHaveBeenCalledExactlyOnceWith('match', ['one', 'two'], true);
  for (const socket of sockets)
    expect(socket.emit.mock.calls[0]?.[1].payload).toBe(
      socket.data.studentId === 'one' ? own : peer,
    );
  snapshotViews.mockRejectedValueOnce(new Error('stale recipient'));
  engine.snapshot.mockImplementation(async (id: string) => {
    if (id === 'one') throw new Error('failed delivery');
    return peer;
  });
  await broadcast.broadcast('match', true);
  expect(sockets[2]!.emit.mock.calls).toHaveLength(4);
});

it('acknowledges committed room state before a stalled transient scheduler', async () => {
  const state = { matchId: randomUUID(), status: 'WAITING' };
  const service = {
    student: vi.fn().mockResolvedValue({ id: 'student' }),
    engine: { create: vi.fn().mockResolvedValue(state) },
  };
  const scheduler = { schedule: vi.fn(() => new Promise<void>(() => {})) };
  const gateway = new PvpGateway(service as never, scheduler as never);
  const broadcast = vi
    .spyOn(gateway as unknown as { broadcast: () => Promise<void> }, 'broadcast')
    .mockResolvedValue(undefined);
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
  expect(scheduler.schedule).toHaveBeenCalledWith(state.matchId, 'student', state);
  expect(broadcast).toHaveBeenCalledExactlyOnceWith(state.matchId);
});

it('routes match:start to the engine without starting the match locally', async () => {
  const state = { matchId: randomUUID(), status: 'RUNNING' };
  const engine = { create: vi.fn(), start: vi.fn().mockResolvedValue(state) };
  const scheduler = { schedule: vi.fn(() => new Promise<void>(() => {})) };
  const gateway = new PvpGateway(
    { student: vi.fn().mockResolvedValue({ id: 'host' }), engine } as never,
    scheduler as never,
  );
  const socket = {
    data: { authorization: 'Bearer TEST_ONLY', studentId: 'host' },
    emit: vi.fn(),
  };
  const ack = vi.fn();
  await gateway.start(
    socket as never,
    {
      event: 'match:start',
      eventVersion: '1',
      requestId: randomUUID(),
      sentAt: new Date().toISOString(),
      payload: { matchId: state.matchId },
    },
    ack,
  );
  expect(engine.start).toHaveBeenCalledWith('host', state.matchId);
  expect(ack).toHaveBeenCalledWith(
    expect.objectContaining({ payload: { ok: true, state, response: null } }),
  );
});
