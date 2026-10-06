import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  analyticsOutbox,
  assessmentPackages,
  classMemberships,
  getDatabase,
  enqueueNotification,
  packageItems,
  pvpAnswers,
  pvpInvites,
  pvpMatches,
  pvpMatchQuestions,
  pvpPlayers,
  pvpActiveRooms,
  questionVersions,
  questions,
  questionVariants,
  classes,
  scoringPolicyVersions,
  users,
} from '@tka/database';
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { decodeSingleChoice } from '../learning/single-choice.policy';
import {
  PVP_POLICY,
  durationSeconds,
  pvpPoints,
  requirePvpPolicy,
  type Difficulty,
  type PvpPolicy,
} from './pvp.policy';
import type { PvpSnapshotDto } from './pvp.dto';

type Database = ReturnType<typeof getDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Match = typeof pvpMatches.$inferSelect;
const failure = (code: string, detail: string) => new ConflictException({ code, detail });

@Injectable()
export class PvpEngineService {
  /** Injectable clock is supplied directly by fixture tests, never from a request. */
  readonly now: () => Date = () => new Date();
  private schedulerReady = false;
  constructor(@Inject(PVP_POLICY) private readonly policy: PvpPolicy | null) {}

  setSchedulerReady(ready: boolean) {
    this.schedulerReady = ready;
  }
  get dataMode() {
    return this.policy ? (this.policy.mode ?? 'demo') : 'official';
  }
  private get transportReady() {
    return this.policy?.mode === undefined || this.schedulerReady;
  }
  private get newRoomsEnabled() {
    return process.env.PVP_NEW_MATCHES_ENABLED !== 'false';
  }
  async availability(studentId?: string) {
    const difficulties = await Promise.all(
      (['easy', 'medium', 'hard'] as const).map(async (difficulty) => {
        let reasonCode: string | null = !this.policy
          ? 'PVP_POLICY_OPEN'
          : !this.newRoomsEnabled
            ? 'PVP_NEW_MATCHES_DISABLED'
            : !this.transportReady
              ? 'PVP_SCHEDULER_UNAVAILABLE'
              : null;
        if (!reasonCode) {
          try {
            await this.selectPackage(getDatabase().db, difficulty);
          } catch (error) {
            if (!(
              error instanceof ConflictException || error instanceof ServiceUnavailableException
            ))
              throw error;
            reasonCode =
              (error.getResponse() as { code?: string }).code ?? 'PVP_CONTENT_UNAVAILABLE';
          }
        }
        return { difficulty, available: reasonCode === null, reasonCode };
      }),
    );
    const available = difficulties.some((d) => d.available);
    return {
      available,
      reasonCode: available ? null : difficulties[0]!.reasonCode,
      message: available
        ? this.dataMode === 'demo'
          ? 'PvP DEMO tersedia.'
          : 'PvP tersedia.'
        : 'PvP belum tersedia.',
      dataMode: this.dataMode,
      difficulties,
      activeMatchId: studentId ? await this.activeRoom(studentId) : null,
    };
  }

  async activeRoom(studentId: string) {
    const { db } = getDatabase();
    const [room] = await db
      .select()
      .from(pvpActiveRooms)
      .where(eq(pvpActiveRooms.studentId, studentId));
    return room?.matchId ?? null;
  }

