import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  analyticsOutbox,
  closeDatabaseConnection,
  getDatabase,
  pvpAnswers,
  pvpMatches,
  pvpMatchQuestions,
  pvpPlayers,
  xpLedger,
} from '@tka/database';
import { and, eq } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { pvpFixture } from './pvp.test-fixture';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('PvP PostgreSQL engine with TEST ONLY policy', () => {
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  let engine: PvpEngineService;
  let now: Date;
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    fixture = await pvpFixture();
    engine = new PvpEngineService(fixture.policy);
    now = new Date();
    vi.spyOn(engine, 'now').mockImplementation(() => now);
  });
  afterAll(async () => closeDatabaseConnection());
  const s = (index: number) => fixture.students[index]!.id;
  async function start() {
    const room = await engine.create(s(0), 'easy', randomUUID());
    await engine.join(s(1), room.roomCode);
    await engine.ready(s(0), room.matchId);
    return engine.ready(s(1), room.matchId);
  }
  it('serializes concurrent join and create retries, permits Mandiri, and enforces ownership', async () => {
    const key = randomUUID();
    const created = await Promise.all([
      engine.create(s(0), 'easy', key),
      engine.create(s(0), 'easy', key),
    ]);
    expect(created[0]!.matchId).toBe(created[1]!.matchId);
    const room = created[0]!;
    const joined = await Promise.allSettled([
      engine.join(s(1), room.roomCode),
      engine.join(s(2), room.roomCode),
    ]);
    expect(joined.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const snapshot = await engine.snapshot(s(0), room.matchId);
    expect(snapshot.players).toHaveLength(2);
    const rejected = joined[0]!.status === 'rejected' ? s(1) : s(2);
    await expect(engine.snapshot(rejected, room.matchId)).rejects.toMatchObject({ status: 403 });
    expect(JSON.stringify(snapshot)).not.toMatch(/answerKey|correctOptionId|explanation|email/);
    await engine.leave(s(0), room.matchId);
  });
  it('keeps answers immutable, rejects late answers, and advances only from server state', async () => {
    const match = await start();
    const question = match.question!;
    const same = randomUUID();
    await Promise.all([
      engine.answer(s(0), match.matchId, question.id, 'A', same),
      engine.answer(s(0), match.matchId, question.id, 'A', same),
    ]);
    await engine.answer(s(0), match.matchId, question.id, 'B', same);
    const own = await engine.snapshot(s(0), match.matchId);
    expect(own.question!.answered).toBe(true);
    expect(own.question!.selectedOptionId).toBe('A');
    const rows = await getDatabase()
      .db.select()
      .from(pvpAnswers)
      .where(eq(pvpAnswers.matchQuestionId, question.id));
    expect(rows).toHaveLength(1);
    now = new Date(question.deadlineAt);
    await expect(
      engine.answer(s(1), match.matchId, question.id, 'A', randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'ANSWER_TOO_LATE' } });
    await Promise.all([engine.tick(match.matchId), engine.tick(match.matchId)]);
    const advanced = await engine.snapshot(s(0), match.matchId);
    expect(advanced.question!.order).toBe(2);
    expect(advanced.players[0]!.points).toBe(150);
    expect(advanced.players[1]!.points).toBe(0);
    await engine.answer(s(0), match.matchId, question.id, 'B', same);
    await engine.leave(s(0), match.matchId);
    expect((await engine.snapshot(s(1), match.matchId)).recordEligible).toBe(false);
  });
  it('finalizes ten questions once with atomic outbox and pinned content, without class XP', async () => {
    let match = await start();
    for (let order = 1; order <= 10; order++) {
      const q = match.question!;
      expect(q.order).toBe(order);
      await Promise.all([
        engine.answer(s(0), match.matchId, q.id, 'A', randomUUID()),
        engine.answer(s(1), match.matchId, q.id, 'B', randomUUID()),
      ]);
      match = await engine.snapshot(s(0), match.matchId);
    }
    await Promise.all([engine.tick(match.matchId), engine.tick(match.matchId)]);
    expect(match.status).toBe('FINISHED');
    expect(match.recordEligible).toBe(true);
    expect(match.players.map((p) => [p.points, p.result])).toEqual([
      [1500, 'WIN'],
      [0, 'LOSS'],
    ]);
    const { db } = getDatabase();
    expect(
      await db
        .select()
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.entityId, match.matchId),
            eq(analyticsOutbox.eventName, 'pvp_match_completed'),
          ),
        ),
    ).toHaveLength(1);
    const questions = await db
      .select()
      .from(pvpMatchQuestions)
      .where(eq(pvpMatchQuestions.matchId, match.matchId));
    expect(questions.every((q) => !!q.questionVersionId)).toBe(true);
    expect(
      await db
        .select()
        .from(xpLedger)
        .where(eq(xpLedger.studentId, s(0))),
    ).toHaveLength(0);
  });
  it('handles reconnect at 20 seconds, dual disconnect and restart without leaderboard records', async () => {
    const match = await start();
    await engine.disconnect(s(0), match.matchId);
    now = new Date(now.getTime() + 19_999);
    expect((await engine.reconnect(s(0), match.matchId)).players[0]!.connectionStatus).toBe(
      'CONNECTED',
    );
    await engine.disconnect(s(0), match.matchId);
    now = new Date(now.getTime() + 20_001);
    await engine.tick(match.matchId);
    const forfeited = await engine.snapshot(s(0), match.matchId);
    expect(forfeited.endReason).toBe('FORFEIT');
    expect(forfeited.recordEligible).toBe(false);
    const both = await start();
    await engine.disconnect(s(0), both.matchId);
    await engine.disconnect(s(1), both.matchId);
    now = new Date(now.getTime() + 20_001);
    await engine.tick(both.matchId);
    expect((await engine.snapshot(s(0), both.matchId)).status).toBe('CANCELLED');
    const interrupted = await start();
    await engine.recoverAfterRestart();
    const cancelled = await engine.snapshot(s(0), interrupted.matchId);
    expect(cancelled.endReason).toBe('SERVER_RESTARTED');
    expect(cancelled.recordEligible).toBe(false);
    expect(cancelled.players.every((p) => p.result !== 'WIN')).toBe(true);
    expect(
      (
        await getDatabase()
          .db.select()
          .from(pvpMatches)
          .where(eq(pvpMatches.id, interrupted.matchId))
      )[0]!.scoringPolicyVersionId,
    ).toBe(fixture.policy.policyVersionId);
  });
  it('limits invitations to current classmates and expires fixture invitations', async () => {
    const room = await engine.create(s(0), 'easy', randomUUID());
    await expect(engine.invite(s(0), room.matchId, s(2))).rejects.toMatchObject({ status: 403 });
    const invite = await engine.invite(s(0), room.matchId, s(1));
    expect((await engine.invite(s(0), room.matchId, s(1))).inviteId).toBe(invite.inviteId);
    now = new Date(now.getTime() + 60_000);
    await expect(engine.respondInvite(s(1), invite.inviteId, true)).rejects.toMatchObject({
      response: { code: 'INVITE_CLOSED' },
    });
    const retry = await engine.invite(s(0), room.matchId, s(1));
    expect((await engine.respondInvite(s(1), retry.inviteId, true))!.players).toHaveLength(2);
    await engine.leave(s(0), room.matchId);
  });
  it('retains host room and guest history, resets Ready, permits replacement and enforces one active room', async () => {
    const room = await engine.create(s(0), 'easy', randomUUID());
    await expect(engine.create(s(0), 'easy', randomUUID())).rejects.toMatchObject({
      response: { code: 'PVP_ACTIVE_ROOM_EXISTS' },
    });
    await engine.join(s(1), room.roomCode);
    await engine.ready(s(0), room.matchId);
    const leaveKey = randomUUID();
    await engine.leave(s(1), room.matchId, leaveKey);
    await engine.leave(s(1), room.matchId, leaveKey);
    const waiting = await engine.snapshot(s(0), room.matchId);
    expect(waiting.status).toBe('WAITING');
    expect(waiting.players).toHaveLength(1);
    expect(waiting.players[0]!.ready).toBe(false);
    expect(waiting.expiresAt).toBe(room.expiresAt);
    expect((await engine.snapshot(s(1), room.matchId)).participantActive).toBe(false);
    await engine.join(s(1), room.roomCode);
    await engine.leave(s(1), room.matchId, leaveKey); // Delayed retry must not evict the new participation.
    expect((await engine.snapshot(s(1), room.matchId)).participantActive).toBe(true);
    await expect(engine.create(s(1), 'easy', randomUUID())).rejects.toMatchObject({
      response: { code: 'PVP_ACTIVE_ROOM_EXISTS' },
    });
    const history = await getDatabase()
      .db.select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, room.matchId), eq(pvpPlayers.studentId, s(1))));
    expect(history).toHaveLength(2);
    expect(history.filter((p) => p.leftAt)).toHaveLength(1);
    await engine.leave(s(0), room.matchId);
    expect(await engine.activeRoom(s(0))).toBeNull();
    expect(await engine.activeRoom(s(1))).toBeNull();
  });
  it('reconnects at exactly 20 seconds and preserves terminal state; earliest expired deadline loses regardless of slot', async () => {
    const approved = new PvpEngineService({
      ...fixture.policy,
      simultaneousDisconnect: 'earliest-deadline-or-cancel',
    });
    vi.spyOn(approved, 'now').mockImplementation(() => now);
    const room = await approved.create(s(0), 'easy', randomUUID());
    await approved.join(s(1), room.roomCode);
    await approved.ready(s(0), room.matchId);
    await approved.ready(s(1), room.matchId);
    await approved.disconnect(s(1), room.matchId);
    now = new Date(now.getTime() + 20_000);
    expect((await approved.reconnect(s(1), room.matchId)).players[1]!.connectionStatus).toBe(
      'CONNECTED',
    );
    await approved.disconnect(s(1), room.matchId);
    now = new Date(now.getTime() + 1_000);
    await approved.disconnect(s(0), room.matchId);
    now = new Date(now.getTime() + 21_000);
    await approved.tick(room.matchId);
    const final = await approved.snapshot(s(0), room.matchId);
    expect(final.endReason).toBe('FORFEIT');
    expect(final.players.map((p) => p.result)).toEqual(['WIN', 'FORFEIT']);
    expect(final.recordEligible).toBe(false);
    expect(await approved.reconnect(s(1), room.matchId)).toMatchObject({
      status: final.status,
      players: final.players,
    });
    const tied = await approved.create(s(0), 'easy', randomUUID());
    await approved.join(s(1), tied.roomCode);
    await approved.ready(s(0), tied.matchId);
    await approved.ready(s(1), tied.matchId);
    await approved.disconnect(s(0), tied.matchId);
    await approved.disconnect(s(1), tied.matchId);
    now = new Date(now.getTime() + 20_001);
    await approved.tick(tied.matchId);
    expect(await approved.snapshot(s(0), tied.matchId)).toMatchObject({
      status: 'CANCELLED',
      recordEligible: false,
    });
  });
  it('releases a disconnected waiting guest at grace expiry but cancels an expired host', async () => {
    const room = await engine.create(s(0), 'easy', randomUUID());
    await engine.join(s(1), room.roomCode);
    await engine.disconnect(s(1), room.matchId);
    now = new Date(now.getTime() + 20_001);
    await engine.tick(room.matchId);
    expect((await engine.snapshot(s(0), room.matchId)).players).toHaveLength(1);
    expect(await engine.activeRoom(s(1))).toBeNull();
    await engine.join(s(2), room.roomCode);
    await engine.disconnect(s(0), room.matchId);
    now = new Date(now.getTime() + 20_001);
    await engine.tick(room.matchId);
    expect((await engine.snapshot(s(0), room.matchId)).endReason).toBe('HOST_RECONNECT_EXPIRED');
  });
});
