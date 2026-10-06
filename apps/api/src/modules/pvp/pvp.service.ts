import { ForbiddenException, Injectable } from '@nestjs/common';
import { classMemberships, getDatabase, pvpInvites, pvpMatches, users } from '@tka/database';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { PvpEngineService } from './pvp-engine.service';

@Injectable()
export class PvpService {
  constructor(
    private readonly identity: IdentityService,
    readonly engine: PvpEngineService,
  ) {}
  async student(authorization?: string) {
    const user = await this.identity.me(authorization);
    if (user.role !== 'STUDENT')
      throw new ForbiddenException({
        code: 'STUDENT_REQUIRED',
        detail: 'Akses Student diperlukan.',
      });
    return user;
  }
  async availability(authorization?: string) {
    const student = await this.student(authorization);
    return this.engine.availability(student.id);
  }
  async classmates(authorization?: string) {
    const student = await this.student(authorization);
    const { db } = getDatabase();
    const memberships = await db
      .select()
      .from(classMemberships)
      .where(and(eq(classMemberships.studentUserId, student.id), isNull(classMemberships.leftAt)));
    if (!memberships.length) return { classmates: [] };
    const rows = await db
      .selectDistinct({ studentId: users.id, displayName: users.displayName })
      .from(classMemberships)
      .innerJoin(users, eq(users.id, classMemberships.studentUserId))
      .where(
        and(
          inArray(
            classMemberships.classId,
            memberships.map((m) => m.classId),
          ),
          isNull(classMemberships.leftAt),
          eq(users.status, 'ACTIVE'),
          eq(users.role, 'STUDENT'),
        ),
      )
      .orderBy(asc(users.displayName));
    return { classmates: rows.filter((row) => row.studentId !== student.id) };
  }
  async invitations(authorization?: string) {
    const student = await this.student(authorization);
    const { db } = getDatabase();
    const memberships = await db
      .select()
      .from(classMemberships)
      .where(and(eq(classMemberships.studentUserId, student.id), isNull(classMemberships.leftAt)));
    if (!memberships.length) return { invites: [] };
    const rows = await db
      .select({
        id: pvpInvites.id,
        matchId: pvpMatches.id,
        roomCode: pvpMatches.roomCode,
        senderName: users.displayName,
        expiresAt: pvpInvites.expiresAt,
      })
      .from(pvpInvites)
      .innerJoin(pvpMatches, eq(pvpMatches.id, pvpInvites.matchId))
      .innerJoin(users, eq(users.id, pvpInvites.senderStudentId))
      .innerJoin(
        classMemberships,
        and(
          eq(classMemberships.studentUserId, pvpInvites.senderStudentId),
          eq(classMemberships.classId, pvpInvites.classIdAtInvite),
          isNull(classMemberships.leftAt),
        ),
      )
      .where(
        and(
          eq(pvpInvites.recipientStudentId, student.id),
          inArray(
            pvpInvites.classIdAtInvite,
            memberships.map((m) => m.classId),
          ),
          eq(pvpInvites.status, 'PENDING'),
          gt(pvpInvites.expiresAt, new Date()),
          inArray(pvpMatches.status, ['WAITING']),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(pvpInvites.createdAt));
    return {
      invites: rows.map((row) => ({ ...row, expiresAt: row.expiresAt?.toISOString() ?? null })),
    };
  }
  async result(authorization: string | undefined, matchId: string) {
    const student = await this.student(authorization);
    return this.engine.snapshot(student.id, matchId);
  }
}
