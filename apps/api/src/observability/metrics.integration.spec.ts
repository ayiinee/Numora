import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import postgres from 'postgres';
import {
  runtimeNamespace,
  startRuntimeHeartbeat,
  reportingInstances,
  setRuntimeService,
  closeDatabaseConnection,
  getDatabase,
} from '@tka/database';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { cacheMetrics, cacheMetricsText } from './cache-metrics';

afterEach(() => vi.unstubAllEnvs());
it('protects the real metrics HTTP route and hides it from disabled deployments', async () => {
  const text = vi.fn(async () => 'numora_fixture 1\n');
  const module = await Test.createTestingModule({
    controllers: [MetricsController],
    providers: [{ provide: MetricsService, useValue: { text } }],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()) + '/api/v1/internal/metrics';
  try {
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'false');
    expect((await fetch(url)).status).toBe(404);
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('METRICS_TOKEN', 'x'.repeat(32));
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    const result = await fetch(url, { headers: { authorization: `Bearer ${'x'.repeat(32)}` } });
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.text()).toBe('numora_fixture 1\n');
    expect(text).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
it('accumulates bounded cache events across replacement instances', () => {
  cacheMetrics('pvp').hits++;
  cacheMetrics('curriculum').misses++;
  expect(cacheMetricsText()).toContain('cache="pvp",result="hits"');
  expect(cacheMetricsText()).toContain('cache="curriculum",result="misses"');
});
describe.skipIf(!process.env.TEST_DATABASE_URL)('actual pool and database view probes', () => {
  it('reports actual current lock wait age without exporting SQL text or process IDs', async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw Error('localhost required');
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DB_POOL_MAX', '2');
    await closeDatabaseConnection();
    const owner = postgres(url, { max: 2, onnotice: () => {} }),
      key = Math.floor(Math.random() * 1000000000);
    let release!: () => void, acquired!: () => void;
    const gate = new Promise<void>((done) => {
        release = done;
      }),
      ready = new Promise<void>((done) => {
        acquired = done;
      });
    const service = new MetricsService();
    const first = owner.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${key})`;
      acquired();
      await gate;
    });
    await ready;
    const waiting = getDatabase().client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${key})`;
    });
    try {
      for (let i = 0; i < 50; i++) {
        const [row] =
          await owner`select count(*)::integer as n from pg_locks where not granted and locktype='advisory'`;
        if (row?.n) break;
        await new Promise((done) => setTimeout(done, 10));
      }
      await (service as unknown as { probe(): Promise<void> }).probe();
      const report = await service.text();
      expect(report).toMatch(/numora_db_lock_wait_age_seconds\{[^}]+\} 0\.[0-9]+/);
      expect(report).not.toContain('pg_advisory');
    } finally {
      release();
      await Promise.all([first, waiting]);
      await service.onModuleDestroy();
      await owner.end();
      await closeDatabaseConnection();
    }
  });
  it('exports probes and releases reservations that arrive after the deadline', async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw Error('localhost required');
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DB_POOL_MAX', '1');
    await closeDatabaseConnection();
    const service = new MetricsService();
    const probe = service as unknown as { probe(): Promise<void> };
    try {
      await probe.probe();
      expect(await service.text()).toContain('numora_db_probe_available 1');
      const held = await getDatabase().client.reserve();
      try {
        await probe.probe();
        expect(await service.text()).toContain('numora_db_probe_available 0');
      } finally {
        held.release();
      }
      await getDatabase().client`select 1`; // Late reservation must have released the only slot.
      await probe.probe();
      expect(await service.text()).toContain('numora_db_probe_available 1');
    } finally {
      await service.onModuleDestroy();
      await closeDatabaseConnection();
    }
  });
});
describe.skipIf(!process.env.TEST_REDIS_URL)('real Redis reporting registry', () => {
  it('isolates namespaces, ignores corrupt records and removes/ages ephemeral instances', async () => {
    const url = process.env.TEST_REDIS_URL!;
    if (!/^redis:\/\/(localhost|127\.0\.0\.1):/.test(url)) throw Error('localhost Redis required');
    vi.stubEnv('NUMORA_OBSERVABILITY_ENABLED', 'true');
    vi.stubEnv('BULLMQ_PREFIX', 'TEST-metrics-' + randomUUID());
    const redis = new Redis(url, { maxRetriesPerRequest: 0, commandTimeout: 500 });
    const base = `numora:metrics:${runtimeNamespace()}`;
    setRuntimeService('api');
    const stop = startRuntimeHeartbeat(redis);
    try {
      await redis.ping();
      await redis.set(
        `${base}:worker:fixture`,
        JSON.stringify({
          service: 'worker',
          metrics:
            'numora_test_count{service="worker",instance="00000000-0000-4000-8000-000000000001"} 2',
        }),
        'EX',
        1,
      );
      await redis.set(`${base}:worker:corrupt`, 'DO NOT EXPOSE TEST SECRET', 'EX', 1);
      await redis.set(
        'numora:metrics:OTHER:worker:fixture',
        JSON.stringify({ service: 'worker', metrics: '' }),
        'EX',
        1,
      );
      const result = await reportingInstances(redis);
      expect(result.counts).toEqual({ api: 1, worker: 1 });
      expect(result.complete).toBe(true);
      expect(result.metrics).not.toContain('SECRET');
      await new Promise((done) => setTimeout(done, 1100));
      expect((await reportingInstances(redis)).counts.worker).toBe(0);
      await stop();
      expect((await reportingInstances(redis)).counts.api).toBe(0);
    } finally {
      await stop();
      redis.disconnect();
    }
  });
});
