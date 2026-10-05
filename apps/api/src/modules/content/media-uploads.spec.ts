import { randomUUID } from 'node:crypto';
import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApplication } from '../../bootstrap';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { IdentityService } from '../identity/identity.service';
import { MediaUploadsController } from './media-uploads.controller';
import { MediaUploadsService } from './media-uploads.service';
import {
  MediaUploadsRepository,
  type MediaUpload,
  type NewMediaUpload,
} from './media-uploads.repository';
import { R2MediaStorage } from './r2-media.storage';

describe('media upload API (guard and validation real; database/R2 isolated)', () => {
  let app: INestApplication;
  let base: string;
  const actor = randomUUID();
  const otherActor = randomUUID();
  const rows = new Map<string, MediaUpload>();
  const storage = {
    settings: () => ({ bucket: 'numora-bucket', prefix: 'question-media', ttl: 900 }),
    presign: vi.fn(async () => 'https://example.invalid/test-only-upload'),
    verifyAndPublish: vi.fn(async () => undefined),
  };
  const repository = {
    reserve: async (input: NewMediaUpload) => {
      const key = `${input.actorUserId}:${input.idempotencyKey}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const row = {
        ...input,
        status: 'PENDING',
        createdAt: new Date(),
        verifiedAt: null,
      } as MediaUpload;
      rows.set(key, row);
      return row;
    },
    find: async (owner: string, id: string) =>
      [...rows.values()].find((r) => r.id === id && r.actorUserId === owner),
    markVerified: async (owner: string, id: string) => {
      const row = await repository.find(owner, id);
      if (!row || row.expiresAt.getTime() <= Date.now()) return undefined;
      row.status = 'VERIFIED';
      row.verifiedAt = new Date();
      return row;
    },
  };
  const payload = {
    externalId: 'CURR-IND16-L01-Q03',
    assetId: 'bahas-1',
    contentType: 'image/png',
    byteLength: 1499,
    sha256: 'a'.repeat(64),
  };
  async function request(path = '', body?: object, key: string = randomUUID(), token = 'admin') {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MediaUploadsController],
      providers: [
        ContentAdminGuard,
        MediaUploadsService,
        {
          provide: IdentityService,
          useValue: {
            me: async (header?: string) => {
              if (!header) throw new UnauthorizedException();
              return {
                id: header === 'Bearer other' ? otherActor : actor,
                role: header === 'Bearer student' ? 'STUDENT' : 'ADMIN',
                adminRole: 'CONTENT_DATA_MODERATION',
                status: header === 'Bearer disabled' ? 'DISABLED' : 'ACTIVE',
              };
            },
          },
        },
        { provide: MediaUploadsRepository, useValue: repository },
        { provide: R2MediaStorage, useValue: storage },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/admin/content/media/uploads`;
  });
  afterAll(async () => {
    await app?.close();
  });

  it('requires active Admin even for completion; rejects anonymous/student/disabled', async () => {
    for (const [token, status] of [
      ['', 401],
      ['student', 403],
      ['disabled', 403],
    ] as const) {
      expect((await request('', payload, randomUUID(), token)).status).toBe(status);
      expect(
        (await request(`/${randomUUID()}/complete`, undefined, randomUUID(), token)).status,
      ).toBe(status);
    }
  });
  it('rejects traversal, SVG, oversize, invalid checksum and injected object keys', async () => {
    for (const change of [
      { externalId: '../private' },
      { contentType: 'image/svg+xml' },
      { byteLength: 5_242_881 },
      { sha256: 'not-a-hash' },
      { objectKey: 'foreign/object' },
      { contentVersion: 0 },
    ])
      expect((await request('', { ...payload, ...change })).status).toBe(400);
    expect((await request('', payload, '')).status).toBe(400);
  });
  it('reuses a pending reservation and refuses changed data with the same key', async () => {
    const key = randomUUID();
    const first = await (await request('', payload, key)).json();
    const replay = await (await request('', payload, key)).json();
    expect(replay.uploadId).toBe(first.uploadId);
    expect(first.bucket).toBe('numora-bucket');
    expect(first.objectKey).toContain(`bahas-1-${payload.sha256}.png`);
    expect(first.status).toBe('PENDING');
    expect(first.verifiedAt).toBeNull();
    expect((await request('', { ...payload, sha256: 'b'.repeat(64) }, key)).status).toBe(409);
  });
  it('hides other-actor reservations and rejects malformed upload IDs', async () => {
    const reservation = await (await request('', payload)).json();
    expect(
      (await request(`/${reservation.uploadId}/complete`, undefined, randomUUID(), 'other')).status,
    ).toBe(404);
    expect((await request('/not-a-uuid/complete')).status).toBe(400);
  });
  it('verifies once, completes idempotently, and never issues another PUT for verified media', async () => {
    const key = randomUUID();
    const reservation = await (await request('', payload, key)).json();
    const before = storage.verifyAndPublish.mock.calls.length;
    const result = await (await request(`/${reservation.uploadId}/complete`)).json();
    expect(result.status).toBe('VERIFIED');
    expect(result.verifiedAt).toBeTruthy();
    expect(result).not.toHaveProperty('uploadUrl');
    await request(`/${reservation.uploadId}/complete`);
    const replay = await (await request('', payload, key)).json();
    expect(replay.uploadUrl).toBeNull();
    expect(storage.verifyAndPublish.mock.calls.length).toBe(before + 1);
  });
  it('does not verify an expired pending reservation', async () => {
    const reservation = await (await request('', payload)).json();
    const row = await repository.find(actor, reservation.uploadId);
    row!.expiresAt = new Date(Date.now() - 1000);
    expect((await request(`/${reservation.uploadId}/complete`)).status).toBe(410);
    expect(row!.status).toBe('PENDING');
  });
});
