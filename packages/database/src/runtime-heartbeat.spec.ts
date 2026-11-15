import { afterEach, expect, it, vi } from 'vitest';
import {
  startRuntimeHeartbeat,
  reportingInstances,
  type MetricsRedis,
} from './runtime-heartbeat.js';
import { observeRuntime, runtimeMetricsText, setRuntimeService } from './runtime-metrics.js';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it('bounds stalled heartbeat shutdown and validates real histogram records', async () => {
  vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
  vi.useFakeTimers();
  const redis = {
    set: vi.fn(() => new Promise(() => {})),
    del: vi.fn(async () => 0),
  } as unknown as MetricsRedis;
  const stop = startRuntimeHeartbeat(redis);
  const stopped = stop();
  await vi.advanceTimersByTimeAsync(1000);
  await stopped;
  expect(redis.del).toHaveBeenCalledOnce();
  setRuntimeService('worker');
  observeRuntime('numora_test_seconds', 0.05);
  const report = runtimeMetricsText();
  expect(report).toContain('le="+Inf"');
  const readable = {
    scan: vi.fn(async () => ['0', ['own']]),
    mget: vi.fn(async () => [JSON.stringify({ service: 'worker', metrics: report })]),
  } as unknown as MetricsRedis;
  expect((await reportingInstances(readable)).counts.worker).toBe(1);
  setRuntimeService('api');
});
