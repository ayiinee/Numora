import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { ContentAdminGuard } from './content-admin.guard';
import { IdentityService } from './identity.service';
import type { Reflector } from '@nestjs/core';

const makeContext = () => {
  const request: { headers: { authorization?: string }; adminId?: string; adminRole?: string } = {
    headers: { authorization: 'token' },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
  return { context, request };
};

const makeIdentity = (adminRole: string | null, status = 'ACTIVE') =>
  ({
    me: vi.fn().mockResolvedValue({
      id: 'admin-id',
      role: 'ADMIN',
      status,
      adminRole,
    }),
  }) as unknown as IdentityService;

const makeGuard = (adminRole: string | null, status = 'ACTIVE', permission = 'content') =>
  new AdminGuard(makeIdentity(adminRole, status), {
    getAllAndOverride: vi.fn().mockReturnValue(permission),
  } as unknown as Reflector);

describe('Admin role guards', () => {
  it('authorizes active assigned Admins using the declared permission', async () => {
    const { context, request } = makeContext();
    await expect(makeGuard('CONTENT_DATA_MODERATION').canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({
      adminId: 'admin-id',
      adminRole: 'CONTENT_DATA_MODERATION',
    });
    await expect(
      makeGuard('OPERATIONS', 'ACTIVE', 'operations').canActivate(context),
    ).resolves.toBe(true);
    await expect(
      makeGuard('OPERATIONS', 'ACTIVE', 'content').canActivate(makeContext().context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      makeGuard('CONTENT_DATA_MODERATION', 'ACTIVE', 'schoolRead').canActivate(
        makeContext().context,
      ),
    ).resolves.toBe(true);
    await expect(makeGuard(null).canActivate(makeContext().context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      makeGuard('OPERATIONS', 'DISABLED', 'operations').canActivate(makeContext().context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts content and audit routes using the central permission policy', async () => {
    const contentGuard = new ContentAdminGuard(makeIdentity('CONTENT_DATA_MODERATION'));
    await expect(contentGuard.canActivate(makeContext().context)).resolves.toBe(true);
    await expect(
      new ContentAdminGuard(makeIdentity('SUPER_ADMIN')).canActivate(makeContext().context),
    ).resolves.toBe(true);
    await expect(
      new ContentAdminGuard(makeIdentity('OPERATIONS')).canActivate(makeContext().context),
    ).rejects.toMatchObject({
      response: { code: 'CONTENT_PERMISSION_REQUIRED' },
    });

    await expect(
      makeGuard('SUPER_ADMIN', 'ACTIVE', 'audit').canActivate(makeContext().context),
    ).resolves.toBe(true);
    await expect(
      makeGuard('OPERATIONS', 'ACTIVE', 'audit').canActivate(makeContext().context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
