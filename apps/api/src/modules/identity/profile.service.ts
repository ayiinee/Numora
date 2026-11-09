import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { getDatabase, users } from '@tka/database';
import { IdentityService } from './identity.service';
import { matchesImageSignature, R2MediaStorage } from '../content/r2-media.storage';
import type { ProfilePhotoDto } from './identity.dto';

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
@Injectable()
export class ProfileService {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
  ) {}
  async owner(authorization?: string) {
    const profile = await this.identity.me(authorization);
    if (profile.status !== 'ACTIVE' || !['STUDENT', 'TEACHER'].includes(profile.role))
      throw new ForbiddenException({
        code: 'PROFILE_FORBIDDEN',
        detail: 'Profil ini tidak dapat diedit.',
      });
    return profile;
  }
  private async save(
    id: string,
    values: { displayName?: string; profilePhotoObjectKey?: string | null },
  ) {
    const [updated] = await getDatabase()
      .db.update(users)
      .set(values)
      .where(and(eq(users.id, id), eq(users.status, 'ACTIVE')))
      .returning({ id: users.id });
    if (!updated)
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', detail: 'Akun ini tidak aktif.' });
  }
  async rename(authorization: string | undefined, displayName: string) {
    const profile = await this.owner(authorization);
    await this.save(profile.id, { displayName });
    return this.identity.me(authorization);
  }
  async upload(authorization: string | undefined, file?: { buffer: Buffer; mimetype: string }) {
    const profile = await this.owner(authorization);
    if (
      !file ||
      !file.buffer.length ||
      file.buffer.length > PROFILE_PHOTO_MAX_BYTES ||
      !matchesImageSignature(file.buffer, file.mimetype)
    )
      throw new BadRequestException({
        code: 'PROFILE_PHOTO_INVALID',
        detail: 'Gunakan foto PNG, JPEG, atau WebP berukuran maksimal 2 MB.',
      });
    const key = await this.storage.storeProfilePhoto(profile.id, file.buffer, file.mimetype);
    // Store immutable keys, never client-supplied URLs or signed links. Same bytes can safely retry.
    await this.save(profile.id, { profilePhotoObjectKey: key });
    return this.identity.me(authorization);
  }
  async remove(authorization?: string) {
    const profile = await this.owner(authorization);
    await this.save(profile.id, { profilePhotoObjectKey: null });
    return this.identity.me(authorization);
  }
  async photo(authorization: string | undefined, userId: string): Promise<ProfilePhotoDto> {
    await this.identity.me(authorization);
    const [user] = await getDatabase()
      .db.select({ key: users.profilePhotoObjectKey })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE')))
      .limit(1);
    if (!user) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    if (!user.key) return { url: null, expiresAt: null };
    if (!new RegExp(`^profile-photos/${userId}/[a-f0-9]{64}\\.(?:png|jpg|webp)$`).test(user.key))
      return { url: null, expiresAt: null };
    return this.storage.readLink(this.storage.settings(true).bucket, user.key);
  }
}
