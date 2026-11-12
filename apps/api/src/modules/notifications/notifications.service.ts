import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  getDatabase,
  notifications,
  pvpInvites,
  pvpMatches,
  classMemberships,
  users,
  releasedTryoutPackageIds,
  currentTryoutPackage,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { PvpService } from '../pvp/pvp.service';
import type { NotificationActionDto, NotificationQueryDto } from './notifications.dto';

const active = sql`${notifications.occurredAt} > clock_timestamp() - interval '30 days'`;
@Injectable()
export class NotificationsService {
  constructor(
    private readonly identity: IdentityService,
    private readonly pvp: PvpService,
  ) {}
  private async student(auth?: string) {
    const user = await this.identity.me(auth);
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Akses Student aktif diperlukan.');
    return user.id;
  }
  async summary(auth?: string) {
    const id = await this.student(auth);
    const [row] = await getDatabase()
      .db.select({
        total: sql<number>`count(*)::integer`,
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::integer`,
      })
      .from(notifications)
      .where(and(eq(notifications.recipientId, id), active));
    return row!;
  }
  async list(auth: string | undefined, query: NotificationQueryDto) {
    const id = await this.student(auth);
    const { db } = getDatabase();
    const kindScope = and(
      query.filter === 'class'
        ? inArray(notifications.kind, ['FEEDBACK_RECEIVED', 'PVP_INVITED'])
        : undefined,
      query.filter === 'tryout'
        ? inArray(notifications.kind, ['TRYOUT_OPENED', 'TRYOUT_RESULT_READY'])
        : undefined,
      query.filter === 'learning' ? eq(notifications.kind, 'LEVEL_UNLOCKED') : undefined,
    );
    const scope = and(
      eq(notifications.recipientId, id),
      query.filter === 'archive' ? sql`not (${active})` : active,
      kindScope,
    );
    let cursor: typeof notifications.$inferSelect | undefined;
    if (query.cursor) {
      [cursor] = await db
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.recipientId, id), eq(notifications.id, query.cursor), kindScope),
        );
      if (!cursor)
        throw new BadRequestException('Cursor notifikasi tidak berlaku untuk filter ini.');
    }
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          scope,
          query.filter === 'unread' ? isNull(notifications.readAt) : undefined,
          cursor
            ? // Keep PostgreSQL microseconds; a JavaScript Date truncates them.
              sql`(${notifications.occurredAt}, ${notifications.id}) <
                (select occurred_at, id from public.notifications where id = ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(notifications.occurredAt), desc(notifications.id))
      .limit(21);
    const page = rows.slice(0, 20);
    const actions = await this.actions(page, id);
    const items = page.map((row, index) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      occurredAt: row.occurredAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      archived: query.filter === 'archive',
      action: actions[index]!,
    }));
    return { items, nextCursor: rows.length > 20 ? rows[19]!.id : null };
  }
  private async actions(
    rows: (typeof notifications.$inferSelect)[],
    studentId: string,
  ): Promise<NotificationActionDto[]> {
    const { db } = getDatabase();
    const inviteIds = rows.flatMap((row) =>
      row.kind === 'PVP_INVITED' && row.context.inviteId ? [row.context.inviteId] : [],
    );
    const invites = inviteIds.length
      ? await db
          .select({
            id: pvpInvites.id,
            matchId: pvpMatches.id,
            status: pvpInvites.status,
            expiresAt: pvpInvites.expiresAt,
            roomStatus: pvpMatches.status,
            senderStatus: users.status,
            members: sql<number>`(
          select count(*)::integer from ${classMemberships}
          where ${classMemberships.classId} = ${pvpInvites.classIdAtInvite}
            and ${classMemberships.studentUserId} in (${studentId}::uuid, ${pvpInvites.senderStudentId})
            and ${classMemberships.leftAt} is null
        )`,
          })
          .from(pvpInvites)
          .innerJoin(pvpMatches, eq(pvpMatches.id, pvpInvites.matchId))
          .innerJoin(users, eq(users.id, pvpInvites.senderStudentId))
          .where(
            and(inArray(pvpInvites.id, inviteIds), eq(pvpInvites.recipientStudentId, studentId)),
          )
      : [];
    const byInvite = new Map(invites.map((invite) => [invite.id, invite]));
    const pending = (invite: (typeof invites)[number]) =>
      invite.status === 'PENDING' &&
      invite.roomStatus === 'WAITING' &&
      !!invite.expiresAt &&
      invite.expiresAt > new Date() &&
      invite.members === 2 &&
      invite.senderStatus === 'ACTIVE';
    const resultPackages = rows.flatMap((row) =>
      row.kind === 'TRYOUT_RESULT_READY' && row.context.packageId && row.context.attemptId
        ? [row.context.packageId]
        : [],
    );
    const [policy, current, released] = await Promise.all([
      // list() already authenticated this active Student. Only content/runtime state is needed here.
      invites.some(pending) ? this.pvp.engine.availability() : null,
      rows.some((row) => row.kind === 'TRYOUT_OPENED' && row.context.packageId)
        ? currentTryoutPackage()
        : null,
      resultPackages.length ? releasedTryoutPackageIds(resultPackages) : new Set<string>(),
    ]);
    return rows.map((row): NotificationActionDto => {
      const ctx = row.context;
      if (row.kind === 'PVP_INVITED' && ctx.inviteId) {
        const invite = byInvite.get(ctx.inviteId);
        if (invite) {
          const actionable = pending(invite);
          const labels = {
            ACCEPTED: 'Diterima',
            DECLINED: 'Ditolak',
            CANCELLED: 'Dibatalkan',
            EXPIRED: 'Kedaluwarsa',
            PENDING: 'Undangan tidak tersedia',
          };
          return {
            type: 'pvp',
            inviteId: ctx.inviteId,
            matchId: invite.matchId,
            enabled: actionable && policy?.available === true,
            status: actionable
              ? policy?.available
                ? null
                : (policy?.message ?? 'PvP belum tersedia.')
              : labels[invite.status],
          };
        }
      }
      if (row.kind === 'FEEDBACK_RECEIVED' && ctx.feedbackId)
        return { type: 'feedback', feedbackId: ctx.feedbackId, enabled: true, status: null };
      if (row.kind === 'LEVEL_UNLOCKED' && ctx.chapterId && ctx.subchapterId)
        return {
          type: 'roadmap',
          chapterId: ctx.chapterId,
          subchapterId: ctx.subchapterId,
          enabled: true,
          status: null,
        };
      if (row.kind === 'TRYOUT_OPENED' && ctx.packageId) {
        return {
          type: 'tryout',
          packageId: ctx.packageId,
          enabled: current?.id === ctx.packageId,
          status: current?.id === ctx.packageId ? null : 'Paket tidak lagi terbuka',
        };
      }
      if (row.kind === 'TRYOUT_RESULT_READY' && ctx.packageId && ctx.attemptId) {
        const ready = released.has(ctx.packageId);
        return {
          type: 'result',
          attemptId: ctx.attemptId,
          enabled: ready,
          status: ready ? null : 'Hasil belum tersedia',
        };
      }
      return { type: 'unavailable', enabled: false, status: 'Konten tidak tersedia' };
    });
  }
  async read(auth: string | undefined, id: string) {
    const studentId = await this.student(auth);
    const { db } = getDatabase();
    const rows = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, clock_timestamp())` })
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, studentId)))
      .returning({ id: notifications.id });
    if (!rows.length) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return { updated: rows.length };
  }
  async readAll(auth?: string) {
    const id = await this.student(auth);
    const { db } = getDatabase();
    // Statement snapshot excludes future inserts, including events with an older occurredAt.
    const rows = await db
      .update(notifications)
      .set({ readAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(notifications.recipientId, id),
          active,
          isNull(notifications.readAt),
          lte(notifications.createdAt, sql`statement_timestamp()`),
        ),
      )
      .returning({ id: notifications.id });
    return { updated: rows.length };
  }
}
