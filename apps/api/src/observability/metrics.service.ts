import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  getDatabase,
  metricsEnabled,
  runtimeMetricsText,
  runtimeNamespace,
  startRuntimeHeartbeat,
  reportingInstances,
  gaugeRuntime,
  observeRuntime,
} from '@tka/database';
import { cacheMetricsText } from './cache-metrics';

@Injectable()
export class MetricsService {
  private redis: Redis | undefined;
  private stop: (() => Promise<void>) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy: Promise<void> | undefined;
  private connecting: Promise<void> | undefined;
  private probeAvailable = false;
  private connect() {
    const url = process.env.REDIS_URL;
    if (
      !url ||
      (!url.startsWith('rediss://') &&
        !(process.env.NODE_ENV === 'test' && /^redis:\/\/(localhost|127\.0\.0\.1):/.test(url)))
    )
      return;
    if (this.connecting || this.redis?.status === 'ready') return;
    void this.stop?.(); // Stop the old heartbeat timer before replacing a failed connection.
    this.stop = undefined;
    this.redis?.disconnect();
    const redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 250,
      commandTimeout: 250,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    this.redis = redis;
    this.connecting = redis
      .connect()
      .then(() => {
        this.stop = startRuntimeHeartbeat(redis);
      })
      .catch(() => {
        redis.disconnect();
      })
      .finally(() => {
        this.connecting = undefined;
      });
  }
  onModuleInit() {
    if (!metricsEnabled()) return;
    const tick = () => {
      if (this.busy) return;
      this.connect();
      this.busy = this.probe().finally(() => {
        this.busy = undefined;
      });
    };
    tick();
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
  }
  private async probe() {
    // reserve() measures actual acquisition. A timed-out reservation is released when it arrives.
    let expired = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const started = performance.now();
    try {
      const reservation = getDatabase()
        .client.reserve()
        .then((sql) => {
          if (expired) sql.release();
          return sql;
        });
      const reserved = await Promise.race([
        reservation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            expired = true;
            reject(new Error('probe timeout'));
          }, 500);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      observeRuntime('numora_db_pool_probe_seconds', (performance.now() - started) / 1000);
      try {
        // Scope to this project; runtime role may see redacted peer states. No SQL text or PIDs exported.
        const rows = await reserved<
          {
            waiting: number;
            blocked: number;
            visible: number;
            redacted: number;
            longest_lock_seconds: number;
          }[]
        >`
          select count(*) filter(where wait_event_type='Lock')::integer as waiting,
            count(*) filter(where cardinality(pg_blocking_pids(pid))>0)::integer as blocked,
            count(*) filter(where state is not null)::integer as visible,
            count(*) filter(where state is null)::integer as redacted,
            coalesce(max((select max(extract(epoch from clock_timestamp()-l.waitstart))::double precision
              from pg_locks l where l.pid=pg_stat_activity.pid and not l.granted)),0)::double precision as longest_lock_seconds
          from pg_stat_activity where datname=current_database() and application_name like ${`numora:${runtimeNamespace()}:%`}
        `;
        const row = rows[0]!;
        gaugeRuntime('numora_db_lock_waiting', row.waiting);
        gaugeRuntime('numora_db_blocked', row.blocked);
        gaugeRuntime('numora_db_sessions_visible', row.visible);
        gaugeRuntime('numora_db_sessions_redacted', row.redacted);
        gaugeRuntime('numora_db_lock_wait_age_seconds', row.longest_lock_seconds);
        this.probeAvailable = true;
      } finally {
        reserved.release();
      }
    } catch {
      this.probeAvailable = false;
      observeRuntime('numora_db_probe_errors', 1);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  async text() {
    let reported = 'numora_reporting_registry_available 0';
    if (this.redis?.status === 'ready')
      try {
        const result = await reportingInstances(this.redis);
        reported = `numora_reporting_registry_available 1\nnumora_reporting_registry_complete ${Number(result.complete)}\nnumora_reporting_instances{service="api"} ${result.counts.api}\nnumora_reporting_instances{service="worker"} ${result.counts.worker}\n${result.metrics}`;
      } catch {
        /* Local metrics remain available during Redis outages. */
      }
    return `${runtimeMetricsText()}\n${cacheMetricsText()}\nnumora_db_probe_available ${Number(this.probeAvailable)}\n${reported}\n`;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.busy;
    await this.connecting;
    await this.stop?.();
    this.redis?.disconnect();
  }
}
