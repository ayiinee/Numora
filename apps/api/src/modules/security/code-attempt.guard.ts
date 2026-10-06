import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityService } from '../identity/identity.service';
import { CodeAttemptLimiter } from './code-attempt-limiter';

type Kind = 'teacher' | 'class' | 'class-takeover';
export const CodeAttempt = (kind: Kind) => SetMetadata('code-attempt', kind);

@Injectable()
export class CodeAttemptGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
    private readonly limiter: CodeAttemptLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.get<Kind>('code-attempt', context.getHandler());
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      params: { schoolId?: string };
    }>();
    const profile = await this.identity.me(request.headers.authorization);
    if (profile.role !== (kind === 'class' ? 'STUDENT' : 'TEACHER'))
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', detail: 'Akses ditolak.' });
    const scope =
      kind === 'teacher'
        ? `teacher:${profile.id}:${request.params.schoolId?.toLowerCase()}`
        : `${kind}:${profile.id}`;
    await this.limiter.consume(scope, kind === 'teacher' ? 5 : 10);
    return true;
  }
}
