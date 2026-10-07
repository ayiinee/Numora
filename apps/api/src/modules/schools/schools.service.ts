import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  auditLogs,
  getDatabase,
  schools,
  users,
  teacherSchoolMemberships,
  teacherVerificationTokens,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { adminCapabilities } from '../identity/admin-capabilities';
import { generateTeacherToken, hashTeacherToken, teacherTokenHashes } from './teacher-token';

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && isUniqueViolation(error.cause);
};

const isTokenHashCollision = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  if (
    'code' in error &&
    error.code === '23505' &&
    (('constraint' in error && error.constraint === 'teacher_verification_tokens_hash_uq') ||
      ('constraint_name' in error &&
        error.constraint_name === 'teacher_verification_tokens_hash_uq'))
  )
    return true;
  return 'cause' in error && isTokenHashCollision(error.cause);
};

@Injectable()
export class SchoolsService {
  constructor(private readonly identity: IdentityService) {}

  private async role(authorization: string | undefined, role: 'TEACHER' | 'ADMIN') {
    const profile = await this.identity.me(authorization);
    if (
      profile.role !== role ||
      profile.status !== 'ACTIVE' ||
      (role === 'ADMIN' && !adminCapabilities(profile.adminRole).includes('OPERATIONS_MANAGE'))
    )
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', detail: 'Akses ditolak.' });
    return profile.id;
  }

