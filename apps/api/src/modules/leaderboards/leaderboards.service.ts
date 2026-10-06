import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  classes,
  classLeaderboardEntries,
  classMemberships,
  globalActivityLeaderboardEntries,
  getDatabase,
  leaderboardPeriod,
  leaderboardPeriods,
  pvpLeaderboardEntries,
  users,
} from '@tka/database';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { pvpMode, type Difficulty } from '../pvp/pvp.policy';
import type { LeaderboardDto, LeaderboardPeriodsQueryDto } from './leaderboards.dto';

type Database = ReturnType<typeof getDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Period = typeof leaderboardPeriods.$inferSelect;
type Scope = 'class' | 'activity' | 'pvp';

@Injectable()
export class LeaderboardsService {
  constructor(private readonly identity: IdentityService) {}
  private async student(authorization?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException({
        code: 'STUDENT_REQUIRED',
        detail: 'Akses Student diperlukan.',
      });
    return user;
  }
  private get mode() {
    return pvpMode() === 'demo' ? ('demo' as const) : ('official' as const);
  }
  private async membership(tx: Transaction, studentId: string, classId?: string) {
    const [member] = await tx
      .select({ id: classes.id, name: classes.name })
      .from(classMemberships)
      .innerJoin(classes, eq(classes.id, classMemberships.classId))
      .where(
        and(
          eq(classMemberships.studentUserId, studentId),
          isNull(classMemberships.leftAt),
          isNull(classes.archivedAt),
          classId ? eq(classes.id, classId) : undefined,
        ),
      )
      .orderBy(desc(classMemberships.joinedAt), asc(classes.id))
      .limit(1)
      .for('share');
    if (!member)
      throw new ForbiddenException({
        code: 'CLASS_REQUIRED',
        detail: 'Keanggotaan kelas aktif diperlukan untuk melihat peringkat.',
      });
    return member;
  }
  private async period(tx: Transaction, now: Date, periodId?: string): Promise<Period | undefined> {
    const [period] = await tx
      .select()
      .from(leaderboardPeriods)
      .where(
        periodId
          ? eq(leaderboardPeriods.id, periodId)
          : eq(leaderboardPeriods.startsAt, leaderboardPeriod(now).startsAt),
      );
    if (periodId && !period)
      throw new NotFoundException({
        code: 'LEADERBOARD_PERIOD_NOT_FOUND',
        detail: 'Periode peringkat tidak ditemukan.',
      });
    return period;
  }
  async pvp(authorization: string | undefined, difficulty: Difficulty, periodId?: string) {
    return this.board(
      (await this.student(authorization)).id,
      'pvp',
      periodId,
      undefined,
      difficulty,
    );
  }
  async class(authorization?: string, classId?: string, periodId?: string) {
    return this.board((await this.student(authorization)).id, 'class', periodId, classId);
  }
  async activity(authorization?: string, periodId?: string) {
    return this.board((await this.student(authorization)).id, 'activity', periodId);
  }
  async periods(authorization: string | undefined, query: LeaderboardPeriodsQueryDto) {
    const student = await this.student(authorization);
    if (query.scope === 'pvp' && !query.difficulty)
      throw new BadRequestException({
        code: 'DIFFICULTY_REQUIRED',
        detail: 'Pilih kesulitan PvP.',
      });
    return getDatabase().db.transaction(async (tx) => {
      const member =
        query.scope === 'class' ? await this.membership(tx, student.id, query.classId) : undefined;
      const current = leaderboardPeriod(new Date());
      const exists =
        query.scope === 'class'
          ? sql`exists(select 1 from class_leaderboard_entries e where e.period_id=${leaderboardPeriods.id} and e.class_id=${member!.id}::uuid)`
          : query.scope === 'pvp'
            ? sql`exists(select 1 from pvp_leaderboard_entries e where e.period_id=${leaderboardPeriods.id} and e.difficulty=${query.difficulty} and (e.data_mode=${this.mode} or (${leaderboardPeriods.rankPolicyVersion} like 'legacy%' and e.data_mode='legacy')))`
            : sql`exists(select 1 from global_activity_leaderboard_entries e where e.period_id=${leaderboardPeriods.id})`;
      const periods = await tx
        .select()
        .from(leaderboardPeriods)
        .where(
          sql`(${leaderboardPeriods.status}='ARCHIVED' and ${exists}) or ${leaderboardPeriods.startsAt}=${current.startsAt.toISOString()}::timestamptz`,
        )
        .orderBy(desc(leaderboardPeriods.startsAt))
        .limit(52);
      return {
        periods: periods.map((p) => ({
          id: p.id,
          status: p.status,
          startsAt: p.startsAt.toISOString(),
          endsAt: p.endsAt.toISOString(),
          timezone: p.timezone,
        })),
      };
    });
  }
  private async board(
    studentId: string,
    scope: Scope,
    periodId?: string,
    classId?: string,
    difficulty?: Difficulty,
  ): Promise<LeaderboardDto> {
    return getDatabase().db.transaction(
      async (tx) => {
        const now = new Date();
        const member =
          scope === 'class' ? await this.membership(tx, studentId, classId) : undefined;
        const period = await this.period(tx, now, periodId);
        const interval = period ?? leaderboardPeriod(now);
        const archived = period?.status === 'ARCHIVED';
        const dataMode =
          archived && period.rankPolicyVersion.startsWith('legacy')
            ? ('legacy' as const)
            : this.mode;
        const pendingArchive = !!period && !archived && period.endsAt <= now;
      const disabled = scope === 'pvp' && pvpMode() === 'disabled' && !archived;
        const updatedAt = period?.projectedAt?.toISOString() ?? null;
        const available = !!updatedAt && !disabled && !pendingArchive;
        const hour = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
        const result: LeaderboardDto = {
          policyPending: disabled,
          available,
          reasonCode: disabled
            ? 'PVP_RUNTIME_ACTIVATION'
            : pendingArchive
              ? 'PERIOD_ARCHIVE_PENDING'
              : !updatedAt
                ? 'PROJECTION_PENDING'
                : null,
          classId: member?.id ?? null,
          className: member?.name ?? null,
          unit: scope === 'pvp' ? 'points' : 'xp',
          dataMode: scope === 'pvp' ? dataMode : 'activity',
          rankPolicyVersion: period?.rankPolicyVersion ?? 'dense-v1',
          period: {
            id: period?.id ?? null,
            status: period?.status ?? 'ACTIVE',
            startsAt: interval.startsAt.toISOString(),
            endsAt: interval.endsAt.toISOString(),
            timezone: 'Asia/Jakarta',
          },
          updatedAt,
          stale: !archived && (!updatedAt || Date.parse(updatedAt) < hour),
          nextUpdateAt: archived ? null : new Date(hour + 3_600_000).toISOString(),
          entries: [],
          ownEntry: null,
        };
        if (!period || pendingArchive || disabled) return result;
        const activityTable = member ? classLeaderboardEntries : globalActivityLeaderboardEntries;
        const table = scope === 'pvp' ? pvpLeaderboardEntries : activityTable;
        const points = scope === 'pvp' ? pvpLeaderboardEntries.bestPoints : activityTable.totalXp;
        const filter = and(
          eq(table.periodId, period.id),
          archived ? undefined : eq(users.status, 'ACTIVE'),
          scope === 'pvp'
            ? and(
                eq(pvpLeaderboardEntries.difficulty, difficulty!),
                eq(pvpLeaderboardEntries.dataMode, dataMode),
              )
            : undefined,
          member
            ? and(
                eq(classLeaderboardEntries.classId, member.id),
                archived
                  ? undefined
                  : sql`exists(select 1 from class_memberships m where m.class_id=${member.id}::uuid and m.student_user_id=${table.studentId} and m.left_at is null)`,
              )
            : undefined,
        );
        const ranked = tx.$with('ranked').as(
          tx
            .select({
              studentId: table.studentId,
              displayName: users.displayName,
              points,
              rank: archived
                ? sql<number>`${table.rank}`.as('rank')
                : sql<number>`dense_rank() over(order by ${points} desc)::int`.as('rank'),
              updatedAt: table.updatedAt,
            })
            .from(table)
            .innerJoin(users, eq(users.id, table.studentId))
            .where(filter),
        );
        const top = await tx
          .with(ranked)
          .select()
          .from(ranked)
          .orderBy(asc(ranked.rank), asc(ranked.studentId))
          .limit(10);
        const [own] = await tx
          .with(ranked)
          .select()
          .from(ranked)
          .where(eq(ranked.studentId, studentId))
          .limit(1);
        const map = (row: (typeof top)[number]) => ({
          studentId: row.studentId,
          displayName: row.displayName,
          points: Number(row.points),
          rank: row.rank,
        });
        if (archived && !updatedAt) {
          result.updatedAt =
            top[0]?.updatedAt.toISOString() ??
            own?.updatedAt.toISOString() ??
            period.archivedAt?.toISOString() ??
            null;
          result.available = true;
          result.reasonCode = null;
        }
        return { ...result, entries: top.map(map), ownEntry: own ? map(own) : null };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
}
