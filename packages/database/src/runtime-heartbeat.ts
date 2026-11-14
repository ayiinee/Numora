import {
  metricsEnabled,
  runtimeInstanceId,
  runtimeMetricsText,
  runtimeNamespace,
  runtimeService,
} from './runtime-metrics.js';
import { gzipSync, gunzipSync } from 'node:zlib';

export interface MetricsRedis {
  set(key: string, value: string, expiry: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  scan(
    cursor: string,
    match: 'MATCH',
    pattern: string,
    count: 'COUNT',
    size: number,
  ): Promise<[string, string[]]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
}
async function bounded(operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('metrics deadline')), 1000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function startRuntimeHeartbeat(redis: MetricsRedis) {
  if (!metricsEnabled()) return async () => {};
  const key = `numora:metrics:${runtimeNamespace()}:${runtimeService()}:${runtimeInstanceId}`;
  let busy: Promise<unknown> | undefined;
  let stopping = false;
  const publish = () => {
    if (stopping || busy) return;
    busy = bounded(
      redis.set(
        key,
        JSON.stringify({
          service: runtimeService(),
          encoding: 'gzip',
          metrics: gzipSync(runtimeService() === 'worker' ? runtimeMetricsText() : '').toString(
            'base64',
          ),
        }),
        'EX',
        45,
      ),
    )
      .catch(() => {})
      .finally(() => {
        busy = undefined;
      });
  };
  publish();
  const timer = setInterval(publish, 15000);
  timer.unref();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await busy;
    await bounded(redis.del(key)).catch(() => {});
  };
}
/** Returns bounded reporting instances, not an inference from database pool connections. */
export async function reportingInstances(redis: MetricsRedis) {
  let cursor = '0';
  const keys = new Set<string>();
  let complete = false;
  for (let page = 0; page < 10; page++) {
    const result = await redis.scan(
      cursor,
      'MATCH',
      `numora:metrics:${runtimeNamespace()}:*`,
      'COUNT',
      100,
    );
    cursor = result[0];
    for (const key of result[1]) if (keys.size < 100) keys.add(key);
    if (cursor === '0') {
      complete = true;
      break;
    }
  }
  const values = keys.size ? await redis.mget(...keys) : [];
  const counts = { api: 0, worker: 0 };
  const metrics: string[] = [];
  for (const raw of values)
    try {
      if (!raw || Buffer.byteLength(raw) > 128 * 1024) continue;
      const value = JSON.parse(raw) as { service?: string; metrics?: string; encoding?: string };
      if (
        (value.service !== 'api' && value.service !== 'worker') ||
        typeof value.metrics !== 'string'
      )
        continue;
      const text =
        value.encoding === 'gzip'
          ? gunzipSync(Buffer.from(value.metrics, 'base64'), {
              maxOutputLength: 128 * 1024,
            }).toString('utf8')
          : value.metrics;
      // Only fixed metric names/numeric values emitted by this package; never return arbitrary Redis text.
      if (
        !text
          .split('\n')
          .every(
            (line) =>
              !line ||
              /^numora_[a-z_]+\{service="(?:api|worker)",instance="[a-f0-9-]+"(?:,le="(?:[0-9.]+|\+Inf)")?\} [-+0-9.eE]+$/.test(
                line,
              ),
          )
      )
        continue;
      counts[value.service]++;
      if (value.service === 'worker') metrics.push(text);
    } catch {
      /* Ignore malformed ephemeral records. */
    }
  return { counts, metrics: metrics.join('\n'), complete: complete && keys.size < 100 };
}
