import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { chapters, subchapters, levels, getDatabase } from '@tka/database';
import { and, asc, eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { cacheMetrics } from '../../observability/cache-metrics';

async function loadCurriculum() {
  const { db } = getDatabase();
  const [chapterRows, subRows, levelRows] = await Promise.all([
    db
      .select({
        id: chapters.id,
        slug: chapters.slug,
        name: chapters.name,
        displayOrder: chapters.displayOrder,
        materialCategory: chapters.materialCategory,
      })
      .from(chapters)
      .where(eq(chapters.status, 'READY'))
      .orderBy(asc(chapters.displayOrder)),
    db
      .select({
        id: subchapters.id,
        slug: subchapters.slug,
        chapterId: subchapters.chapterId,
        name: subchapters.name,
        displayOrder: subchapters.displayOrder,
      })
      .from(subchapters)
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(and(eq(subchapters.status, 'READY'), eq(chapters.status, 'READY')))
      .orderBy(asc(subchapters.displayOrder)),
    db
      .select({
        id: levels.id,
        subchapterId: levels.subchapterId,
        levelNumber: levels.levelNumber,
        description: levels.description,
      })
      .from(levels)
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .innerJoin(chapters, eq(chapters.id, subchapters.chapterId))
      .where(
        and(
          eq(levels.status, 'READY'),
          eq(subchapters.status, 'READY'),
          eq(chapters.status, 'READY'),
        ),
      )
      .orderBy(asc(levels.levelNumber)),
  ]);
  return { chapterRows, subRows, levelRows };
}
export type Curriculum = Awaited<ReturnType<typeof loadCurriculum>>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Contains shared READY metadata only. Authorization and personal state remain live. */
@Injectable()
export class CurriculumCache {
  readonly metrics = cacheMetrics('curriculum');
  private memory: { key: string; expires: number; value: string } | undefined;
  private readonly pending = new Map<string, Promise<Curriculum>>();
  private redis?: Redis;
  private connecting: Promise<Redis | undefined> | undefined;
  private readonly ttl = 60;
  private readonly maxBytes = 512 * 1024;

  private async revision() {
    const [row] = await getDatabase().client<{ revision: string }[]>`
      select revision from public.pvp_content_revision where singleton
    `;
    if (!row) throw new Error('Content revision unavailable');
    return row.revision;
  }

  private async connection() {
    const url = process.env.REDIS_URL;
    if (
      !url ||
      !process.env.BULLMQ_PREFIX ||
      (!url.startsWith('rediss://') &&
        !(process.env.NODE_ENV === 'test' && /^redis:\/\/(localhost|127\.0\.0\.1):/.test(url)))
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

  async get(): Promise<Curriculum> {
    let revision: string;
    try {
      revision = await this.revision();
    } catch {
      return loadCurriculum();
    }
    const project = digest(process.env.DATABASE_URL ?? '');
    const key = `${process.env.BULLMQ_PREFIX ?? 'local'}:curriculum:v1:${project}:${revision}`;
    if (this.memory?.key === key && this.memory.expires > Date.now()) {
      this.metrics.hits++;
      return JSON.parse(this.memory.value) as Curriculum;
    }
    const existing = this.pending.get(key);
    if (existing) {
      this.metrics.coalesced++;
      return structuredClone(await existing);
    }
    // Bound concurrent revisions too: a content storm must not create an unbounded map.
    if (this.pending.size >= 32) return loadCurriculum();
    const promise = this.readOrLoad(key, revision).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return structuredClone(await promise);
  }

  private async readOrLoad(key: string, revision: string): Promise<Curriculum> {
    const redis = await this.connection();
    if (redis) {
      try {
        const raw = await redis.get(key);
        if (raw && Buffer.byteLength(raw) <= this.maxBytes) {
          const envelope = JSON.parse(raw) as { value?: string; checksum?: string };
          if (typeof envelope.value === 'string' && envelope.checksum === digest(envelope.value)) {
            const value = JSON.parse(envelope.value) as Curriculum;
            if (
              Array.isArray(value.chapterRows) &&
              Array.isArray(value.subRows) &&
              Array.isArray(value.levelRows)
            ) {
              this.memory = { key, value: envelope.value, expires: Date.now() + this.ttl * 1000 };
              this.metrics.hits++;
              return value;
            }
          }
        }
      } catch {
        this.metrics.redisErrors++;
      }
    }
    this.metrics.misses++;
    this.metrics.refreshes++;
    const value = await loadCurriculum();
    // Never publish a mixture across concurrent commits under an older revision.
    if ((await this.revision()) !== revision) return loadCurriculum();
    const serialized = JSON.stringify(value);
    const envelope = JSON.stringify({ value: serialized, checksum: digest(serialized) });
    if (Buffer.byteLength(envelope) <= this.maxBytes) {
      this.memory = { key, value: serialized, expires: Date.now() + this.ttl * 1000 };
      if (redis)
        try {
          await redis.set(key, envelope, 'EX', this.ttl);
        } catch {
          this.metrics.redisErrors++;
        }
    }
    return value;
  }

  onModuleDestroy() {
    this.redis?.disconnect();
    this.memory = undefined;
  }
}
export const sharedCurriculumCache = new CurriculumCache();
