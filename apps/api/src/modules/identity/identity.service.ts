import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { getDatabase, measureRuntime, users } from '@tka/database';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { IdentityProfileDto, RegisterProfileDto } from './identity.dto';
import { adminCapabilities } from './admin-capabilities';
import { authenticateForRequest } from './authentication-request';

const bearerToken = (authorization?: string) => /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1];

function usedPassword(verifiedToken: string): boolean {
  try {
    const payload = verifiedToken.split('.')[1];
    if (!payload) return false;
    const { amr } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      amr?: Array<{ method?: string } | null>;
    };
    return Array.isArray(amr) && amr.some((entry) => entry?.method === 'password');
  } catch {
    return false;
  }
}

type AccountAccess = Pick<IdentityProfileDto, 'id' | 'role' | 'status'>;

function assertActiveAccount<T extends AccountAccess>(
  profile: T | undefined,
): asserts profile is T {
  if (!profile)
    throw new NotFoundException({
      code: 'ACCOUNT_NOT_REGISTERED',
      detail: 'Lengkapi profil untuk melanjutkan.',
    });
  if (profile.status !== 'ACTIVE')
    throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', detail: 'Akun ini tidak aktif.' });
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private supabase?: SupabaseClient;

  private authClient() {
    if (this.supabase) return this.supabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new ServiceUnavailableException('Authentication is not configured.');
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.supabase;
  }

  async authenticate(authorization?: string): Promise<User> {
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('Bearer token is required.');
    return authenticateForRequest(this, token, async () => {
      const { data, error } = await measureRuntime('numora_auth_get_user', () =>
        this.authClient().auth.getUser(token),
      );
      if (error || !data.user) throw new UnauthorizedException('Invalid or expired token.');
      return data.user;
    });
  }

  async getProfile(authorization?: string): Promise<IdentityProfileDto> {
    const authUser = await this.authenticate(authorization);
    const [profile] = await getDatabase().client<Omit<IdentityProfileDto, 'capabilities'>[]>`
      select u.id, u.role, u.status, u.display_name as "displayName", u.email,
        u.admin_role as "adminRole", u.profile_photo_object_key as "profilePhotoObjectKey",
        case when u.role = 'TEACHER' then exists (
          select 1 from public.teacher_school_memberships tm
          join public.schools s on s.id = tm.school_id
          where tm.teacher_user_id = u.id and tm.ended_at is null and s.status = 'ACTIVE'
        ) else null end as "teacherVerified",
        case when u.role = 'STUDENT' then case when exists (
          select 1 from public.class_memberships cm
          where cm.student_user_id = u.id and cm.left_at is null
        ) then 'SCHOOL' else 'MANDIRI' end else null end as "studentAffiliation"
      from public.users u where u.auth_user_id = ${authUser.id} limit 1
    `;
    assertActiveAccount(profile);
    return {
      ...profile,
      capabilities: profile.role === 'ADMIN' ? adminCapabilities(profile.adminRole) : [],
    };
  }

  // Compatibility alias for domain modules that use the shorter profile lookup name.
  me(authorization?: string): Promise<IdentityProfileDto>;
  me(authorization: string | undefined, scope: 'access'): Promise<AccountAccess>;
  async me(authorization?: string, scope?: 'access') {
    if (!scope) return this.getProfile(authorization);
    const authUser = await this.authenticate(authorization);
    const [profile] = await getDatabase().client<AccountAccess[]>`
      select id, role, status from public.users where auth_user_id = ${authUser.id} limit 1
    `;
    assertActiveAccount(profile);
    return profile;
  }

  async registerProfile(
    authorization: string | undefined,
    input: RegisterProfileDto,
  ): Promise<IdentityProfileDto> {
    this.logger.debug('Profile registration started');

    const authUser = await this.authenticate(authorization);

    this.logger.debug('Profile registration authentication succeeded');

    const googleProvider =
      authUser.app_metadata.provider === 'google' ||
      authUser.app_metadata.providers?.includes('google');

    // Supabase has validated the exact JWT before its AMR claim is inspected.
    const passwordSession = usedPassword(bearerToken(authorization) ?? '');
    const markedStudent = authUser.app_metadata.numora_role === 'STUDENT';
    const provisionedStudent =
      markedStudent && input.role === 'STUDENT' && !!authUser.email_confirmed_at;
    const googleRegistration = googleProvider && (!markedStudent || input.role === 'STUDENT');

    if (!authUser.email || (passwordSession ? !provisionedStudent : !googleRegistration))
      throw new ForbiddenException('Akun ini belum disiapkan untuk metode login tersebut.');

    const name = authUser.user_metadata.full_name ?? authUser.user_metadata.name;

    const displayName =
      typeof name === 'string' && name.trim()
        ? name.trim().slice(0, 120)
        : (authUser.email.split('@')[0] ?? authUser.email);

    const { db } = getDatabase();

    this.logger.debug('Profile registration database available');

    try {
      this.logger.debug('Profile registration inserting profile');

      const inserted = await db
        .insert(users)
        .values({
          authUserId: authUser.id,
          role: input.role,
          displayName,
          email: authUser.email,
        })
        .onConflictDoNothing({
          target: users.authUserId,
        })
        .returning({
          id: users.id,
        });

      this.logger.debug(`Profile registration inserted ${inserted.length} profile(s)`);

      if (inserted.length === 0) {
        throw new ConflictException('Profile already exists.');
      }
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn('Profile registration rejected: profile already exists');
        throw error;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        this.logger.warn('Profile registration rejected: email already in use');
        throw new ConflictException('Profile email is already in use.');
      }
      this.logger.error('Profile registration insert failed');
      throw error;
    }

    this.logger.debug('Profile registration loading profile');

    return this.getProfile(authorization);
  }
}
