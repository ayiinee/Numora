import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from './admin.guard';
import { ContentAdminGuard } from './content-admin.guard';
import type { IdentityService } from './identity.service';
import { ADMIN_CAPABILITY_METADATA, type AdminCapability } from './admin-capabilities';

function context() {
  const request = { headers: { authorization: 'Bearer fixture' } };
  const setHeader = vi.fn();
  const handler = () => undefined;
  class Controller {}
  const execution = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
  return { request, setHeader, execution, handler, Controller };
}

function identity(adminRole: string | null, role = 'ADMIN', status = 'ACTIVE') {
  return {
    me: vi.fn().mockResolvedValue({
      id: 'fixture-admin',
      role,
      status,
      adminRole,
      // A stale or forged capability array must never override the server assignment.
      capabilities: ['ADMIN_ACCOUNTS_MANAGE', 'OPERATIONS_MANAGE', 'CONTENT_MANAGE'],
    }),
  } as unknown as IdentityService;
}

function guard(adminRole: string | null, capability?: AdminCapability) {
  const getAllAndOverride = vi.fn().mockReturnValue(capability);
  return {
    instance: new AdminGuard(identity(adminRole), { getAllAndOverride } as unknown as Reflector),
    getAllAndOverride,
  };
}

describe('current Admin assignment guards reconciled from PR 80', () => {
  it.each([
    ['SUPER_ADMIN', 'ADMIN_ACCOUNTS_MANAGE'],
    ['OPERATIONS', 'OPERATIONS_MANAGE'],
    ['CONTENT_DATA_MODERATION', 'CONTENT_MANAGE'],
  ] as const)('sets canonical role context and header for %s', async (role, capability) => {
    const fixture = context();
    const subject = guard(role, capability);
    await expect(subject.instance.canActivate(fixture.execution)).resolves.toBe(true);
    expect(fixture.request).toMatchObject({ adminId: 'fixture-admin', adminRole: role });
    expect(fixture.setHeader).toHaveBeenCalledWith('X-Numora-Admin-Role', role);
    expect(subject.getAllAndOverride).toHaveBeenCalledWith(ADMIN_CAPABILITY_METADATA, [
      fixture.handler,
      fixture.Controller,
    ]);
  });

  it.each(['OPERATIONS', 'CONTENT_DATA_MODERATION', null])(
    'denies undeclared routes by default for %s despite claimed browser capabilities',
    async (role) => {
      const fixture = context();
      await expect(guard(role).instance.canActivate(fixture.execution)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fixture.setHeader).not.toHaveBeenCalled();
      expect(fixture.request).not.toHaveProperty('adminId');
    },
  );

  it('uses account management as the default capability for an assigned Super Admin', async () => {
    await expect(guard('SUPER_ADMIN').instance.canActivate(context().execution)).resolves.toBe(
      true,
    );
  });

  it.each([
    ['OPERATIONS', 'CONTENT_MANAGE'],
    ['CONTENT_DATA_MODERATION', 'OPERATIONS_MANAGE'],
  ] as const)('does not cross-grant %s the %s capability', async (role, capability) => {
    await expect(
      guard(role, capability).instance.canActivate(context().execution),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([null, 'toString', '__proto__', 'unknown'])(
    'rejects unknown assignment %s in both guards',
    async (role) => {
      for (const subject of [
        guard(role, 'CONTENT_MANAGE').instance,
        new ContentAdminGuard(identity(role)),
      ]) {
        const fixture = context();
        await expect(subject.canActivate(fixture.execution)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(fixture.setHeader).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ['STUDENT', 'ACTIVE'],
    ['TEACHER', 'ACTIVE'],
    ['ADMIN', 'DISABLED'],
  ])('denies %s/%s even with an assigned Super Admin role', async (role, status) => {
    const actor = identity('SUPER_ADMIN', role, status);
    const reflector = { getAllAndOverride: () => 'CONTENT_MANAGE' } as unknown as Reflector;
    for (const subject of [new AdminGuard(actor, reflector), new ContentAdminGuard(actor)]) {
      const fixture = context();
      await expect(subject.canActivate(fixture.execution)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fixture.setHeader).not.toHaveBeenCalled();
    }
  });

  it.each(['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'])(
    'permits current Content access for %s',
    async (role) => {
      const fixture = context();
      await expect(
        new ContentAdminGuard(identity(role)).canActivate(fixture.execution),
      ).resolves.toBe(true);
      expect(fixture.setHeader).toHaveBeenCalledWith('X-Numora-Admin-Role', role);
    },
  );
});
