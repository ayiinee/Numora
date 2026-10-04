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
  packageItems,
  pvpAnswers,
  pvpInvites,
  pvpMatches,
  pvpMatchQuestions,
  pvpPlayers,
  questionVersions,
  scoringPolicyVersions,
  users,
} from '@tka/database';
import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
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
  constructor(@Inject(PVP_POLICY) private readonly policy: PvpPolicy | null) {}

  availability() {
    return {
      available: !!this.policy,
      reasonCode: this.policy ? null : 'PVP_POLICY_OPEN',
      message: this.policy ? 'PvP tersedia.' : 'PvP belum tersedia.',
    };
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
  private async member(tx: Database | Transaction, matchId: string, studentId: string) {
    const [player] = await tx
      .select()
      .from(pvpPlayers)
      .where(and(eq(pvpPlayers.matchId, matchId), eq(pvpPlayers.studentId, studentId)));
    if (!player)
      throw new ForbiddenException({
        code: 'MATCH_ACCESS_DENIED',
        detail: 'Pertandingan bukan milikmu.',
      });
    return player;
  }
  private async event(tx: Transaction, match: Match, eventName: string) {
    await tx
      .insert(analyticsOutbox)
      .values({
        eventName,
        entityType: 'pvp_match',
        entityId: match.id,
        actorUserId: match.creatorStudentId,
        occurredAt: this.now(),
        payload: { difficulty: match.difficulty },
      });
  }

  async create(studentId: string, difficulty: Difficulty, requestId: string) {
    const policy = requirePvpPolicy(this.policy);
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
      if (existing) return existing.id;
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
      const [pack] = await tx
        .select()
        .from(assessmentPackages)
        .where(
          and(
            eq(assessmentPackages.assessmentType, 'PVP'),
            eq(assessmentPackages.status, 'PUBLISHED'),
            eq(assessmentPackages.scoringPolicyVersionId, policy.policyVersionId),
            lte(assessmentPackages.releaseAt, this.now()),
            sql`(${assessmentPackages.closeAt} is null or ${assessmentPackages.closeAt} > ${this.now().toISOString()})`,
            sql`exists (select 1 from package_items i join question_versions v on v.id = i.question_version_id where i.package_id = ${assessmentPackages.id} and lower(v.difficulty) = ${difficulty})`,
          ),
        )
        .orderBy(asc(assessmentPackages.id))
        .limit(1);
      if (!pack)
        throw new ServiceUnavailableException({
          code: 'PVP_CONTENT_UNAVAILABLE',
          detail: 'Paket PvP belum tersedia.',
        });
      const items = await tx
        .select({ item: packageItems, version: questionVersions })
        .from(packageItems)
        .innerJoin(questionVersions, eq(questionVersions.id, packageItems.questionVersionId))
        .where(eq(packageItems.packageId, pack.id))
        .orderBy(asc(packageItems.displayOrder));
      if (
        items.length !== 10 ||
        items.some(({ version: v }) => v.difficulty?.toLowerCase() !== difficulty)
      )
        throw failure('PVP_CONTENT_INVALID', 'Paket harus berisi 10 soal setara.');
      items.forEach(({ version: v }) => decodeSingleChoice(v));
      const now = this.now();
      const [match] = await tx
        .insert(pvpMatches)
        .values({
          packageId: pack.id,
          creatorStudentId: studentId,
          createRequestId: requestId,
          roomCode: randomBytes(6).toString('hex').toUpperCase(),
          difficulty,
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
      await tx
        .insert(pvpMatchQuestions)
        .values(
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
    const players = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, match.id));
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
      await tx.update(pvpPlayers).set({ ready: true }).where(eq(pvpPlayers.id, player.id));
      const players = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, matchId));
      if (
        players.length === 2 &&
        players.every((p) => p.ready && p.connectionStatus === 'CONNECTED')
      ) {
        await tx
          .update(pvpMatches)
          .set({ status: 'RUNNING', startedAt: this.now() })
          .where(eq(pvpMatches.id, matchId));
        await this.startQuestion(tx, match, 1);
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
        deadlineAt: new Date(
          now.getTime() + durationSeconds(match.difficulty as Difficulty) * 1000,
        ),
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
        durationSeconds(match.difficulty as Difficulty) * 1000,
      );
      await tx
        .insert(pvpAnswers)
        .values({
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
    const players = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, match.id));
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
      const final = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, match.id));
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
  async leave(studentId: string, matchId: string) {
    const { db } = getDatabase();
    await db.transaction(async (tx) => {
      const match = await this.locked(tx, matchId);
      await this.member(tx, matchId, studentId);
      if (match.status === 'RUNNING') await this.forfeit(tx, match, studentId);
      else await this.cancel(tx, match, 'PLAYER_LEFT');
    });
    return this.snapshot(studentId, matchId);
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
    const players = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, match.id));
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
      const player = await this.member(tx, matchId, studentId);
      await this.advance(tx, match);
      if (player.reconnectDeadlineAt && player.reconnectDeadlineAt <= this.now()) return;
      await tx
        .update(pvpPlayers)
        .set({ connectionStatus: 'CONNECTED', disconnectedAt: null, reconnectDeadlineAt: null })
        .where(eq(pvpPlayers.id, player.id));
    });
    return this.snapshot(studentId, matchId);
  }
  private async advance(tx: Transaction, match: Match) {
    if (match.status === 'FINISHED' || match.status === 'CANCELLED') return;
    const players = await tx.select().from(pvpPlayers).where(eq(pvpPlayers.matchId, match.id));
    const disconnected = players.filter((p) => p.connectionStatus === 'DISCONNECTED');
    if (disconnected.some((p) => p.reconnectDeadlineAt && p.reconnectDeadlineAt <= this.now())) {
      if (disconnected.length === 2 || match.status !== 'RUNNING')
        await this.cancel(tx, match, 'RECONNECT_EXPIRED');
      else await this.forfeit(tx, match, disconnected[0]!.studentId);
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
          ),
        )
        .for('share');
      if (
        recipientId === studentId ||
        members.length !== 2 ||
        members[0]!.classId !== members[1]!.classId
      )
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
          classIdAtInvite: members[0]!.classId,
          senderStudentId: studentId,
          recipientStudentId: recipientId,
          createdAt: this.now(),
          expiresAt: new Date(this.now().getTime() + policy.inviteLifetimeSeconds * 1000),
        })
        .onConflictDoNothing()
        .returning({ id: pvpInvites.id });
      if (invite) return { inviteId: invite.id };
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
      if (current!.status === 'ACCEPTED' && accept) return match.id;
      if (current!.status !== 'PENDING' || !current!.expiresAt || current!.expiresAt <= this.now())
        throw failure('INVITE_CLOSED', 'Undangan sudah berakhir.');
      const members = await tx
        .select()
        .from(classMemberships)
        .where(
          and(
            inArray(classMemberships.studentUserId, [studentId, current!.senderStudentId]),
            eq(classMemberships.classId, current!.classIdAtInvite),
            isNull(classMemberships.leftAt),
          ),
        )
        .for('share');
      if (members.length !== 2)
        throw new ForbiddenException({
          code: 'CLASSMATE_REQUIRED',
          detail: 'Undangan hanya berlaku untuk kelas yang sama.',
        });
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
      await this.member(tx, matchId, studentId);
      const match = await this.locked(tx, matchId);
      const [pack] = await tx
        .select({ isDemo: assessmentPackages.isDemo })
        .from(assessmentPackages)
        .where(eq(assessmentPackages.id, match.packageId));
      const players = await tx
        .select({ player: pvpPlayers, name: users.displayName })
        .from(pvpPlayers)
        .innerJoin(users, eq(users.id, pvpPlayers.studentId))
        .where(eq(pvpPlayers.matchId, matchId))
        .orderBy(asc(pvpPlayers.playerSlot));
      const [active] =
        match.status === 'RUNNING'
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
      const self = players.find((p) => p.player.studentId === studentId)!;
      const [answer] = active
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
        await tx.execute(sql`select public.record_pvp_delivery(${studentId}::uuid, ${active.question.id}::uuid)`);
      const value = answer?.answer as { optionId?: string | null } | undefined;
      return {
        matchId,
        roomCode: match.roomCode,
        creatorStudentId: match.creatorStudentId,
        difficulty: match.difficulty as Difficulty,
        status: match.status,
        serverTime: this.now().toISOString(),
        isDemo: pack!.isDemo,
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
                durationSeconds: durationSeconds(match.difficulty as Difficulty),
                answered: !!answer,
                selectedOptionId: value?.optionId ?? null,
              }
            : null,
      };
    });
  }
}
