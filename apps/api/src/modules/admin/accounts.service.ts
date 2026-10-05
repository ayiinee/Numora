import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  adminInvitations,
  adminRecoveryOperations,
  auditLogs,
  getDatabase,
  users,
} from '@tka/database';
import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { IdentityService } from '../identity/identity.service';
import { AdminAuthProvider } from './admin-auth.provider';
import type { AdminAccountQueryDto, InviteAdminDto, UpdateAdminAccountDto } from './accounts.dto';

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]
>[0];
const conflict = (code: string, detail: string) => new ConflictException({ code, detail });
const invitationDto = (row: typeof adminInvitations.$inferSelect) => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  targetRole: row.targetRole,
  status: row.status,
  userId: row.userId,
  failureCode: row.failureCode,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
const accountDto = (row: typeof users.$inferSelect) => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  adminRole: row.adminRole,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class AdminAccountsService {
  constructor(
    @Inject(AdminAuthProvider) private readonly provider: AdminAuthProvider,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}
  private async lock(tx: Transaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(61720261005)`);
  }
  private async requireSuper(tx: Transaction, actor: string) {
    const [row] = await tx.select().from(users).where(eq(users.id, actor));
    if (!row || row.role !== 'ADMIN' || row.status !== 'ACTIVE' || row.adminRole !== 'SUPER_ADMIN')
      throw new ForbiddenException({
        code: 'ADMIN_PERMISSION_REQUIRED',
        detail: 'Super Admin aktif diperlukan.',
      });
  }
  async accounts(query: AdminAccountQueryDto) {
    const rows = await getDatabase()
      .db.select()
      .from(users)
      .where(
        and(
          eq(users.role, 'ADMIN'),
          query.search
            ? or(
                ilike(users.email, `%${query.search}%`),
                ilike(users.displayName, `%${query.search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map(accountDto),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async account(id: string) {
    const [row] = await getDatabase()
      .db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, 'ADMIN')));
    if (!row) throw new NotFoundException('Admin tidak ditemukan.');
    return accountDto(row);
  }
  async update(actor: string, id: string, input: UpdateAdminAccountDto) {
    if (!input.adminRole && !input.status) throw new BadRequestException('Perubahan diperlukan.');
    return getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      await this.requireSuper(tx, actor);
      const [row] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.role, 'ADMIN')));
      if (!row) throw new NotFoundException('Admin tidak ditemukan.');
      const [pending] = await tx
        .select()
        .from(adminInvitations)
        .where(
          and(
            eq(adminInvitations.userId, id),
            ne(adminInvitations.status, 'ACCEPTED'),
            ne(adminInvitations.status, 'CANCELLED'),
          ),
        );
      if (pending)
        throw conflict(
          'ADMIN_INVITATION_PENDING',
          'Terima atau batalkan invite sebelum mengubah akun.',
        );
      const next = {
        adminRole: input.adminRole ?? row.adminRole,
        status: input.status ?? row.status,
      };
      if (
        row.status === 'ACTIVE' &&
        row.adminRole === 'SUPER_ADMIN' &&
        (next.status !== 'ACTIVE' || next.adminRole !== 'SUPER_ADMIN')
      ) {
        const remaining = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.role, 'ADMIN'),
              eq(users.status, 'ACTIVE'),
              eq(users.adminRole, 'SUPER_ADMIN'),
              ne(users.id, id),
            ),
          )
          .limit(1);
        if (!remaining.length)
          throw conflict('LAST_SUPER_ADMIN', 'Super Admin aktif terakhir harus dipertahankan.');
      }
      if (next.adminRole === row.adminRole && next.status === row.status) return accountDto(row);
      const [updated] = await tx
        .update(users)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'admin.account.updated',
        entityType: 'admin_account',
        entityId: id,
        metadata: { before: { adminRole: row.adminRole, status: row.status }, after: next },
      });
      return accountDto(updated!);
    });
  }
  async invitations(query: AdminAccountQueryDto) {
    const rows = await getDatabase()
      .db.select()
      .from(adminInvitations)
      .where(query.search ? ilike(adminInvitations.email, `%${query.search}%`) : undefined)
      .orderBy(desc(adminInvitations.createdAt), desc(adminInvitations.id))
      .limit(query.limit + 1)
      .offset(query.offset);
    return {
      items: rows.slice(0, query.limit).map(invitationDto),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    };
  }
  async invite(actor: string, key: string | undefined, input: InviteAdminDto) {
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        detail: 'Idempotency-Key 16–128 karakter diperlukan.',
      });
    const email = input.email.trim().toLowerCase(),
      displayName = input.displayName.trim();
    const id = await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      await this.requireSuper(tx, actor);
      const [existing] = await tx
        .select()
        .from(adminInvitations)
        .where(
          and(eq(adminInvitations.actorUserId, actor), eq(adminInvitations.idempotencyKey, key)),
        );
      if (existing) {
        if (
          existing.email !== email ||
          existing.displayName !== displayName ||
          existing.targetRole !== input.adminRole
        )
          throw conflict('IDEMPOTENCY_CONFLICT', 'Key sudah digunakan untuk payload lain.');
        return existing.id;
      }
      const [profile] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      const [other] = await tx
        .select({ id: adminInvitations.id })
        .from(adminInvitations)
        .where(and(eq(adminInvitations.email, email), ne(adminInvitations.status, 'CANCELLED')));
      if (profile || other)
        throw conflict(
          'ADMIN_IDENTITY_CONFLICT',
          'Email sudah memiliki profil atau operasi invite.',
        );
      const [reserved] = await tx
        .insert(adminInvitations)
        .values({
          actorUserId: actor,
          idempotencyKey: key,
          email,
          displayName,
          targetRole: input.adminRole,
        })
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'admin.invitation.reserved',
        entityType: 'admin_invitation',
        entityId: reserved!.id,
      });
      return reserved!.id;
    });
    return this.retry(actor, id);
  }
  async retry(actor: string, id: string) {
    const claimed = await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      await this.requireSuper(tx, actor);
      const [row] = await tx.select().from(adminInvitations).where(eq(adminInvitations.id, id));
      if (!row) throw new NotFoundException('Invite tidak ditemukan.');
      if (['INVITED', 'ACCEPTED', 'CANCELLED'].includes(row.status)) return { row, send: false };
      if (row.status === 'SENDING' && row.leaseUntil && row.leaseUntil > new Date())
        return { row, send: false };
      const [updated] = await tx
        .update(adminInvitations)
        .set({
          status: 'SENDING',
          failureCode: null,
          leaseUntil: new Date(Date.now() + 600_000),
          updatedAt: new Date(),
        })
        .where(eq(adminInvitations.id, id))
        .returning();
      return { row: updated!, send: true };
    });
    if (!claimed.send) return invitationDto(claimed.row);
    try {
      const auth = await this.provider.invite(claimed.row.email, id);
      if (auth.email?.toLowerCase() !== claimed.row.email)
        throw conflict('ADMIN_AUTH_IDENTITY_CONFLICT', 'Identitas provider tidak sesuai.');
      return await getDatabase().db.transaction(async (tx) => {
        await this.lock(tx);
        const [row] = await tx.select().from(adminInvitations).where(eq(adminInvitations.id, id));
        if (
          !row ||
          row.status !== 'SENDING' ||
          row.leaseUntil?.getTime() !== claimed.row.leaseUntil?.getTime()
        )
          throw conflict(
            'ADMIN_INVITE_RECONCILIATION_REQUIRED',
            'Operasi berubah selama pengiriman; retry operasi yang sama.',
          );
        const profiles = await tx
          .select()
          .from(users)
          .where(or(eq(users.authUserId, auth.id), sql`lower(${users.email}) = ${row.email}`));
        if (
          profiles.length &&
          !(
            profiles.length === 1 &&
            profiles[0]!.id === row.userId &&
            profiles[0]!.authUserId === auth.id &&
            profiles[0]!.role === 'ADMIN'
          )
        )
          throw conflict(
            'ADMIN_IDENTITY_CONFLICT',
            'Profil existing tidak boleh diubah menjadi Admin.',
          );
        const profile =
          profiles[0] ??
          (
            await tx
              .insert(users)
              .values({
                authUserId: auth.id,
                email: row.email,
                displayName: row.displayName,
                role: 'ADMIN',
                adminRole: null,
                status: 'DISABLED',
              })
              .returning()
          )[0]!;
        const [updated] = await tx
          .update(adminInvitations)
          .set({
            status: 'INVITED',
            authUserId: auth.id,
            userId: profile.id,
            leaseUntil: null,
            failureCode: null,
            updatedAt: new Date(),
          })
          .where(eq(adminInvitations.id, id))
          .returning();
        await tx.insert(auditLogs).values({
          actorUserId: actor,
          action: 'admin.invitation.provisioned',
          entityType: 'admin_invitation',
          entityId: id,
        });
        return invitationDto(updated!);
      });
    } catch (error) {
      const response =
        error instanceof ConflictException || error instanceof ServiceUnavailableException
          ? error.getResponse()
          : null;
      const code =
        typeof response === 'object' &&
        response &&
        'code' in response &&
        typeof response.code === 'string'
          ? response.code
          : 'ADMIN_INVITE_RECONCILIATION_REQUIRED';
      // Provider response and credentials are never persisted in the operation or audit.
      await getDatabase()
        .db.update(adminInvitations)
        .set({ status: 'FAILED', failureCode: code, leaseUntil: null, updatedAt: new Date() })
        .where(
          and(
            eq(adminInvitations.id, id),
            eq(adminInvitations.status, 'SENDING'),
            eq(adminInvitations.leaseUntil, claimed.row.leaseUntil!),
          ),
        );
      throw error;
    }
  }
  async cancel(actor: string, id: string) {
    return getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      await this.requireSuper(tx, actor);
      const [row] = await tx.select().from(adminInvitations).where(eq(adminInvitations.id, id));
      if (!row) throw new NotFoundException('Invite tidak ditemukan.');
      if (row.status === 'ACCEPTED')
        throw conflict('ADMIN_INVITATION_ACCEPTED', 'Kelola status akun yang telah diterima.');
      if (row.status === 'CANCELLED') return invitationDto(row);
      if (row.userId)
        await tx
          .update(users)
          .set({ status: 'DISABLED', adminRole: null, updatedAt: new Date() })
          .where(and(eq(users.id, row.userId), eq(users.role, 'ADMIN')));
      const [updated] = await tx
        .update(adminInvitations)
        .set({ status: 'CANCELLED', leaseUntil: null, updatedAt: new Date() })
        .where(eq(adminInvitations.id, id))
        .returning();
      await tx.insert(auditLogs).values({
        actorUserId: actor,
        action: 'admin.invitation.cancelled',
        entityType: 'admin_invitation',
        entityId: id,
      });
      return invitationDto(updated!);
    });
  }
  async accept(authorization?: string) {
    const auth = await this.identity.authenticate(authorization);
    if (!auth.email || !auth.email_confirmed_at)
      throw new ForbiddenException('Email terverifikasi diperlukan.');
    return getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      const [row] = await tx
        .select()
        .from(adminInvitations)
        .where(
          and(
            eq(adminInvitations.authUserId, auth.id),
            eq(adminInvitations.email, auth.email!.toLowerCase()),
            ne(adminInvitations.status, 'CANCELLED'),
          ),
        );
      if (!row || !row.userId)
        throw new ForbiddenException({
          code: 'ADMIN_INVITATION_REQUIRED',
          detail: 'Invite belum diprovision atau telah dibatalkan.',
        });
      const [profile] = await tx
        .select()
        .from(users)
        .where(
          and(eq(users.id, row.userId), eq(users.authUserId, auth.id), eq(users.role, 'ADMIN')),
        );
      if (!profile) throw conflict('ADMIN_IDENTITY_CONFLICT', 'Profil tidak sesuai invite.');
      if (row.status === 'ACCEPTED') return accountDto(profile); // Never re-enable an account on replay.
      if (row.status !== 'INVITED')
        throw conflict('ADMIN_INVITE_NOT_READY', 'Provisioning belum selesai.');
      const [updated] = await tx
        .update(users)
        .set({ status: 'ACTIVE', adminRole: row.targetRole, updatedAt: new Date() })
        .where(eq(users.id, profile.id))
        .returning();
      await tx
        .update(adminInvitations)
        .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(adminInvitations.id, row.id));
      await tx.insert(auditLogs).values({
        actorUserId: profile.id,
        action: 'admin.invitation.accepted',
        entityType: 'admin_invitation',
        entityId: row.id,
      });
      return accountDto(updated!);
    });
  }
  async acceptanceStatus(authorization?: string) {
    const auth = await this.identity.authenticate(authorization);
    const [row] = await getDatabase()
      .db.select()
      .from(adminInvitations)
      .where(
        and(
          eq(adminInvitations.authUserId, auth.id),
          eq(adminInvitations.email, auth.email?.toLowerCase() ?? ''),
          ne(adminInvitations.status, 'CANCELLED'),
        ),
      );
    if (!row) throw new ForbiddenException('Invite tidak ditemukan.');
    return invitationDto(row);
  }
  async recover(actor: string, userId: string, key?: string) {
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new BadRequestException('Idempotency-Key diperlukan.');
    const claim = await getDatabase().db.transaction(async (tx) => {
      await this.lock(tx);
      await this.requireSuper(tx, actor);
      const [account] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.role, 'ADMIN')));
      if (!account) throw new NotFoundException('Admin tidak ditemukan.');
      const [pending] = await tx
        .select()
        .from(adminInvitations)
        .where(and(eq(adminInvitations.userId, userId), eq(adminInvitations.status, 'INVITED')));
      if (account.status !== 'ACTIVE' && !pending)
        throw conflict('ADMIN_RECOVERY_DISABLED', 'Aktifkan akun sebelum meminta recovery.');
      let [row] = await tx
        .select()
        .from(adminRecoveryOperations)
        .where(
          and(
            eq(adminRecoveryOperations.actorUserId, actor),
            eq(adminRecoveryOperations.idempotencyKey, key),
          ),
        );
      if (row && row.userId !== userId)
        throw conflict('IDEMPOTENCY_CONFLICT', 'Key sudah digunakan untuk akun lain.');
      if (!row) {
        [row] = await tx
          .insert(adminRecoveryOperations)
          .values({ actorUserId: actor, userId, idempotencyKey: key })
          .returning();
        await tx
          .insert(auditLogs)
          .values({
            actorUserId: actor,
            action: 'admin.recovery.reserved',
            entityType: 'admin_account',
            entityId: userId,
            metadata: { operationId: row!.id },
          });
      }
      if (
        row!.status === 'SENT' ||
        (row!.status === 'SENDING' && row!.leaseUntil && row!.leaseUntil > new Date())
      )
        return { row: row!, account, send: false };
      const [updated] = await tx
        .update(adminRecoveryOperations)
        .set({
          status: 'SENDING',
          leaseUntil: new Date(Date.now() + 600_000),
          failureCode: null,
          updatedAt: new Date(),
        })
        .where(eq(adminRecoveryOperations.id, row!.id))
        .returning();
      return { row: updated!, account, send: true };
    });
    if (!claim.send)
      return { id: claim.row.id, status: claim.row.status, failureCode: claim.row.failureCode };
    try {
      await this.provider.recover(claim.account.email);
      const [row] = await getDatabase().db.transaction(async (tx) => {
        const updated = await tx
          .update(adminRecoveryOperations)
          .set({ status: 'SENT', leaseUntil: null, updatedAt: new Date() })
          .where(
            and(
              eq(adminRecoveryOperations.id, claim.row.id),
              eq(adminRecoveryOperations.status, 'SENDING'),
              eq(adminRecoveryOperations.leaseUntil, claim.row.leaseUntil!),
            ),
          )
          .returning();
        if (updated.length)
          await tx
            .insert(auditLogs)
            .values({
              actorUserId: actor,
              action: 'admin.recovery.sent',
              entityType: 'admin_account',
              entityId: userId,
              metadata: { operationId: claim.row.id },
            });
        return updated;
      });
      if (!row)
        throw conflict(
          'ADMIN_RECOVERY_RECONCILIATION_REQUIRED',
          'Operasi berubah; retry key yang sama.',
        );
      return { id: row.id, status: row.status, failureCode: row.failureCode };
    } catch (error) {
      await getDatabase()
        .db.update(adminRecoveryOperations)
        .set({
          status: 'FAILED',
          failureCode: 'ADMIN_RECOVERY_DELIVERY_UNCONFIRMED',
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adminRecoveryOperations.id, claim.row.id),
            eq(adminRecoveryOperations.status, 'SENDING'),
            eq(adminRecoveryOperations.leaseUntil, claim.row.leaseUntil!),
          ),
        );
      throw error;
    }
  }
}
