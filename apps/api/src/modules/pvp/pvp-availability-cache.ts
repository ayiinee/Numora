import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import { Redis } from 'ioredis';
import type { PvpDrillBank } from './pvp-drill-bank';
import type { Difficulty } from './pvp.policy';

/** Only validated content booleans are shared. A revision is checked on every request. */
export class PvpAvailabilityCache {
  private redis?: Redis;
  private connecting: Promise<Redis | undefined> | undefined;
  private readonly pending = new Map<string, Promise<boolean>>();
  private readonly ttlSeconds = 60;
  readonly metrics = { hits: 0, misses: 0, coalesced: 0, refreshes: 0, redisErrors: 0 };

  async revision() {
    const [row] = await getDatabase().client<{ revision: string }[]>`
      select revision from public.pvp_content_revision where singleton
    `;
    if (!row) throw new ServiceUnavailableException({ code: 'PVP_CONTENT_UNAVAILABLE' });
    return row.revision;
  }

  hasEnoughFamilies(bank: PvpDrillBank, difficulty: Difficulty, revision: string) {
    const project = createHash('sha256')
      .update(process.env.DATABASE_URL ?? '')
      .digest('hex');
    const pool = bank.contentMode === 'temporary-owner-accepted' ? 'shared' : difficulty;
    // Bump decoder-v1 when eligibility semantics change.
    const key = `${process.env.BULLMQ_PREFIX}:pvp-eligibility:decoder-v1:${project}:${bank.contentMode}:${pool}:${revision}`;
    const existing = this.pending.get(key);
    if (existing) {
      this.metrics.coalesced++;
      return existing;
    }
    const refresh = this.readOrLoad(key, () =>
      bank.hasEnoughFamilies(getDatabase().db, difficulty),
    ).finally(() => this.pending.delete(key));
    this.pending.set(key, refresh);
    return refresh;
  }

  private async connection(): Promise<Redis | undefined> {
    const url = process.env.REDIS_URL;
    if (!url || !process.env.BULLMQ_PREFIX) return;
    if (
      !url.startsWith('rediss://') &&
      !(process.env.NODE_ENV === 'test' && /^redis:\/\/(localhost|127\.0\.0\.1):/.test(url))
    )
      return;
    if (this.redis?.status === 'ready') return this.redis;
    if (this.connecting) return this.connecting;
    this.redis?.disconnect();
    const client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 250,
      commandTimeout: 250,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
    this.redis = client;
    this.connecting = client
      .connect()
      .then(() => client)
      .catch(() => {
        this.metrics.redisErrors++;
        client.disconnect();
        return undefined;
      })
      .finally(() => {
        this.connecting = undefined;
      });
    return this.connecting;
  }

  private async readOrLoad(key: string, load: () => Promise<boolean>) {
    const client = await this.connection();
    if (client) {
      try {
        const value = await client.get(key);
        if (value === 'true' || value === 'false') {
          this.metrics.hits++;
          return value === 'true';
        }
      } catch {
        this.metrics.redisErrors++;
      }
    }
    this.metrics.misses++;
    this.metrics.refreshes++;
    const available = await load();
    if (client) {
      try {
        await client.set(key, String(available), 'EX', this.ttlSeconds);
      } catch {
        this.metrics.redisErrors++;
      }
    }
    return available;
  }

  close() {
    this.redis?.disconnect();
  }
}