  private async selectPackage(tx: Database | Transaction, difficulty: Difficulty) {
    const policy = requirePvpPolicy(this.policy);
    const [version] = await tx
      .select()
      .from(scoringPolicyVersions)
      .where(
        and(
          eq(scoringPolicyVersions.id, policy.policyVersionId),
          eq(scoringPolicyVersions.status, 'PUBLISHED'),
        ),
      );
    if (!version)
      throw new ServiceUnavailableException({
        code: 'PVP_POLICY_UNAVAILABLE',
        detail: 'Kebijakan pertandingan belum tersedia.',
      });
    const candidates = await tx
      .select()
      .from(assessmentPackages)
      .where(
        and(
          eq(assessmentPackages.assessmentType, 'PVP'),
          eq(assessmentPackages.status, 'PUBLISHED'),
          eq(assessmentPackages.isDemo, this.dataMode === 'demo'),
          eq(assessmentPackages.scoringPolicyVersionId, policy.policyVersionId),
          lte(assessmentPackages.releaseAt, this.now()),
          sql`(${assessmentPackages.closeAt} is null or ${assessmentPackages.closeAt} > ${this.now().toISOString()})`,
        ),
      )
      .orderBy(desc(assessmentPackages.releaseAt), asc(assessmentPackages.id));
    for (const pack of candidates) {
      if (policy.mode && (!pack.frozenAt || !pack.manifestDigest)) continue;
      if (
        this.dataMode === 'official' &&
        (!pack.frozenAt ||
          !pack.manifestDigest ||
          !pack.curriculumApproval?.reference?.trim() ||
          !Number.isFinite(Date.parse(pack.curriculumApproval.approvedAt)) ||
          pack.curriculumApproval.manifestDigest !== pack.manifestDigest)
      )
        continue;
      const items = await tx
        .select({ item: packageItems, version: questionVersions, contentStatus: questions.status })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .innerJoin(questionVariants, eq(questionVariants.id, questionVersions.variantId))
        .innerJoin(questions, eq(questions.id, questionVariants.questionId))
        .where(eq(packageItems.packageId, pack.id))
        .orderBy(asc(packageItems.displayOrder));
      if (
        items.length !== 10 ||
        items.some(
          ({ item, version: v, contentStatus }, i) =>
            item.displayOrder !== i + 1 ||
            v.difficulty?.toLowerCase() !== difficulty ||
            contentStatus !== 'READY',
        )
      )
        continue;
      try {
        items.forEach(({ version: v }) => decodeSingleChoice(v));
      } catch (error) {
        if (error instanceof ServiceUnavailableException) continue;
        throw error;
      }
      return { pack, items, version };
    }
    throw new ServiceUnavailableException({
      code: 'PVP_CONTENT_UNAVAILABLE',
      detail: 'Paket PvP valid untuk kesulitan ini belum tersedia.',
    });
  }

