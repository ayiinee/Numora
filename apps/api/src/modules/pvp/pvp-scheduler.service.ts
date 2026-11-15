import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getDatabase,
  pvpMatches,
  measureRuntime,
  observeRuntime,
  gaugeRuntime,
} from '@tka/database';
import { eq } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { PVP_POLICY, type PvpPolicy } from './pvp.policy';
import type { PvpSnapshotDto } from './pvp.dto';

@Injectable()
export class PvpSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PvpSchedulerService.name);
  private redis?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setInterval>;
  private busy: Promise<void> | undefined;
  private liveSync: Promise<void> | undefined;
  private readonly deadlineRefreshes = new Set<Promise<void>>();
  private stopping = false;
  notify: (matchId: string, includeCreator?: boolean) => Promise<PvpSnapshotDto | void> =
    async () => {};
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
      this.logger.warn('PvP cache connection unavailable.');
    });
    this.redis.on('close', () =>
      this.logger.warn('PvP Redis disconnected; PostgreSQL scheduler remains active.'),
    );
    try {
      await this.redis.connect();
      await this.redis.ping();
    } catch {
      this.logger.warn('PvP scheduler initialization failed; waiting for reconnection.');
    }
    this.queue = new Queue('pvp-deadlines', { connection: this.redis, prefix });
    this.queue.on('error', () => {
      this.logger.warn('PvP queue unavailable.');
    });
    this.worker = new Worker(
      'pvp-deadlines',
      async (job) => {
        await this.engine.tick(String(job.data.matchId));
        await this.refresh(String(job.data.matchId));
      },
      { connection: this.redis, prefix },
    );
    this.worker.on('error', () => {
      this.logger.warn('PvP scheduler unavailable.');
    });
    await this.sweep().catch(() => {
      this.engine.setSchedulerReady(false);
      this.logger.error('PvP PostgreSQL deadline sweep failed.');
    });
    // PostgreSQL sweep repairs missed transient jobs; Redis never owns match truth.
    this.timer = setInterval(() => {
      if (this.busy) {
        observeRuntime('numora_pvp_sweep_overlap', 1);
        return;
      }
      this.busy = measureRuntime('numora_pvp_sweep', () => this.sweep())
        .catch(() => {
          this.engine.setSchedulerReady(false);
          this.logger.error('PvP PostgreSQL deadline sweep failed.');
        })
        .finally(() => {
          this.busy = undefined;
        });
    }, 1000);
  }
  private async sweep() {
    const matches = await this.engine.sweepCandidates();
    gaugeRuntime('numora_pvp_active_matches', matches.length);
    for (const match of matches) {
      if (!match.due) continue;
      await this.engine.tick(match.id);
      const refresh = this.refresh(match.id)
        .catch(() => this.logger.warn('PvP deadline notification delayed; durable state retained.'))
        .finally(() => this.deadlineRefreshes.delete(refresh));
      this.deadlineRefreshes.add(refresh);
    }
    this.engine.setSchedulerReady(true);
    // A slow client snapshot cannot postpone a later PostgreSQL deadline sweep.
    if (!this.liveSync && !this.stopping) {
      this.liveSync = this.syncLiveMatches(matches.filter((match) => !match.due)).finally(() => {
        this.liveSync = undefined;
      });
    }
  }

  private async syncLiveMatches(matches: readonly { id: string }[]) {
    for (const { id } of matches) {
      if (this.stopping) return;
      // Another API process may have handled the last command.
      try {
        await this.notify(id);
      } catch {
        this.logger.warn('PvP room notification delayed; durable state retained.');
      }
    }
  }

  private async refresh(matchId: string) {
    const caching = this.redis?.status === 'ready';
    let prepared: PvpSnapshotDto | void = undefined;
    try {
      prepared = caching ? await this.notify(matchId, true) : await this.notify(matchId);
    } catch {
      this.logger.warn('PvP deadline notification delayed; durable state retained.');
    }
    if (caching) {
      if (prepared) await this.schedule(matchId, prepared.creatorStudentId, prepared);
      else await this.reschedule(matchId);
    }
  }
  private async reschedule(matchId: string) {
    const [match] = await getDatabase()
      .db.select({ creator: pvpMatches.creatorStudentId })
      .from(pvpMatches)
      .where(eq(pvpMatches.id, matchId));
    if (match) await this.schedule(matchId, match.creator);
  }
  async schedule(matchId: string, studentId: string, prepared?: PvpSnapshotDto | null) {
    if (!this.policy) return;
    try {
      if (!this.redis || this.redis.status !== 'ready' || !this.queue) return;
      const snapshot = prepared ?? (await this.engine.snapshot(studentId, matchId));
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
      // PostgreSQL sweep remains authoritative when the transient queue fails.
      this.logger.warn('PvP queue scheduling failed; PostgreSQL deadline sweep remains active.');
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
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.busy;
    this.engine.setSchedulerReady(false);
    await Promise.all([this.liveSync, ...this.deadlineRefreshes]);
    await this.worker?.close();
    await this.queue?.close();
    this.redis?.disconnect();
  }
}
