import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { Redis } from 'ioredis';
import {
  closeDatabaseConnection,
  getDatabase,
  leaderboardPeriod,
  leaderboardPeriods,
  pvpLeaderboardEntries,
  users,
} from '@tka/database';
import { eq } from 'drizzle-orm';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { LearningModule } from '../learning/learning.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { PvpModule } from './pvp.module';
import { PVP_POLICY } from './pvp.policy';
import { PvpEngineService } from './pvp-engine.service';
import { PvpSchedulerService } from './pvp-scheduler.service';
import { PvpSnapshotDto } from './pvp.dto';
import { pvpFixture } from './pvp.test-fixture';

const integration =
  process.env.TEST_DATABASE_URL && process.env.TEST_REDIS_URL ? describe : describe.skip;
integration('PvP Socket.IO and REST with isolated PostgreSQL/Redis, TEST ONLY policy', () => {
  let app: INestApplication;
  let url: string;
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  const sockets: Socket[] = [];
  let redis: Redis;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
    process.env.BULLMQ_PREFIX = `pvp-test-${randomUUID()}`;
    fixture = await pvpFixture();
    const identity = {
      me: async (header?: string) => {
        const n = /^Bearer fixture-(\d)$/.exec(header ?? '')?.[1];
        if (!n) {
          const { UnauthorizedException } = await import('@nestjs/common');
          throw new UnauthorizedException();
        }
        const student = fixture.students[Number(n)]!;
        return {
          id: student.id,
          role: student.role,
          status: 'ACTIVE',
          displayName: student.displayName,
        };
      },
    };
    const module = await Test.createTestingModule({
      imports: [PvpModule, LearningModule, LeaderboardsModule],
    })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .overrideProvider(PVP_POLICY)
      .useValue(fixture.policy)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    redis = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: 1 });
    await redis.ping();
  }, 30_000);
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    if (app) await app.close();
    redis?.disconnect();
    await closeDatabaseConnection();
  });
  async function connect(n: number) {
    const socket = io(`${url}/pvp`, {
      auth: { authorization: `Bearer fixture-${n}` },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const command = (socket: Socket, event: string, payload: unknown) =>
    socket
      .timeout(5000)
      .emitWithAck(event, {
        event,
        eventVersion: '1',
        requestId: randomUUID(),
        sentAt: new Date().toISOString(),
        payload,
      })
      .catch((error: Error) => {
        throw new Error(`${event}: ${error.message}`);
      });
  it('authenticates handshake, validates commands and returns personalized snapshots without keys', async () => {
    const invalid = io(`${url}/pvp`, {
      auth: { authorization: 'Bearer wrong' },
      reconnection: false,
    });
    sockets.push(invalid);
    const error = await new Promise<Error>((resolve) => invalid.once('connect_error', resolve));
    expect(error.message).toBe('PVP_AUTH_REQUIRED');
    const first = await connect(0);
    const second = await connect(1);
    const rejected = await command(first, 'room:create', { difficulty: 'easy', score: 999 });
    expect(rejected.payload).toMatchObject({
      ok: false,
      error: { code: 'PVP_PAYLOAD_INVALID', status: 400 },
    });
    const create = await command(first, 'room:create', { difficulty: 'easy' });
    expect(create.payload).toMatchObject({ ok: true });
    const room = create.payload.state as PvpSnapshotDto;
    expect((await command(second, 'room:join', { roomCode: room.roomCode })).payload.ok).toBe(true);
    await command(first, 'player:ready', { matchId: room.matchId });
    const started = await command(second, 'player:ready', { matchId: room.matchId });
    expect(started.payload.state.status).toBe('RUNNING');
    const q = started.payload.state.question.id;
    const saved = await command(first, 'answer:submit', {
      matchId: room.matchId,
      questionId: q,
      optionId: 'A',
    });
    expect(saved.payload.state.question.selectedOptionId).toBe('A');
    const peer = await app.get(PvpEngineService).snapshot(fixture.students[1]!.id, room.matchId);
    expect(peer.question?.selectedOptionId).toBeNull();
    expect(JSON.stringify(saved)).not.toMatch(/answerKey|correctOptionId|explanation|email/);
    const keys = await redis.keys(`pvp:${process.env.BULLMQ_PREFIX}:*`);
    expect(keys.length).toBeGreaterThan(0);
    await redis.del(...keys); // Erasing transient caches cannot erase the saved answer.
    expect(
      (await app.get(PvpEngineService).snapshot(fixture.students[0]!.id, room.matchId)).question
        ?.selectedOptionId,
    ).toBe('A');
    await command(first, 'room:leave', { matchId: room.matchId });
  }, 30_000);
  it('repairs missed timeout jobs from PostgreSQL and cancels safely when Redis is lost', async () => {
    const engine = app.get(PvpEngineService);
    const a = fixture.students[0]!.id;
    const b = fixture.students[1]!.id;
    let room = await engine.create(a, 'easy', randomUUID());
    await engine.join(b, room.roomCode);
    await engine.ready(a, room.matchId);
    room = await engine.ready(b, room.matchId);
    const clock = engine.now;
    Object.defineProperty(engine, 'now', {
      value: () => new Date(room.question!.deadlineAt),
      configurable: true,
    });
    await engine.tick(room.matchId);
    expect((await engine.snapshot(a, room.matchId)).question?.order).toBe(2);
    Object.defineProperty(engine, 'now', { value: clock, configurable: true });
    const scheduler = app.get(PvpSchedulerService);
    const connection = (scheduler as unknown as { redis: Redis }).redis;
    connection.disconnect();
    await scheduler.schedule(room.matchId, a);
    const cancelled = await engine.snapshot(a, room.matchId);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.recordEligible).toBe(false);
    expect(cancelled.endReason).toBe('SERVICE_INTERRUPTED');
  }, 30_000);
  it('enforces REST Student authorization, ownership, DTO validation and top10/own-rank privacy', async () => {
    const headers = { authorization: 'Bearer fixture-2' };
    const unauth = await fetch(`${url}/api/v1/students/me/dashboard`);
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('content-type')).toContain('application/problem+json');
    const denied = await fetch(`${url}/api/v1/leaderboards/class`, { headers });
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe('CLASS_REQUIRED');
    const bad = await fetch(`${url}/api/v1/leaderboards/pvp?difficulty=invalid`, { headers });
    expect(bad.status).toBe(400);
    const { db } = getDatabase();
    process.env.PVP_MODE = 'demo';
    const p = leaderboardPeriod(new Date());
    await db.insert(leaderboardPeriods).values(p).onConflictDoNothing();
    const [period] = await db
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.startsAt, p.startsAt));
    const peers = await db
      .insert(users)
      .values(
        Array.from({ length: 22 }, (_, i) => ({
          authUserId: randomUUID(),
          role: 'STUDENT' as const,
          displayName: `Ranking fixture ${i}`,
          email: `${randomUUID()}@example.test`,
        })),
      )
      .returning();
    await db.insert(pvpLeaderboardEntries).values(
      [...peers, fixture.students[2]!].map((s, i) => ({
        periodId: period!.id,
        studentId: s.id,
        difficulty: 'medium',
        dataMode: 'demo' as const,
        rank: i + 1,
        bestPoints: String(1500 - i),
        updatedAt: new Date(),
      })),
    );
    const response = await fetch(`${url}/api/v1/leaderboards/pvp?difficulty=medium`, { headers });
    const leaderboard = await response.json();
    expect(leaderboard.entries).toHaveLength(10);
    expect(leaderboard.ownEntry.rank).toBe(23);
    expect(
      leaderboard.entries.some(
        (e: { studentId: string }) => e.studentId === fixture.students[2]!.id,
      ),
    ).toBe(false);
    expect(JSON.stringify(leaderboard)).not.toMatch(/email|authUserId|matchId/);
    const room = await app
      .get(PvpEngineService)
      .create(fixture.students[0]!.id, 'easy', randomUUID());
    expect((await fetch(`${url}/api/v1/pvp/matches/${room.matchId}`, { headers })).status).toBe(
      403,
    );
    await app.get(PvpEngineService).leave(fixture.students[0]!.id, room.matchId);
  }, 30_000);
  it('keeps the default production module gated even with test environment and Redis configured', async () => {
    process.env.PVP_MODE = 'disabled';
    const module = await Test.createTestingModule({ imports: [PvpModule] })
      .overrideProvider(IdentityService)
      .useValue(app.get(IdentityService))
      .compile();
    const gated = module.createNestApplication({ logger: false });
    configureApplication(gated);
    await gated.listen(0, '127.0.0.1');
    const base = await gated.getUrl();
    const socket = io(`${base}/pvp`, {
      auth: { authorization: 'Bearer fixture-0' },
      transports: ['websocket'],
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      const availability = await fetch(`${base}/api/v1/pvp/availability`, {
        headers: { authorization: 'Bearer fixture-0' },
      });
      expect(await availability.json()).toMatchObject({
        available: false,
        reasonCode: 'PVP_POLICY_OPEN',
      });
      for (const [event, payload] of [
        ['room:create', { difficulty: 'easy' }],
        ['player:ready', { matchId: randomUUID() }],
        ['invitation:send', { matchId: randomUUID(), recipientStudentId: fixture.students[1]!.id }],
      ] as const) {
        expect((await command(socket, event, payload)).payload).toMatchObject({
          ok: false,
          error: { status: 409, code: 'PVP_POLICY_OPEN' },
        });
      }
    } finally {
      socket.disconnect();
      await gated.close();
    }
  }, 30_000);
});
