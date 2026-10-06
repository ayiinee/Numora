import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { Reflector } from '@nestjs/core';
import {
  ADMIN_CAPABILITY_METADATA,
  adminCapabilities,
  type AdminCapability,
  type AdminRole,
} from './admin-capabilities';

export type AdminRequest = {
  headers: { authorization?: string };
  adminId: string;
  adminRole: AdminRole;
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const profile = await this.identity.me(request.headers.authorization);
    const capabilities = adminCapabilities(profile.adminRole);
    const required =
      this.reflector.getAllAndOverride<AdminCapability>(ADMIN_CAPABILITY_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'ADMIN_ACCOUNTS_MANAGE';
    if (
      profile.role !== 'ADMIN' ||
      profile.status !== 'ACTIVE' ||
      !capabilities.length ||
      (required && !capabilities.includes(required))
    ) {
      throw new ForbiddenException({
        code: 'ADMIN_PERMISSION_REQUIRED',
        detail: 'Assignment Admin yang sesuai diperlukan.',
      });
    }
    request.adminId = profile.id;
    request.adminRole = profile.adminRole as AdminRole;
    return true;
  }
}
