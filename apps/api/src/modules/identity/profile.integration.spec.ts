import { randomUUID } from 'node:crypto';
import { ForbiddenException, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDatabaseConnection, getDatabase, users } from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from './identity.service';
import { ProfileController, ProfileOwnerGuard } from './profile.controller';
import { ProfileService } from './profile.service';
import { R2MediaStorage } from '../content/r2-media.storage';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('self profile API with real validation, authorization and PostgreSQL', () => {
  let app: INestApplication;
  let base: string;
  const ids = {
    student: randomUUID(),
    teacher: randomUUID(),
    other: randomUUID(),
    admin: randomUUID(),
  };
  const storage = {
    storeProfilePhoto: vi.fn(async (id: string) => `profile-photos/${id}/${'a'.repeat(64)}.png`),
    settings: () => ({ bucket: 'test-bucket' }),
    readLink: vi.fn(async () => ({
      url: 'https://example.invalid/test-photo',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    })),
  };
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    Buffer.alloc(8),
  ]);
  async function request(method: string, body?: object | FormData, token = 'student', path = 'me') {
    return fetch(`${base}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    });
  }
  function photo(bytes: Buffer = png, type = 'image/png') {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(bytes)], { type }), 'avatar.png');
    return form;
  }
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    for (const [name, id] of Object.entries(ids))
      await getDatabase()
        .db.insert(users)
        .values({
          id,
          authUserId: randomUUID(),
          email: `${id}@example.test`,
          displayName: name,
          role: name === 'teacher' ? 'TEACHER' : name === 'admin' ? 'ADMIN' : 'STUDENT',
        });
    const identity = {
      me: async (auth?: string) => {
        const name = /^Bearer (\w+)$/.exec(auth ?? '')?.[1] as keyof typeof ids;
        if (!ids[name]) throw new UnauthorizedException();
        const [user] = await getDatabase().db.select().from(users).where(eq(users.id, ids[name]));
        if (user!.status !== 'ACTIVE') throw new ForbiddenException();
        return { ...user, teacherVerified: user!.role === 'TEACHER', studentAffiliation: null };
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        ProfileService,
        ProfileOwnerGuard,
        { provide: IdentityService, useValue: identity },
        { provide: R2MediaStorage, useValue: storage },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/identity`;
  });
  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
  });
  it('edits only the signed-in display name and rejects privilege changes or blank names', async () => {
    for (const input of [
      { displayName: ' ' },
      { displayName: 'A', role: 'ADMIN' },
      { displayName: 'A', email: 'other@example.test' },
      { displayName: 'A', teacherVerified: true },
      { displayName: 'x'.repeat(121) },
    ])
      expect((await request('PATCH', input)).status).toBe(400);
    expect((await request('PATCH', { displayName: '  Nisa Baru  ' })).status).toBe(200);
    const [self] = await getDatabase().db.select().from(users).where(eq(users.id, ids.student));
    const [other] = await getDatabase().db.select().from(users).where(eq(users.id, ids.other));
    expect(self).toMatchObject({
      displayName: 'Nisa Baru',
      role: 'STUDENT',
      email: `${ids.student}@example.test`,
    });
    expect(other!.displayName).toBe('other');
    expect((await request('PATCH', { displayName: 'Guru Baru' }, 'teacher')).status).toBe(200);
    expect((await request('PATCH', { displayName: 'Admin' }, 'admin')).status).toBe(403);
    expect((await request('PATCH', { displayName: 'Anon' }, 'invalid')).status).toBe(401);
  });
  it('validates image bytes and size, persists only an owned key, and preserves the old photo on storage failure', async () => {
    expect(
      (await request('POST', photo(Buffer.from('<svg/>'), 'image/png'), 'student', 'me/photo'))
        .status,
    ).toBe(400);
    expect(
      (await request('POST', photo(Buffer.alloc(2 * 1024 * 1024 + 1)), 'student', 'me/photo'))
        .status,
    ).toBe(413);
    expect(storage.storeProfilePhoto).not.toHaveBeenCalled();
    expect((await request('POST', photo(), 'student', 'me/photo')).status).toBe(200);
    const [saved] = await getDatabase().db.select().from(users).where(eq(users.id, ids.student));
    expect(saved!.profilePhotoObjectKey).toBe(
      `profile-photos/${ids.student}/${'a'.repeat(64)}.png`,
    );
    storage.storeProfilePhoto.mockRejectedValueOnce(new Error('storage offline'));
    expect((await request('POST', photo(), 'student', 'me/photo')).status).toBe(500);
    const [unchanged] = await getDatabase()
      .db.select()
      .from(users)
      .where(eq(users.id, ids.student));
    expect(unchanged!.profilePhotoObjectKey).toBe(saved!.profilePhotoObjectKey);
    expect((await request('GET', undefined, 'other', `profile-photos/${ids.student}`)).status).toBe(
      200,
    );
    expect(
      (await request('GET', undefined, 'invalid', `profile-photos/${ids.student}`)).status,
    ).toBe(401);
    expect((await request('DELETE', undefined, 'student', 'me/photo')).status).toBe(200);
    expect(
      await (await request('GET', undefined, 'other', `profile-photos/${ids.student}`)).json(),
    ).toEqual({ url: null, expiresAt: null });
    await getDatabase()
      .db.update(users)
      .set({ status: 'DISABLED' })
      .where(and(eq(users.id, ids.student), eq(users.status, 'ACTIVE')));
    const count = storage.storeProfilePhoto.mock.calls.length;
    expect((await request('POST', photo(), 'student', 'me/photo')).status).toBe(403);
    expect(storage.storeProfilePhoto.mock.calls).toHaveLength(count);
  });
});
