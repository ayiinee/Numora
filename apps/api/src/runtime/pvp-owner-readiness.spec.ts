import { EventEmitter } from 'node:events';
import type { MessagePort } from 'node:worker_threads';
import { expect, it, vi } from 'vitest';
import { PvpOwnerReadiness } from './pvp-owner-readiness';

class TestPort extends EventEmitter {
  queries: { type: string; requestId: string }[] = [];
  postMessage(value: { type: string; requestId: string }) {
    this.queries.push(value);
  }
}
it('keeps concurrent readiness requests separate and never sends authorization or user state', async () => {
  const port = new TestPort();
  const client = new PvpOwnerReadiness(port as unknown as MessagePort);
  const one = client.ready(),
    two = client.ready();
  expect(port.queries).toHaveLength(2);
  expect(Object.keys(port.queries[0]!)).toEqual(['type', 'requestId']);
  port.emit('message', {
    type: 'pvp-readiness-result',
    requestId: port.queries[1]!.requestId,
    ready: false,
  });
  port.emit('message', {
    type: 'pvp-readiness-result',
    requestId: port.queries[0]!.requestId,
    ready: true,
  });
  expect(await one).toBe(true);
  expect(await two).toBe(false);
});
it('fails closed on missing coordinator, timeout and closed channel', async () => {
  expect(await new PvpOwnerReadiness(null).ready()).toBe(false);
  vi.useFakeTimers();
  try {
    const port = new TestPort(),
      client = new PvpOwnerReadiness(port as unknown as MessagePort);
    const timeout = client.ready();
    await vi.advanceTimersByTimeAsync(250);
    expect(await timeout).toBe(false);
    const closed = client.ready();
    port.emit('close');
    expect(await closed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
