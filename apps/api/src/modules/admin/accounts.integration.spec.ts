import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  adminInvitations,
  adminRecoveryOperations,
  auditLogs,
  closeDatabaseConnection,
  getDatabase,
  users,
} from '@tka/database';
import { and, eq } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import { AdminAccountsService } from './accounts.service';
import { AdminAuthProvider } from './admin-auth.provider';
import { IdentityService } from '../identity/identity.service';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('durable admin provisioning in PostgreSQL', () => {
  const url = process.env.TEST_DATABASE_URL;
  const databaseName = `numora_test_admin_${randomUUID().replaceAll('-', '')}`;
  let operator: ReturnType<typeof postgres> | undefined;
  let databaseUrl: string;
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      !/^\/numora_test(?:_[a-z0-9_]+)?$/.test(target.pathname)
    )
      throw new Error('Admin integration requires isolated localhost numora_test.');
    operator = postgres(url!, { max: 1 });
    await operator.unsafe(`CREATE DATABASE ${databaseName}`);
    target.pathname = '/' + databaseName;
    databaseUrl = target.toString();
    const migrationClient = postgres(databaseUrl, { max: 1 });
    try {
      await migrate(drizzle(migrationClient), {
        migrationsFolder: resolve(process.cwd(), '../../packages/database/drizzle'),
      });
    } finally {
      await migrationClient.end();
    }
  }, 60_000);
  afterAll(async () => {
    await closeDatabaseConnection();
    if (operator) {
      await operator.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);
      await operator.end();
    }
  });
  const setup = async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { db } = getDatabase();
    const suffix = randomUUID();
    const [superAdmin] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        email: `super-${suffix}@example.test`,
        displayName: 'Super',
        role: 'ADMIN',
        adminRole: 'SUPER_ADMIN',
      })
      .returning();
    const auth = {
      id: randomUUID(),
      email: `invite-${suffix}@example.test`,
      email_confirmed_at: new Date().toISOString(),
      user_metadata: { adminRole: 'SUPER_ADMIN' },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User;
    const invite = vi.fn(async () => auth);
    const recover = vi.fn(async () => undefined);
    const service = new AdminAccountsService(
      { invite, recover } as unknown as AdminAuthProvider,
      { authenticate: async () => auth } as unknown as IdentityService,
    );
    return { db, superAdmin: superAdmin!, auth, invite, recover, service };
  };
  it('reserves before sending, provisions once, accepts stored role, and never reactivates on acceptance replay', async () => {
    const { db, superAdmin, auth, invite, service } = await setup();
    invite.mockImplementation(async () => {
      const [reserved] = await db
        .select()
        .from(adminInvitations)
        .where(eq(adminInvitations.email, auth.email!));
      expect(reserved?.status).toBe('SENDING');
      return auth;
    });
    const payload = {
      email: auth.email!,
      displayName: 'Operations',
      adminRole: 'OPERATIONS' as const,
    };
    const key = randomUUID();
    const first = await service.invite(superAdmin.id, key, payload);
    expect(first.status).toBe('INVITED');
    expect((await service.invite(superAdmin.id, key, payload)).id).toBe(first.id);
    expect(invite).toHaveBeenCalledTimes(1);
    await expect(
      service.invite(superAdmin.id, key, { ...payload, adminRole: 'SUPER_ADMIN' }),
    ).rejects.toMatchObject({ status: 409 });
    const account = await service.accept('Bearer test');
    expect(account).toMatchObject({ status: 'ACTIVE', adminRole: 'OPERATIONS' });
    await service.update(superAdmin.id, account.id, { status: 'DISABLED' });
    expect(await service.accept('Bearer test')).toMatchObject({
      status: 'DISABLED',
      adminRole: 'OPERATIONS',
    });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityId, first.id), eq(auditLogs.action, 'admin.invitation.accepted')),
      );
    expect(logs).toHaveLength(1);
  });
  it('reconciles provider success followed by database failure without creating duplicate profiles', async () => {
    const { db, superAdmin, auth, invite, service } = await setup();
    const originalId = auth.id;
    invite.mockImplementationOnce(async () => ({ ...auth, id: 'invalid-provider-uuid' }));
    await expect(
      service.invite(superAdmin.id, randomUUID(), {
        email: auth.email!,
        displayName: 'Content',
        adminRole: 'CONTENT_DATA_MODERATION',
      }),
    ).rejects.toThrow();
    const [failed] = await db
      .select()
      .from(adminInvitations)
      .where(eq(adminInvitations.email, auth.email!));
    expect(failed!.status).toBe('FAILED');
    expect(await service.retry(superAdmin.id, failed!.id)).toMatchObject({ status: 'INVITED' });
    expect(await db.select().from(users).where(eq(users.email, auth.email!))).toHaveLength(1);
    expect((await db.select().from(users).where(eq(users.email, auth.email!)))[0]!.authUserId).toBe(
      originalId,
    );
  });
  it('does not adopt existing profiles and rejects cancelled invitations', async () => {
    const { db, superAdmin, auth, invite, service } = await setup();
    await db.insert(users).values({
      authUserId: randomUUID(),
      role: 'STUDENT',
      displayName: 'Student',
      email: auth.email!,
    });
    await expect(
      service.invite(superAdmin.id, randomUUID(), {
        email: auth.email!,
        displayName: 'Admin',
        adminRole: 'OPERATIONS',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(invite).not.toHaveBeenCalled();
    auth.email = `other-${randomUUID()}@example.test`;
    const invitation = await service.invite(superAdmin.id, randomUUID(), {
      email: auth.email!,
      displayName: 'Admin',
      adminRole: 'OPERATIONS',
    });
    await expect(
      service.update(superAdmin.id, invitation.userId!, { status: 'ACTIVE' }),
    ).rejects.toMatchObject({ status: 409 });
    await service.cancel(superAdmin.id, invitation.id);
    await expect(service.accept('Bearer test')).rejects.toMatchObject({ status: 403 });
  });
  it('serializes simultaneous removal of the last two active Super Admins', async () => {
    const { db, superAdmin, service } = await setup();
    // Isolate this invariant from Super fixtures created by earlier tests.
    await db
      .update(users)
      .set({ status: 'DISABLED' })
      .where(and(eq(users.role, 'ADMIN'), eq(users.adminRole, 'SUPER_ADMIN')));
    await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, superAdmin.id));
    const [second] = await db
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'ADMIN',
        adminRole: 'SUPER_ADMIN',
        email: `second-${randomUUID()}@example.test`,
        displayName: 'Second',
      })
      .returning();
    const changes = await Promise.allSettled([
      service.update(superAdmin.id, superAdmin.id, { status: 'DISABLED' }),
      service.update(second!.id, second!.id, { adminRole: 'OPERATIONS' }),
    ]);
    expect(changes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(changes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const remaining = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, 'ADMIN'),
          eq(users.status, 'ACTIVE'),
          eq(users.adminRole, 'SUPER_ADMIN'),
        ),
      );
    expect(remaining).toHaveLength(1);
  });
  it('persists recovery before provider contact, retries failure, and rejects replay for another target', async () => {
    const { db, superAdmin, auth, service, recover } = await setup();
    const invitation = await service.invite(superAdmin.id, randomUUID(), {
      email: auth.email!,
      displayName: 'Pending',
      adminRole: 'OPERATIONS',
    });
    const key = randomUUID();
    recover.mockImplementationOnce(async () => {
      const [row] = await db
        .select()
        .from(adminRecoveryOperations)
        .where(eq(adminRecoveryOperations.idempotencyKey, key));
      expect(row!.status).toBe('SENDING');
      throw new Error('test provider unavailable');
    });
    await expect(service.recover(superAdmin.id, invitation.userId!, key)).rejects.toThrow();
    const sent = await service.recover(superAdmin.id, invitation.userId!, key);
    expect(sent.status).toBe('SENT');
    expect(await service.recover(superAdmin.id, invitation.userId!, key)).toEqual(sent);
    expect(recover).toHaveBeenCalledTimes(2);
    await expect(service.recover(superAdmin.id, superAdmin.id, key)).rejects.toMatchObject({
      status: 409,
    });
  });
});
