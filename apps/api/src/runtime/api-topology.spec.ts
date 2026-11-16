import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Worker } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { startApiTopology } from './api-topology';

class TestWorker extends EventEmitter {
  exited = false;
  readonly replies: unknown[] = [];
  constructor(readonly environment: NodeJS.ProcessEnv) {
    super();
    queueMicrotask(() => this.emit('message', { ready: true }));
  }
  postMessage(value: unknown) {
    this.replies.push(value);
    if (value === 'shutdown') void this.terminate();
  }
  async terminate() {
    if (!this.exited) {
      this.exited = true;
      this.emit('exit', 0);
    }
    return 0;
  }
}
afterEach(() => vi.unstubAllEnvs());
it.each([0, 2])('stops the runtime and reports unavailable when worker %i fails', async (index) => {
  vi.stubEnv('DB_POOL_MAX', '16');
  vi.stubEnv('API_BIND_HOST', '127.0.0.1');
  const probe = createServer();
  const port = await new Promise<number>((done) =>
    probe.listen(0, '127.0.0.1', () => done((probe.address() as AddressInfo).port)),
  );
  await new Promise<void>((done) => probe.close(() => done()));
  const workers: TestWorker[] = [];
  let failed!: () => void;
  const failure = new Promise<void>((done) => (failed = done));
  const runtime = await startApiTopology(port, 2, failed, (env) => {
    const worker = new TestWorker(env);
    workers.push(worker);
    return worker as unknown as Worker;
  });
  expect(workers.map((worker) => worker.environment.NUMORA_API_ROLE)).toEqual([
    'http',
    'http',
    'pvp',
  ]);
  expect(workers.reduce((total, worker) => total + Number(worker.environment.DB_POOL_MAX), 0)).toBe(
    16,
  );
  workers[0]!.emit('message', { type: 'pvp-readiness-query', requestId: 'TEST_ONLY-before' });
  expect(workers[0]!.replies.at(-1)).toEqual({
    type: 'pvp-readiness-result',
    requestId: 'TEST_ONLY-before',
    ready: true,
  });
  workers[index]!.emit('error', new Error('TEST_ONLY worker unavailable'));
  workers[0]!.emit('message', { type: 'pvp-readiness-query', requestId: 'TEST_ONLY-after' });
  expect(workers[0]!.replies.at(-1)).toEqual({
    type: 'pvp-readiness-result',
    requestId: 'TEST_ONLY-after',
    ready: false,
  });
  await failure;
  await runtime.close();
  expect(workers.every((worker) => worker.exited)).toBe(true);
  await new Promise<void>((done, reject) =>
    probe.once('error', reject).listen(port, '127.0.0.1', done),
  );
  await new Promise<void>((done) => probe.close(() => done()));
});
