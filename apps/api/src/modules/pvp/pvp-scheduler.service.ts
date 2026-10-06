import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { getDatabase, pvpMatches } from '@tka/database';
import { eq, inArray } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { PVP_POLICY, type PvpPolicy } from './pvp.policy';

@Injectable()
export class PvpSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PvpSchedulerService.name);
  private redis?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private busy: Promise<void> | undefined;
  notify: (matchId: string) => Promise<void> = async () => {};
  constructor(
    private readonly engine: PvpEngineService,
    @Inject(PVP_POLICY) private readonly policy: PvpPolicy | null,
  ) {}
  async onModuleInit() {
    if (!this.policy) return;
    await this.engine.recoverAfterRestart();
    const url = process.env.REDIS_URL;
    if (
      !url ||
      (!url.startsWith('rediss://') &&
        !(process.env.NODE_ENV === 'test' && /^redis:\/\/(localhost|127\.0\.0\.1):/.test(url)))
    )
      throw new Error('PvP requires TLS Redis.');
    const prefix = process.env.BULLMQ_PREFIX;
    if (!prefix || prefix.includes('<')) throw new Error('PvP queue prefix is required.');
    this.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => {
      this.engine.setSchedulerReady(false);
      this.logger.warn('PvP cache connection unavailable.');
    });
    this.redis.on('close', () => this.engine.setSchedulerReady(false));
    this.redis.on('ready', () => {
      if (this.queue && this.worker) this.engine.setSchedulerReady(true);
    });
    try {
      await this.redis.connect();
      await this.redis.ping();
    } catch {
      this.logger.warn('PvP scheduler initialization failed; waiting for reconnection.');
    }
    this.queue = new Queue('pvp-deadlines', { connection: this.redis, prefix });
    this.queue.on('error', () => {
      this.engine.setSchedulerReady(false);
      this.logger.warn('PvP queue unavailable.');
    });
    this.worker = new Worker(
      'pvp-deadlines',
      async (job) => {
        await this.engine.tick(String(job.data.matchId));
        await this.reschedule(String(job.data.matchId));
        await this.notify(String(job.data.matchId));
      },
      { connection: this.redis, prefix },
    );
    this.worker.on('error', () => {
      this.engine.setSchedulerReady(false);
      this.logger.warn('PvP scheduler unavailable.');
    });
    this.engine.setSchedulerReady(this.redis.status === 'ready');
    // PostgreSQL sweep repairs missed transient jobs; Redis never owns match truth.
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = this.sweep()
        .catch(() => this.logger.error('PvP deadline sweep failed.'))
        .finally(() => {
          this.busy = undefined;
        });
    }, 1000);
  }
  private async sweep() {
    const matches = await getDatabase()
      .db.select({ id: pvpMatches.id })
      .from(pvpMatches)
      .where(inArray(pvpMatches.status, ['WAITING', 'READY', 'RUNNING']));
    for (const match of matches) {
      if (this.redis?.status !== 'ready') await this.engine.cancelUnavailable(match.id);
      else {
        await this.engine.tick(match.id);
        await this.reschedule(match.id);
      }
      await this.notify(match.id);
    }
  }
  private async reschedule(matchId: string) {
    const [match] = await getDatabase()
      .db.select({ creator: pvpMatches.creatorStudentId })
      .from(pvpMatches)
      .where(eq(pvpMatches.id, matchId));
    if (match) await this.schedule(matchId, match.creator);
  }
  async schedule(matchId: string, studentId: string) {
    if (!this.policy) return;
    try {
      if (!this.redis || this.redis.status !== 'ready' || !this.queue)
        throw new Error('Redis unavailable');
      const snapshot = await this.engine.snapshot(studentId, matchId);
      if (snapshot.status === 'FINISHED' || snapshot.status === 'CANCELLED') return;
      await this.bounded(
        this.redis.set(
          `pvp:${process.env.BULLMQ_PREFIX}:${matchId}:${studentId}`,
          JSON.stringify(snapshot),
          'EX',
          60,
        ),
      );
      const deadlines = [
        snapshot.status !== 'RUNNING' ? snapshot.expiresAt : null,
        snapshot.question?.deadlineAt,
        ...snapshot.players.map((p) =>
          p.reconnectDeadlineAt
            ? new Date(Date.parse(p.reconnectDeadlineAt) + 1).toISOString()
            : null,
        ),
      ].filter((x): x is string => !!x);
      for (const deadline of deadlines)
        await this.bounded(
          this.queue.add(
            'deadline',
            { matchId },
            {
              jobId: `${matchId}-${Date.parse(deadline)}`,
              delay: Math.max(0, Date.parse(deadline) - Date.now()),
              removeOnComplete: true,
              removeOnFail: 100,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            },
          ),
        );
    } catch {
      this.engine.setSchedulerReady(false);
      await this.engine.cancelUnavailable(matchId);
      await this.notify(matchId);
    }
  }
  private async bounded<T>(operation: Promise<T>) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('PvP Redis deadline exceeded')), 1500);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  async onModuleDestroy() {
    this.engine.setSchedulerReady(false);
    if (this.timer) clearInterval(this.timer);
    await this.busy;
    await this.worker?.close();
    await this.queue?.close();
    this.redis?.disconnect();
  }
}
