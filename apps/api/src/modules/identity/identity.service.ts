import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  getDatabase,
  classMemberships,
  schools,
  teacherSchoolMemberships,
  users,
} from '@tka/database';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { and, eq, isNull } from 'drizzle-orm';
import type { IdentityProfileDto, RegisterProfileDto } from './identity.dto';

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

  private async authenticate(authorization?: string): Promise<User> {
    const token = /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Bearer token is required.');
    const { data, error } = await this.authClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired token.');
    return data.user;
  }

  async getProfile(authorization?: string): Promise<IdentityProfileDto> {
    const authUser = await this.authenticate(authorization);
    const { db } = getDatabase();
    const [profile] = await db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUser.id))
      .limit(1);
    if (!profile)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_REGISTERED',
        detail: 'Lengkapi profil untuk melanjutkan.',
      });
    if (profile.status !== 'ACTIVE')
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', detail: 'Akun ini tidak aktif.' });

    let teacherVerified: boolean | null = null;
    let studentAffiliation: 'MANDIRI' | 'SCHOOL' | null = null;
    if (profile.role === 'TEACHER') {
      const membership = await db
        .select({ id: teacherSchoolMemberships.id })
        .from(teacherSchoolMemberships)
        .innerJoin(schools, eq(schools.id, teacherSchoolMemberships.schoolId))
        .where(
          and(
            eq(teacherSchoolMemberships.teacherUserId, profile.id),
            isNull(teacherSchoolMemberships.endedAt),
            eq(schools.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      teacherVerified = membership.length > 0;
    }
    if (profile.role === 'STUDENT') {
      const membership = await db
        .select({ id: classMemberships.id })
        .from(classMemberships)
        .where(and(eq(classMemberships.studentUserId, profile.id), isNull(classMemberships.leftAt)))
        .limit(1);
      studentAffiliation = membership.length > 0 ? 'SCHOOL' : 'MANDIRI';
    }

    return {
      id: profile.id,
      role: profile.role,
      status: profile.status,
      displayName: profile.displayName,
      email: profile.email,
      teacherVerified,
      studentAffiliation,
    };
  }

  // Compatibility alias for domain modules that use the shorter profile lookup name.
  async me(authorization?: string): Promise<IdentityProfileDto> {
    return this.getProfile(authorization);
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

    if (!googleProvider || !authUser.email) {
      throw new ForbiddenException('Student and Teacher registration requires Google sign-in.');
    }

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
