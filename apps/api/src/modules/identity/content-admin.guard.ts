import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import type { AdminRequest } from './admin.guard';

@Injectable()
export class ContentAdminGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const profile = await this.identity.me(request.headers.authorization);
    if (
      profile.role !== 'ADMIN' ||
      profile.status !== 'ACTIVE' ||
      !['SUPER_ADMIN', 'CONTENT_DATA_MODERATION'].includes(profile.adminRole ?? '')
    ) {
      throw new ForbiddenException({
        code: 'CONTENT_PERMISSION_REQUIRED',
        detail: 'Content Admin access is required.',
      });
    }
    request.adminId = profile.id;
    return true;
  }
}
