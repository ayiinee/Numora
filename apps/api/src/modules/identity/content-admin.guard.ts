import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import type { AdminRequest } from './admin.guard';
import { adminCapabilities, type AdminRole } from './admin-capabilities';

@Injectable()
export class ContentAdminGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const profile = await this.identity.me(request.headers.authorization);
    if (
      profile.role !== 'ADMIN' ||
      profile.status !== 'ACTIVE' ||
      !adminCapabilities(profile.adminRole).includes('CONTENT_MANAGE')
    ) {
      throw new ForbiddenException({
        code: 'CONTENT_PERMISSION_REQUIRED',
        detail: 'Content Admin access is required.',
      });
    }
    request.adminId = profile.id;
    request.adminRole = profile.adminRole as AdminRole;
    context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('X-Numora-Admin-Role', request.adminRole);
    return true;
  }
}
