import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSION, adminAllows, type AdminPermission } from './admin-permissions';

import type { AdminSubRole } from './admin-permissions';

export type AdminRequest = {
  headers: { authorization?: string };
  adminId: string;
  adminRole: AdminSubRole;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const profile = await this.identity.me(request.headers.authorization);
    const permission =
      this.reflector.getAllAndOverride<AdminPermission>(ADMIN_PERMISSION, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'adminAccounts';
    if (
      profile.role !== 'ADMIN' ||
      profile.status !== 'ACTIVE' ||
      !adminAllows(profile.adminRole, permission)
    ) {
      throw new ForbiddenException('Active Admin access is required.');
    }
    request.adminId = profile.id;
    request.adminRole = profile.adminRole!;
    return true;
  }
}
