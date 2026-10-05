import { ForbiddenException, Injectable } from '@nestjs/common';
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
import type { Difficulty } from '../pvp/pvp.policy';
import type { LeaderboardDto } from './leaderboards.dto';

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
  private period(now: Date) {
    const p = leaderboardPeriod(now);
    return {
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      timezone: 'Asia/Jakarta',
    };
  }
  async pvp(authorization: string | undefined, difficulty: Difficulty): Promise<LeaderboardDto> {
    const student = await this.student(authorization);
    const now = new Date();
    const period = this.period(now);
    const { db } = getDatabase();
    const [current] = await db
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.startsAt, new Date(period.startsAt)));
    const empty: LeaderboardDto = {
      policyPending: true,
      reasonCode: 'PVP_RUNTIME_ACTIVATION',
      className: null,
      unit: 'points',
      period,
      updatedAt: null,
      entries: [],
      ownEntry: null,
    };
    if (!current) return empty;
    const selection = {
      studentId: users.id,
      displayName: users.displayName,
      points: pvpLeaderboardEntries.bestPoints,
      rank: pvpLeaderboardEntries.rank,
      updatedAt: pvpLeaderboardEntries.updatedAt,
    };
    const scope = and(
      eq(pvpLeaderboardEntries.periodId, current.id),
      eq(pvpLeaderboardEntries.difficulty, difficulty),
      eq(users.status, 'ACTIVE'),
    );
    const [top, own] = await Promise.all([
      db
        .select(selection)
        .from(pvpLeaderboardEntries)
        .innerJoin(users, eq(users.id, pvpLeaderboardEntries.studentId))
        .where(scope)
        .orderBy(asc(pvpLeaderboardEntries.rank), asc(users.id))
        .limit(10),
      db
        .select(selection)
        .from(pvpLeaderboardEntries)
        .innerJoin(users, eq(users.id, pvpLeaderboardEntries.studentId))
        .where(and(scope, eq(users.id, student.id)))
        .limit(1),
    ]);
    const map = (r: (typeof top)[number]) => ({
      studentId: r.studentId,
      displayName: r.displayName,
      points: Number(r.points),
      rank: r.rank!,
    });
    return {
      ...empty,
      entries: top.map(map),
      ownEntry: own[0] ? map(own[0]) : null,
      updatedAt: top[0]?.updatedAt.toISOString() ?? own[0]?.updatedAt.toISOString() ?? null,
    };
  }
  async class(authorization?: string, classId?: string): Promise<LeaderboardDto> {
    const student = await this.student(authorization);
    const { db } = getDatabase();
    const [membership] = await db
      .select({ id: classes.id, name: classes.name })
      .from(classMemberships)
      .innerJoin(classes, eq(classes.id, classMemberships.classId))
      .where(
        and(
          eq(classMemberships.studentUserId, student.id),
          isNull(classMemberships.leftAt),
          isNull(classes.archivedAt),
          classId ? eq(classes.id, classId) : undefined,
        ),
      )
      .orderBy(desc(classMemberships.joinedAt), asc(classes.id))
      .limit(1);
    if (!membership)
      throw new ForbiddenException({
        code: 'CLASS_REQUIRED',
        detail: 'Bergabung ke kelas untuk mengakses peringkat kelas.',
      });
    return this.activityProjection(student.id, membership);
  }
  async activity(authorization?: string): Promise<LeaderboardDto> {
    return this.activityProjection((await this.student(authorization)).id);
  }
  private async activityProjection(
    studentId: string,
    membership?: { id: string; name: string },
  ): Promise<LeaderboardDto> {
    const period = this.period(new Date());
    const { db } = getDatabase();
    const [current] = await db
      .select()
      .from(leaderboardPeriods)
      .where(eq(leaderboardPeriods.startsAt, new Date(period.startsAt)));
    const result: LeaderboardDto = {
      policyPending: false,
      reasonCode: null,
      unit: 'xp',
      period,
      classId: membership?.id ?? null,
      className: membership?.name ?? null,
      updatedAt: null,
      entries: [],
      ownEntry: null,
    };
    if (!current) return result;
    const table = membership ? classLeaderboardEntries : globalActivityLeaderboardEntries;
    const scope = and(
      eq(table.periodId, current.id),
      eq(users.status, 'ACTIVE'),
      membership
        ? and(
            eq(classLeaderboardEntries.classId, membership.id),
            // Filter ended membership immediately, before the next hourly projection.
            sql`exists(select 1 from ${classMemberships} m where m.class_id=${membership.id}::uuid and m.student_user_id=${table.studentId} and m.left_at is null)`,
          )
        : undefined,
    );
    const query = () =>
      db
        .select({
          studentId: table.studentId,
          displayName: users.displayName,
          points: table.totalXp,
          rank: table.rank,
          updatedAt: table.updatedAt,
        })
        .from(table)
        .innerJoin(users, eq(users.id, table.studentId));
    const [top, own] = await Promise.all([
      query().where(scope).orderBy(asc(table.rank), asc(table.studentId)).limit(10),
      query()
        .where(and(scope, eq(table.studentId, studentId)))
        .limit(1),
    ]);
    const map = (row: (typeof top)[number]) => ({
      studentId: row.studentId,
      displayName: row.displayName,
      points: Number(row.points),
      rank: row.rank ?? 0,
    });
    return {
      ...result,
      updatedAt: top[0]?.updatedAt.toISOString() ?? own[0]?.updatedAt.toISOString() ?? null,
      entries: top.map(map),
      ownEntry: own[0] ? map(own[0]) : null,
    };
  }
}