  async listForTeacher(authorization?: string) {
    await this.role(authorization, 'TEACHER');
    const { db } = getDatabase();
    const items = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.status, 'ACTIVE'))
      .orderBy(schools.name);
    return { items };
  }

  async leaveSchool(authorization: string | undefined, schoolId: string) {
    const teacherId = await this.role(authorization, 'TEACHER');
    return getDatabase().db.transaction(async (tx) => {
      const ended = await tx
        .update(teacherSchoolMemberships)
        .set({ endedAt: sql`greatest(clock_timestamp(),${teacherSchoolMemberships.verifiedAt})` })
        .where(
          and(
            eq(teacherSchoolMemberships.teacherUserId, teacherId),
            eq(teacherSchoolMemberships.schoolId, schoolId),
            isNull(teacherSchoolMemberships.endedAt),
          ),
        )
        .returning({ id: teacherSchoolMemberships.id });
      if (ended.length)
        await tx.insert(auditLogs).values({
          actorUserId: teacherId,
          action: 'teacher_left_school',
          entityType: 'school',
          entityId: schoolId,
        });
      return { left: true };
    });
  }

  async verifyTeacher(authorization: string | undefined, schoolId: string, token: string) {
    const teacherId = await this.role(authorization, 'TEACHER');
    const { db } = getDatabase();
    try {
      return await db.transaction(async (tx) => {
        const [school] = await tx
          .select({ id: schools.id })
          .from(schools)
          .where(and(eq(schools.id, schoolId), eq(schools.status, 'ACTIVE')))
          .limit(1)
          .for('update');
        if (!school)
          throw new NotFoundException({
            code: 'SCHOOL_NOT_FOUND',
            detail: 'Sekolah tidak tersedia.',
          });
        const [existing] = await tx
          .select({ id: teacherSchoolMemberships.id })
          .from(teacherSchoolMemberships)
          .where(
            and(
              eq(teacherSchoolMemberships.teacherUserId, teacherId),
              isNull(teacherSchoolMemberships.endedAt),
            ),
          )
          .limit(1);
        if (existing)
          throw new ConflictException({
            code: 'ALREADY_VERIFIED',
            detail: 'Guru sudah terverifikasi pada sekolah.',
          });
        const now = new Date();
        const [consumed] = await tx
          .update(teacherVerificationTokens)
          .set({ usedAt: now, usedByUserId: teacherId })
          .where(
            and(
              eq(teacherVerificationTokens.schoolId, schoolId),
              inArray(teacherVerificationTokens.tokenHash, teacherTokenHashes(token)),
              isNull(teacherVerificationTokens.usedAt),
              isNull(teacherVerificationTokens.revokedAt),
              gt(teacherVerificationTokens.expiresAt, now),
            ),
          )
          .returning({ id: teacherVerificationTokens.id });
        if (!consumed)
          throw new ForbiddenException({
            code: 'INVALID_TEACHER_TOKEN',
            detail: 'Token tidak valid, kedaluwarsa, telah dipakai, atau dicabut.',
          });
        await tx.insert(teacherSchoolMemberships).values({
          teacherUserId: teacherId,
          schoolId,
          verificationTokenId: consumed.id,
        });
        await tx.insert(auditLogs).values({
          actorUserId: teacherId,
          action: 'teacher_verified',
          entityType: 'school',
          entityId: schoolId,
        });
        return { verified: true };
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'ALREADY_VERIFIED',
          detail: 'Guru sudah terverifikasi pada sekolah.',
        });
      throw error;
    }
  }

  async issueToken(authorization: string | undefined, schoolId: string) {
    const adminId = await this.role(authorization, 'ADMIN');
    return this.createToken(adminId, schoolId);
  }

  private async createToken(adminId: string, schoolId: string, replacedTokenId?: string) {
    const { db } = getDatabase();
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateTeacherToken();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 72 * 60 * 60 * 1000);
      try {
        const issued = await db.transaction(async (tx) => {
          // Serialize issuance/reissue/verification against school deactivation.
          const [school] = await tx
            .select({ id: schools.id })
            .from(schools)
            .where(and(eq(schools.id, schoolId), eq(schools.status, 'ACTIVE')))
            .limit(1)
            .for('update');
          if (!school)
            throw new NotFoundException({
              code: 'SCHOOL_NOT_FOUND',
              detail: 'Sekolah tidak tersedia.',
            });
          // A pre-marker HMAC digest identifies the same token as hmac-v1.
          // Check both encodings so an old token can never be reissued by collision.
          const [collision] = await tx
            .select({ id: teacherVerificationTokens.id })
            .from(teacherVerificationTokens)
            .where(inArray(teacherVerificationTokens.tokenHash, teacherTokenHashes(token)))
            .limit(1);
          if (collision) throw new TokenGenerationCollision();
          if (replacedTokenId) {
            const [revoked] = await tx
              .update(teacherVerificationTokens)
              .set({ revokedAt: createdAt })
              .where(
                and(
                  eq(teacherVerificationTokens.id, replacedTokenId),
                  eq(teacherVerificationTokens.schoolId, schoolId),
                  isNull(teacherVerificationTokens.usedAt),
                  isNull(teacherVerificationTokens.revokedAt),
                ),
              )
              .returning({ id: teacherVerificationTokens.id });
            if (!revoked)
              throw new ConflictException({
                code: 'TOKEN_NOT_REVOCABLE',
                detail: 'Token sudah dipakai, dicabut, atau tidak ditemukan.',
              });
          }
          const [created] = await tx
            .insert(teacherVerificationTokens)
            .values({
              schoolId,
              tokenHash: hashTeacherToken(token),
              createdByUserId: adminId,
              createdAt,
              expiresAt,
            })
            .returning({ id: teacherVerificationTokens.id });
          await tx.insert(auditLogs).values({
            actorUserId: adminId,
            action: replacedTokenId ? 'teacher_token_reissued' : 'teacher_token_issued',
            entityType: 'teacher_verification_token',
            entityId: created!.id,
            ...(replacedTokenId ? { metadata: { replacedTokenId } } : {}),
          });
          return created!;
        });
        return { id: issued.id, token, expiresAt: expiresAt.toISOString() };
      } catch (error) {
        if (!(error instanceof TokenGenerationCollision) && !isTokenHashCollision(error))
          throw error;
      }
    }
    throw new ServiceUnavailableException({
      code: 'TOKEN_GENERATION_UNAVAILABLE',
      detail: 'Token belum dapat dibuat. Coba lagi.',
    });
  }

  async listForAdmin(
    authorization?: string,
    query: { limit: number; offset: number; search?: string } = { limit: 20, offset: 0 },
  ) {
    await this.role(authorization, 'ADMIN');
    const { db } = getDatabase();
    const term = query.search?.trim().replace(/[\\%_]/g, '\\$&');
    const rows = await db
      .select({
        id: schools.id,
        code: schools.code,
        name: schools.name,
        address: schools.address,
        status: schools.status,
      })
      .from(schools)
      .where(
        term ? or(ilike(schools.name, `%${term}%`), ilike(schools.code, `%${term}%`)) : undefined,
      )
      .orderBy(schools.name, schools.id)
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async schoolForAdmin(authorization: string | undefined, id: string) {
    await this.role(authorization, 'ADMIN');
    const [row] = await getDatabase()
      .db.select({
        id: schools.id,
        code: schools.code,
        name: schools.name,
        address: schools.address,
        status: schools.status,
      })
      .from(schools)
      .where(eq(schools.id, id));
    if (!row) throw new NotFoundException('Sekolah tidak ditemukan.');
    return row;
  }

  async createSchool(
    authorization: string | undefined,
    code: string,
    name: string,
    address?: string,
  ) {
    const adminId = await this.role(authorization, 'ADMIN');
    const { db } = getDatabase();
    try {
      return await db.transaction(async (tx) => {
        const [school] = await tx
          .insert(schools)
          .values({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            address: address?.trim() || null,
          })
          .returning({
            id: schools.id,
            code: schools.code,
            name: schools.name,
            address: schools.address,
            status: schools.status,
          });
        await tx.insert(auditLogs).values({
          actorUserId: adminId,
          action: 'school_created',
          entityType: 'school',
          entityId: school!.id,
        });
        return school!;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException({
          code: 'SCHOOL_CODE_EXISTS',
          detail: 'Kode sekolah sudah digunakan.',
        });
      throw error;
    }
  }

  async updateSchool(
    authorization: string | undefined,
    schoolId: string,
    input: { name?: string; address?: string | null; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    const adminId = await this.role(authorization, 'ADMIN');
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [school] = await tx
        .update(schools)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schools.id, schoolId))
        .returning({
          id: schools.id,
          code: schools.code,
          name: schools.name,
          address: schools.address,
          status: schools.status,
        });
      if (!school)
        throw new NotFoundException({
          code: 'SCHOOL_NOT_FOUND',
          detail: 'Sekolah tidak ditemukan.',
        });
      await tx.insert(auditLogs).values({
        actorUserId: adminId,
        action: 'school_updated',
        entityType: 'school',
        entityId: schoolId,
        metadata: {
          nameChanged: input.name !== undefined,
          addressChanged: input.address !== undefined,
          status: input.status,
        },
      });
      return school;
    });
  }

  async listTokens(
    authorization: string | undefined,
    schoolId: string,
    query = { limit: 20, offset: 0 },
  ) {
    await this.role(authorization, 'ADMIN');
    const { db } = getDatabase();
    const items = await db
      .select({
        id: teacherVerificationTokens.id,
        expiresAt: teacherVerificationTokens.expiresAt,
        usedAt: teacherVerificationTokens.usedAt,
        revokedAt: teacherVerificationTokens.revokedAt,
        createdAt: teacherVerificationTokens.createdAt,
        usedByUserId: teacherVerificationTokens.usedByUserId,
        usedByName: users.displayName,
      })
      .from(teacherVerificationTokens)
      .leftJoin(users, eq(users.id, teacherVerificationTokens.usedByUserId))
      .where(eq(teacherVerificationTokens.schoolId, schoolId))
      .orderBy(desc(teacherVerificationTokens.createdAt), desc(teacherVerificationTokens.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: items.slice(0, query.limit).map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        status: row.usedAt
          ? 'USED'
          : row.revokedAt
            ? 'REVOKED'
            : row.expiresAt <= new Date()
              ? 'EXPIRED'
              : 'AVAILABLE',
      })),
      nextOffset: items.length > query.limit ? query.offset + query.limit : null,
    };
  }

  async revokeToken(authorization: string | undefined, schoolId: string, tokenId: string) {
    const adminId = await this.role(authorization, 'ADMIN');
    const { db } = getDatabase();
    return db.transaction(async (tx) => {
      const [revoked] = await tx
        .update(teacherVerificationTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(teacherVerificationTokens.id, tokenId),
            eq(teacherVerificationTokens.schoolId, schoolId),
            isNull(teacherVerificationTokens.usedAt),
            isNull(teacherVerificationTokens.revokedAt),
          ),
        )
        .returning({ id: teacherVerificationTokens.id });
      if (!revoked)
        throw new ConflictException({
          code: 'TOKEN_NOT_REVOCABLE',
          detail: 'Token sudah dipakai, dicabut, atau tidak ditemukan.',
        });
      await tx.insert(auditLogs).values({
        actorUserId: adminId,
        action: 'teacher_token_revoked',
        entityType: 'teacher_verification_token',
        entityId: tokenId,
      });
      return { revoked: true };
    });
  }

  async reissueToken(authorization: string | undefined, schoolId: string, tokenId: string) {
    const adminId = await this.role(authorization, 'ADMIN');
    return this.createToken(adminId, schoolId, tokenId);
  }
}

class TokenGenerationCollision extends Error {}