  private async assertRoomAvailable(tx: Transaction, studentId: string, matchId?: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studentId}))`);
    const [room] = await tx
      .select()
      .from(pvpActiveRooms)
      .where(eq(pvpActiveRooms.studentId, studentId));
    if (room && room.matchId !== matchId)
      throw failure(
        'PVP_ACTIVE_ROOM_EXISTS',
        'Selesaikan atau keluar dari room aktif sebelum bergabung lagi.',
      );
  }

  private pinnedDuration(match: Match) {
    const value = (match.scoringSnapshot as { durationSeconds?: number }).durationSeconds;
    return value ?? durationSeconds(match.difficulty as Difficulty);
  }

  private async locked(tx: Transaction, matchId: string): Promise<Match> {
    const [match] = await tx
      .select()
      .from(pvpMatches)
      .where(eq(pvpMatches.id, matchId))
      .for('update');
    if (!match)
      throw new NotFoundException({
        code: 'MATCH_NOT_FOUND',
        detail: 'Pertandingan tidak ditemukan.',
      });
    return match;
  }
  private async member(
    tx: Database | Transaction,
    matchId: string,
    studentId: string,
    active = true,
  ) {
    const [player] = await tx
      .select()
      .from(pvpPlayers)
      .where(
        and(
          eq(pvpPlayers.matchId, matchId),
          eq(pvpPlayers.studentId, studentId),
          active ? isNull(pvpPlayers.leftAt) : undefined,
        ),
      )
      .orderBy(desc(sql`${pvpPlayers.leftAt} is null`), desc(pvpPlayers.id))
      .limit(1);
    if (!player)
      throw new ForbiddenException({
        code: 'MATCH_ACCESS_DENIED',
        detail: 'Pertandingan bukan milikmu.',
      });
    return player;
  }
  private async event(
    tx: Transaction,
    match: Match,
    eventName: string,
    context: Record<string, unknown> = {},
    actorId = match.creatorStudentId,
  ) {
    await tx.insert(analyticsOutbox).values({
      eventName,
      entityType: 'pvp_match',
      entityId: match.id,
      actorUserId: actorId,
      occurredAt: this.now(),
      payload: { difficulty: match.difficulty, ...context },
    });
  }

  async create(studentId: string, difficulty: Difficulty, requestId: string) {
    const policy = requirePvpPolicy(this.policy);
    if (!this.transportReady)
      throw new ServiceUnavailableException({
        code: 'PVP_SCHEDULER_UNAVAILABLE',
        detail: 'Penjadwal pertandingan belum tersedia.',
      });
    const { db } = getDatabase();
    const matchId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${studentId}))`);
      const [existing] = await tx
        .select()
        .from(pvpMatches)
        .where(
          and(
            eq(pvpMatches.creatorStudentId, studentId),
            eq(pvpMatches.createRequestId, requestId),
          ),
        );
      if (existing) {
        if (existing.difficulty !== difficulty)
          throw failure('REQUEST_ID_REUSED', 'Request ID sudah digunakan untuk room lain.');
        return existing.id;
      }
      if (!this.newRoomsEnabled)
        throw failure('PVP_NEW_MATCHES_DISABLED', 'Pembuatan room baru sedang dinonaktifkan.');
      await this.assertRoomAvailable(tx, studentId);
      const { pack, items, version } = await this.selectPackage(tx, difficulty);
      const now = this.now();
      const [match] = await tx
        .insert(pvpMatches)
        .values({
          packageId: pack.id,
          creatorStudentId: studentId,
          createRequestId: requestId,
          roomCode: randomBytes(6).toString('hex').toUpperCase(),
          difficulty,
          dataMode: this.dataMode,
          createdAt: now,
          expiresAt: new Date(now.getTime() + policy.roomLifetimeSeconds * 1000),
          scoringPolicyVersionId: policy.policyVersionId,
          scoringSnapshot: {
            versionId: version.id,
            configuration: version.configuration,
            durationSeconds: durationSeconds(difficulty),
            reconnectSeconds: 20,
            policy,
          },
        })
        .returning();
      await tx
        .insert(pvpPlayers)
        .values({ matchId: match!.id, studentId, playerSlot: 1, totalPoints: '0' });
      await tx.insert(pvpMatchQuestions).values(
        items.map(({ item }, i) => ({
          matchId: match!.id,
          packageId: pack.id,
          packageItemId: item.id,
          questionVersionId: item.questionVersionId,
          displayOrder: i + 1,
        })),
      );
      await this.event(tx, match!, 'pvp_room_created');
      return match!.id;
    });
    return this.snapshot(studentId, matchId);
  }

  private async addPlayer(tx: Transaction, match: Match, studentId: string) {
    await this.assertRoomAvailable(tx, studentId, match.id);
    const players = await tx
      .select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
    if (players.some((p) => p.studentId === studentId)) return;
    if (match.status !== 'WAITING' || (match.expiresAt && match.expiresAt <= this.now()))
      throw failure('ROOM_CLOSED', 'Room sudah ditutup.');
    if (players.length >= 2) throw failure('ROOM_FULL', 'Room sudah berisi dua pemain.');
    await tx
      .insert(pvpPlayers)
      .values({ matchId: match.id, studentId, playerSlot: 2, totalPoints: '0' });
    await tx
      .update(pvpInvites)
      .set({ status: 'ACCEPTED', respondedAt: this.now() })
      .where(
        and(
          eq(pvpInvites.matchId, match.id),
          eq(pvpInvites.recipientStudentId, studentId),
          eq(pvpInvites.status, 'PENDING'),
          gt(pvpInvites.expiresAt, this.now()),
        ),
      );
    await this.closeInvites(tx, match.id);
  }
  async join(studentId: string, roomCode: string) {
    requirePvpPolicy(this.policy);
    const { db } = getDatabase();
    const id = await db.transaction(async (tx) => {
      const [match] = await tx
        .select()
        .from(pvpMatches)
        .where(eq(pvpMatches.roomCode, roomCode.toUpperCase()))
        .for('update');
      if (!match)
        throw new NotFoundException({
          code: 'ROOM_NOT_FOUND',
          detail: 'Kode room tidak ditemukan.',
        });
      await this.addPlayer(tx, match, studentId);
      return match.id;
    });
    return this.snapshot(studentId, id);
  }

  async ready(studentId: string, matchId: string) {
    requirePvpPolicy(this.policy);
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      const player = await this.member(tx, matchId, studentId);
      if (match.status === 'RUNNING') return;
      if (match.status !== 'WAITING' && match.status !== 'READY')
        throw failure('MATCH_CLOSED', 'Pertandingan sudah ditutup.');
      if (match.expiresAt && match.expiresAt <= this.now())
        throw failure('ROOM_CLOSED', 'Room sudah kedaluwarsa.');
      if (player.connectionStatus !== 'CONNECTED')
        throw failure('PLAYER_DISCONNECTED', 'Sambungkan kembali sebelum Ready.');
      await tx.update(pvpPlayers).set({ ready: true }).where(eq(pvpPlayers.id, player.id));
      const players = await tx
        .select()
        .from(pvpPlayers)
        .where(and(eq(pvpPlayers.matchId, matchId), isNull(pvpPlayers.leftAt)));
      const activeUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(
              users.id,
              players.map((p) => p.studentId),
            ),
            eq(users.role, 'STUDENT'),
            eq(users.status, 'ACTIVE'),
          ),
        )
        .for('share');
      if (
        players.length === 2 &&
        activeUsers.length === 2 &&
        players.every((p) => p.ready && p.connectionStatus === 'CONNECTED')
      ) {
        await tx
          .update(pvpMatches)
          .set({ status: 'RUNNING', startedAt: this.now() })
          .where(eq(pvpMatches.id, matchId));
        await this.startQuestion(tx, match, 1);
        await this.closeInvites(tx, match.id);
        await this.event(tx, match, 'pvp_match_started');
      }
    });
    return this.snapshot(studentId, matchId);
  }
  private async startQuestion(tx: Transaction, match: Match, order: number) {
    const now = this.now();
    await tx
      .update(pvpMatchQuestions)
      .set({
        status: 'ACTIVE',
        startedAt: now,
        deadlineAt: new Date(now.getTime() + this.pinnedDuration(match) * 1000),
      })
      .where(
        and(eq(pvpMatchQuestions.matchId, match.id), eq(pvpMatchQuestions.displayOrder, order)),
      );
  }

  async answer(
    studentId: string,
    matchId: string,
    questionId: string,
    optionId: string | null,
    requestId: string,
  ) {
    requirePvpPolicy(this.policy);
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      const player = await this.member(tx, matchId, studentId);
      const [replay] = await tx
        .select()
        .from(pvpAnswers)
        .where(and(eq(pvpAnswers.playerId, player.id), eq(pvpAnswers.requestId, requestId)));
      if (replay && replay.matchQuestionId !== questionId)
        throw failure('REQUEST_ID_REUSED', 'Request ID sudah digunakan untuk soal lain.');
      const [previous] = await tx
        .select()
        .from(pvpAnswers)
        .where(and(eq(pvpAnswers.playerId, player.id), eq(pvpAnswers.matchQuestionId, questionId)));
      if (previous) return; // The original answer remains immutable, including retries after timeout.
      if (match.status !== 'RUNNING' || player.connectionStatus !== 'CONNECTED')
        throw failure('MATCH_NOT_RUNNING', 'Pertandingan tidak sedang berjalan.');
      const disconnected = await tx
        .select()
        .from(pvpPlayers)
        .where(
          and(
            eq(pvpPlayers.matchId, matchId),
            isNull(pvpPlayers.leftAt),
            eq(pvpPlayers.connectionStatus, 'DISCONNECTED'),
          ),
        );
      if (disconnected.some((p) => p.reconnectDeadlineAt && p.reconnectDeadlineAt < this.now()))
        throw failure('RECONNECT_EXPIRED', 'Pertandingan menunggu finalisasi reconnect server.');
      const [item] = await tx
        .select({ question: pvpMatchQuestions, version: questionVersions })
        .from(pvpMatchQuestions)
        .innerJoin(questionVersions, eq(questionVersions.id, pvpMatchQuestions.questionVersionId))
        .where(and(eq(pvpMatchQuestions.id, questionId), eq(pvpMatchQuestions.matchId, matchId)));
      if (
        !item ||
        item.question.status !== 'ACTIVE' ||
        !item.question.deadlineAt ||
        item.question.deadlineAt <= this.now()
      )
        throw failure('ANSWER_TOO_LATE', 'Waktu jawaban sudah berakhir.');
      const content = decodeSingleChoice(item.version);
      if (optionId !== null && !content.options.some((o) => o.id === optionId))
        throw failure('OPTION_INVALID', 'Pilihan jawaban tidak valid.');
      const points = pvpPoints(
        optionId === content.correctOptionId,
        item.question.deadlineAt.getTime() - this.now().getTime(),
        this.pinnedDuration(match) * 1000,
      );
      await tx.insert(pvpAnswers).values({
        playerId: player.id,
        matchId,
        matchQuestionId: questionId,
        requestId,
        answer: { optionId },
        receivedAt: this.now(),
        basePoints: String(points.basePoints),
        speedBonus: String(points.speedBonus),
      });
      const answers = await tx
        .select()
        .from(pvpAnswers)
        .where(eq(pvpAnswers.matchQuestionId, questionId));
      if (answers.length === 2) await this.resolveQuestion(tx, match, item.question);
    });
    return this.snapshot(studentId, matchId);
  }

  private async resolveQuestion(
    tx: Transaction,
    match: Match,
    question: typeof pvpMatchQuestions.$inferSelect,
  ) {
    if (question.status !== 'ACTIVE') return;
    const players = await tx
      .select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
    for (const player of players) {
      await tx
        .insert(pvpAnswers)
        .values({
          playerId: player.id,
          matchId: match.id,
          matchQuestionId: question.id,
          answer: { optionId: null },
          receivedAt: this.now(),
        })
        .onConflictDoNothing();
      const [total] = await tx
        .select({
          points: sql<string>`coalesce(sum(${pvpAnswers.basePoints} + ${pvpAnswers.speedBonus}), 0)`,
        })
        .from(pvpAnswers)
        .where(eq(pvpAnswers.playerId, player.id));
      await tx
        .update(pvpPlayers)
        .set({ totalPoints: total!.points })
        .where(eq(pvpPlayers.id, player.id));
    }
    await tx
      .update(pvpMatchQuestions)
      .set({ status: 'RESOLVED' })
      .where(eq(pvpMatchQuestions.id, question.id));
    if (question.displayOrder < 10) await this.startQuestion(tx, match, question.displayOrder + 1);
    else {
      const final = await tx
        .select()
        .from(pvpPlayers)
        .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
      const top = Math.max(...final.map((p) => Number(p.totalPoints)));
      const draw = final.every((p) => Number(p.totalPoints) === top);
      for (const p of final)
        await tx
          .update(pvpPlayers)
          .set({ result: draw ? 'DRAW' : Number(p.totalPoints) === top ? 'WIN' : 'LOSS' })
          .where(eq(pvpPlayers.id, p.id));
      await tx
        .update(pvpMatches)
        .set({
          status: 'FINISHED',
          recordEligible: true,
          endedAt: this.now(),
          endReason: 'COMPLETED',
        })
        .where(eq(pvpMatches.id, match.id));
      await this.closeInvites(tx, match.id);
      await this.event(tx, match, 'pvp_match_completed');
    }
  }
  private async closeInvites(tx: Transaction, matchId: string) {
    await tx
      .update(pvpInvites)
      .set({ status: 'CANCELLED', respondedAt: this.now() })
      .where(and(eq(pvpInvites.matchId, matchId), eq(pvpInvites.status, 'PENDING')));
  }
  private async cancel(tx: Transaction, match: Match, reason: string) {
    if (match.status === 'FINISHED' || match.status === 'CANCELLED') return;
    await tx
      .update(pvpMatches)
      .set({ status: 'CANCELLED', recordEligible: false, endReason: reason, endedAt: this.now() })
      .where(eq(pvpMatches.id, match.id));
    await this.closeInvites(tx, match.id);
    await this.event(tx, match, 'pvp_match_cancelled');
  }
  async leave(studentId: string, matchId: string, requestId?: string) {
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      const player = await this.member(tx, matchId, studentId, false);
      if (requestId) {
        const [receipt] = await tx
          .select({ id: analyticsOutbox.id })
          .from(analyticsOutbox)
          .where(
            and(
              eq(analyticsOutbox.entityId, matchId),
              eq(analyticsOutbox.eventName, 'pvp_guest_left'),
              eq(analyticsOutbox.actorUserId, studentId),
              sql`${analyticsOutbox.payload}->>'requestId'=${requestId}`,
            ),
          )
          .limit(1);
        if (receipt) return;
      }
      if (match.status === 'FINISHED' || match.status === 'CANCELLED' || player.leftAt) return;
      if (match.status === 'RUNNING') await this.forfeit(tx, match, studentId);
      else if (match.creatorStudentId === studentId) await this.cancel(tx, match, 'HOST_LEFT');
      else await this.releaseGuest(tx, match, player.id, requestId, studentId);
    });
    return this.snapshot(studentId, matchId);
  }
  private async releaseGuest(
    tx: Transaction,
    match: Match,
    playerId: string,
    requestId?: string,
    studentId?: string,
  ) {
    await tx
      .update(pvpPlayers)
      .set({ leftAt: this.now(), ready: false, reconnectDeadlineAt: null })
      .where(eq(pvpPlayers.id, playerId));
    await tx
      .update(pvpPlayers)
      .set({ ready: false })
      .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
    await tx.update(pvpMatches).set({ status: 'WAITING' }).where(eq(pvpMatches.id, match.id));
    await this.closeInvites(tx, match.id);
    await this.event(
      tx,
      match,
      'pvp_guest_left',
      { playerId, requestId: requestId ?? null },
      studentId ?? match.creatorStudentId,
    );
  }
  async cancelRoom(studentId: string, matchId: string) {
    await getDatabase().db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      await this.member(tx, matchId, studentId);
      if (match.creatorStudentId !== studentId)
        throw new ForbiddenException('Hanya pembuat room dapat membatalkan.');
      if (match.status === 'RUNNING')
        throw failure('MATCH_RUNNING', 'Gunakan keluar pertandingan untuk menyerah.');
      await this.cancel(tx, match, 'CREATOR_CANCELLED');
    });
    return this.snapshot(studentId, matchId);
  }
  private async forfeit(tx: Transaction, match: Match, studentId: string) {
    if (match.status !== 'RUNNING') return;
    const players = await tx
      .select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
    for (const p of players)
      await tx
        .update(pvpPlayers)
        .set({
          result: p.studentId === studentId ? 'FORFEIT' : 'WIN',
          ...(p.studentId === studentId ? { connectionStatus: 'FORFEIT' as const } : {}),
        })
        .where(eq(pvpPlayers.id, p.id));
    await tx
      .update(pvpMatches)
      .set({ status: 'FINISHED', recordEligible: false, endReason: 'FORFEIT', endedAt: this.now() })
      .where(eq(pvpMatches.id, match.id));
    await this.closeInvites(tx, match.id);
    await this.event(tx, match, 'pvp_match_forfeited');
  }
  async disconnect(studentId: string, matchId: string) {
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      const player = await this.member(tx, matchId, studentId);
      if (
        match.status === 'FINISHED' ||
        match.status === 'CANCELLED' ||
        player.connectionStatus !== 'CONNECTED'
      )
        return;
      await tx
        .update(pvpPlayers)
        .set({
          connectionStatus: 'DISCONNECTED',
          ...(match.status !== 'RUNNING' ? { ready: false } : {}),
          disconnectedAt: this.now(),
          reconnectDeadlineAt: new Date(this.now().getTime() + 20_000),
        })
        .where(eq(pvpPlayers.id, player.id));
    });
  }
  async reconnect(studentId: string, matchId: string) {
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      await this.member(tx, matchId, studentId, false);
      await this.advance(tx, match);
      const [current] = await tx.select().from(pvpMatches).where(eq(pvpMatches.id, matchId));
      if (!current || current.status === 'FINISHED' || current.status === 'CANCELLED') return;
      const [player] = await tx
        .select()
        .from(pvpPlayers)
        .where(
          and(
            eq(pvpPlayers.matchId, matchId),
            eq(pvpPlayers.studentId, studentId),
            isNull(pvpPlayers.leftAt),
          ),
        );
      if (!player || (player.reconnectDeadlineAt && player.reconnectDeadlineAt < this.now()))
        return;
      await tx
        .update(pvpPlayers)
        .set({ connectionStatus: 'CONNECTED', disconnectedAt: null, reconnectDeadlineAt: null })
        .where(eq(pvpPlayers.id, player.id));
    });
    return this.snapshot(studentId, matchId);
  }
  private async advance(tx: Transaction, match: Match) {
    if (match.status === 'FINISHED' || match.status === 'CANCELLED') return;
    if (match.status !== 'RUNNING' && match.expiresAt && match.expiresAt <= this.now()) {
      await this.cancel(tx, match, 'ROOM_EXPIRED');
      return;
    }
    const players = await tx
      .select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, match.id), isNull(pvpPlayers.leftAt)));
    const disconnected = players
      .filter((p) => p.connectionStatus === 'DISCONNECTED')
      .sort((a, b) => a.reconnectDeadlineAt!.getTime() - b.reconnectDeadlineAt!.getTime());
    if (disconnected[0]?.reconnectDeadlineAt && disconnected[0].reconnectDeadlineAt < this.now()) {
      const first = disconnected[0];
      if (match.status !== 'RUNNING') {
        if (first.studentId === match.creatorStudentId)
          await this.cancel(tx, match, 'HOST_RECONNECT_EXPIRED');
        else {
          await this.releaseGuest(tx, match, first.id);
          const host = disconnected.find((p) => p.studentId === match.creatorStudentId);
          if (host?.reconnectDeadlineAt && host.reconnectDeadlineAt < this.now())
            await this.cancel(tx, match, 'HOST_RECONNECT_EXPIRED');
        }
      } else {
        const pinned = match.scoringSnapshot as { policy?: PvpPolicy };
        const equal =
          disconnected.length === 2 &&
          disconnected[1]!.reconnectDeadlineAt!.getTime() === first.reconnectDeadlineAt!.getTime();
        if (
          equal ||
          (disconnected.length === 2 && pinned.policy?.simultaneousDisconnect === 'cancel')
        )
          await this.cancel(tx, match, 'SIMULTANEOUS_DISCONNECT');
        else await this.forfeit(tx, match, first.studentId);
      }
      return;
    }
    if (match.status !== 'RUNNING') {
      if (match.expiresAt && match.expiresAt <= this.now())
        await this.cancel(tx, match, 'ROOM_EXPIRED');
      return;
    }
    const [active] = await tx
      .select()
      .from(pvpMatchQuestions)
      .where(and(eq(pvpMatchQuestions.matchId, match.id), eq(pvpMatchQuestions.status, 'ACTIVE')));
    if (active?.deadlineAt && active.deadlineAt <= this.now())
      await this.resolveQuestion(tx, match, active);
  }
  async tick(matchId: string) {
    await getDatabase().db.transaction(async (tx) =>
      this.advance(tx, await this.locked(tx, matchId)),
    );
  }
  async cancelUnavailable(matchId: string) {
    await getDatabase().db.transaction(async (tx) =>
      this.cancel(tx, await this.locked(tx, matchId), 'SERVICE_INTERRUPTED'),
    );
  }
  async recoverAfterRestart() {
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const matches = await tx
        .select()
        .from(pvpMatches)
        .where(inArray(pvpMatches.status, ['WAITING', 'READY', 'RUNNING']))
        .for('update');
      for (const match of matches) await this.cancel(tx, match, 'SERVER_RESTARTED');
      return matches.length;
    });
  }

  async invite(
    studentId: string,
    matchId: string,
    recipientId: string,
    requestId: string = randomUUID(),
  ) {
    const policy = requirePvpPolicy(this.policy);
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      await this.member(tx, matchId, studentId);
      const [replay] = await tx
        .select()
        .from(pvpInvites)
        .where(and(eq(pvpInvites.senderStudentId, studentId), eq(pvpInvites.requestId, requestId)));
      if (replay) {
        if (replay.matchId !== matchId || replay.recipientStudentId !== recipientId)
          throw failure('REQUEST_ID_REUSED', 'Request ID sudah digunakan untuk undangan lain.');
        return { inviteId: replay.id };
      }
      if (
        match.status !== 'WAITING' ||
        match.creatorStudentId !== studentId ||
        (match.expiresAt && match.expiresAt <= this.now())
      )
        throw failure('ROOM_CLOSED', 'Undangan tidak tersedia.');
      const members = await tx
        .select()
        .from(classMemberships)
        .where(
          and(
            inArray(classMemberships.studentUserId, [studentId, recipientId]),
            isNull(classMemberships.leftAt),
            sql`exists(select 1 from ${classes} c where c.id=${classMemberships.classId} and c.archived_at is null)`,
          ),
        )
        .for('share');
      const senderClasses = new Set(
        members.filter((m) => m.studentUserId === studentId).map((m) => m.classId),
      );
      const commonClassId = members
        .filter((m) => m.studentUserId === recipientId && senderClasses.has(m.classId))
        .map((m) => m.classId)
        .sort()[0];
      if (recipientId === studentId || !commonClassId)
        throw new ForbiddenException({
          code: 'CLASSMATE_REQUIRED',
          detail: 'Undangan hanya untuk teman sekelas.',
        });
      const [recipient] = await tx
        .select()
        .from(users)
        .where(
          and(eq(users.id, recipientId), eq(users.role, 'STUDENT'), eq(users.status, 'ACTIVE')),
        );
      if (!recipient) throw new ForbiddenException('Penerima tidak tersedia.');
      await tx
        .update(pvpInvites)
        .set({ status: 'EXPIRED', respondedAt: this.now() })
        .where(
          and(
            eq(pvpInvites.matchId, matchId),
            eq(pvpInvites.recipientStudentId, recipientId),
            eq(pvpInvites.status, 'PENDING'),
            lte(pvpInvites.expiresAt, this.now()),
          ),
        );
      const [invite] = await tx
        .insert(pvpInvites)
        .values({
          matchId,
          requestId,
          classIdAtInvite: commonClassId,
          senderStudentId: studentId,
          recipientStudentId: recipientId,
          createdAt: this.now(),
          expiresAt: new Date(this.now().getTime() + policy.inviteLifetimeSeconds * 1000),
        })
        .onConflictDoNothing()
        .returning({ id: pvpInvites.id });
      if (invite) {
        await enqueueNotification(tx, { kind: 'PVP_INVITED', sourceId: invite.id, recipientId });
        return { inviteId: invite.id };
      }
      const [existing] = await tx
        .select()
        .from(pvpInvites)
        .where(
          and(
            eq(pvpInvites.matchId, matchId),
            eq(pvpInvites.recipientStudentId, recipientId),
            eq(pvpInvites.status, 'PENDING'),
          ),
        );
      return { inviteId: existing!.id };
    });
  }
  async respondInvite(studentId: string, inviteId: string, accept: boolean) {
    requirePvpPolicy(this.policy);
    const { db } = getDatabase();
    const matchId = await db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(pvpInvites)
        .where(and(eq(pvpInvites.id, inviteId), eq(pvpInvites.recipientStudentId, studentId)));
      if (!invitation) throw new NotFoundException('Undangan tidak ditemukan.');
      const match = await this.locked(tx, invitation.matchId);
      const [current] = await tx
        .select()
        .from(pvpInvites)
        .where(eq(pvpInvites.id, invitation.id))
        .for('update');
      const replayAccepted = current!.status === 'ACCEPTED' && accept;
      if (
        !replayAccepted &&
        (current!.status !== 'PENDING' || !current!.expiresAt || current!.expiresAt <= this.now())
      )
        throw failure('INVITE_CLOSED', 'Undangan sudah berakhir.');
      const members = await tx
        .select()
        .from(classMemberships)
        .where(
          and(
            inArray(classMemberships.studentUserId, [studentId, current!.senderStudentId]),
            eq(classMemberships.classId, current!.classIdAtInvite),
            isNull(classMemberships.leftAt),
            sql`exists(select 1 from ${classes} c where c.id=${classMemberships.classId} and c.archived_at is null)`,
          ),
        )
        .for('share');
      if (members.length !== 2)
        throw new ForbiddenException({
          code: 'CLASSMATE_REQUIRED',
          detail: 'Undangan hanya berlaku untuk kelas yang sama.',
        });
      if (replayAccepted) {
        if (
          !['WAITING', 'READY', 'RUNNING'].includes(match.status) ||
          (match.status !== 'RUNNING' && match.expiresAt && match.expiresAt <= this.now())
        )
          throw failure('ROOM_CLOSED', 'Room undangan sudah berakhir.');
        await this.member(tx, match.id, studentId);
        return match.id;
      }
      if (accept) await this.addPlayer(tx, match, studentId);
      else
        await tx
          .update(pvpInvites)
          .set({ status: 'DECLINED', respondedAt: this.now() })
          .where(eq(pvpInvites.id, inviteId));
      return accept ? match.id : null;
    });
    return matchId ? this.snapshot(studentId, matchId) : null;
  }

  async snapshot(studentId: string, matchId: string): Promise<PvpSnapshotDto> {
    const { db } = getDatabase();
    // Consistent snapshot prevents a transition from mixing two question states.
    return db.transaction(async (tx) => {
      await this.member(tx, matchId, studentId, false);
      const match = await this.locked(tx, matchId);
      const [pack] = await tx
        .select({ isDemo: assessmentPackages.isDemo })
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, match.packageId));
      const players = await tx
        .select({ player: pvpPlayers, name: users.displayName })
        .from(pvpPlayers)
        .innerJoin(users, eq(users.id, pvpPlayers.studentId))
        .where(and(eq(pvpPlayers.matchId, matchId), isNull(pvpPlayers.leftAt)))
        .orderBy(asc(pvpPlayers.playerSlot));
      const [active] =
        match.status === 'RUNNING' && players.some((p) => p.player.studentId === studentId)
          ? await tx
              .select({ question: pvpMatchQuestions, version: questionVersions })
              .from(pvpMatchQuestions)
              .innerJoin(
                questionVersions,
                eq(questionVersions.id, pvpMatchQuestions.questionVersionId),
              )
              .where(
                and(eq(pvpMatchQuestions.matchId, matchId), eq(pvpMatchQuestions.status, 'ACTIVE')),
              )
          : [];
      const self = players.find((p) => p.player.studentId === studentId);
      const [answer] =
        active && self
          ? await tx
              .select()
              .from(pvpAnswers)
              .where(
                and(
                  eq(pvpAnswers.playerId, self.player.id),
                  eq(pvpAnswers.matchQuestionId, active.question.id),
                ),
              )
          : [];
      const content = active ? decodeSingleChoice(active.version) : null;
      if (active && content)
        await tx.execute(
          sql`select public.record_pvp_delivery(${studentId}::uuid, ${active.question.id}::uuid)`,
        );
      const value = answer?.answer as { optionId?: string | null } | undefined;
      return {
        matchId,
        roomCode: match.roomCode,
        creatorStudentId: match.creatorStudentId,
        difficulty: match.difficulty as Difficulty,
        status: match.status,
        serverTime: this.now().toISOString(),
        isDemo: pack!.isDemo,
        participantActive: !!self,
        expiresAt: match.expiresAt?.toISOString() ?? null,
        recordEligible: match.recordEligible,
        endReason: match.endReason,
        players: players.map(({ player: p, name }) => ({
          studentId: p.studentId,
          displayName: name,
          slot: p.playerSlot,
          ready: p.ready,
          connectionStatus: p.connectionStatus,
          reconnectDeadlineAt: p.reconnectDeadlineAt?.toISOString() ?? null,
          points: Number(p.totalPoints ?? 0),
          result: p.result,
        })),
        question:
          active && content
            ? {
                id: active.question.id,
                order: active.question.displayOrder,
                stem: content.stem,
                options: content.options,
                deadlineAt: active.question.deadlineAt!.toISOString(),
                durationSeconds: this.pinnedDuration(match),
                answered: !!answer,
                selectedOptionId: value?.optionId ?? null,
              }
            : null,
      };
    });
  }
}
