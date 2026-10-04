import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaUpload } from './media-uploads.repository';
import { R2MediaStorage } from './r2-media.storage';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB6sAAAAASUVORK5CYII=',
  'base64',
);
const config = () =>
  new ConfigService({
    R2_MEDIA_UPLOADS_ENABLED: 'true',
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'TEST_ONLY',
    R2_SECRET_ACCESS_KEY: 'TEST_ONLY',
    R2_BUCKET: 'numora-bucket',
  });
const row = (): MediaUpload => ({
  id: randomUUID(),
  actorUserId: randomUUID(),
  idempotencyKey: 'test',
  externalId: 'CURR-IND16-L01-Q03',
  assetId: 'bahas-1',
  contentVersion: 1,
  bucket: 'numora-bucket',
  pendingObjectKey: 'question-media/_pending/test.png',
  objectKey: 'question-media/test-final.png',
  byteLength: png.length,
  contentType: 'image/png',
  sha256: createHash('sha256').update(png).digest('hex'),
  status: 'PENDING',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 900_000),
  verifiedAt: null,
});
describe('R2 media storage (SDK network mocked)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('fails closed when disabled or misconfigured without contacting R2', () => {
    expect(() => new R2MediaStorage(new ConfigService({})).settings()).toThrow(
      'R2 media uploads are not configured',
    );
    expect(() =>
      new R2MediaStorage(
        new ConfigService({ R2_MEDIA_UPLOADS_ENABLED: 'true', R2_ACCOUNT_ID: 'invalid' }),
      ).settings(),
    ).toThrow();
  });
  it('signs only the pending object, content type and length; no network required', async () => {
    const item = row();
    const url = new URL(await new R2MediaStorage(config()).presign(item));
    expect(url.hostname).toBe(`${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    expect(url.pathname).toContain('/numora-bucket/');
    expect(decodeURIComponent(url.pathname)).toContain(item.pendingObjectKey);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.pathname).not.toContain(item.objectKey);
  });
  it('keeps GET renewal available when upload is disabled and ignores test transport in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const settings = config();
      settings.set('R2_MEDIA_UPLOADS_ENABLED', 'false');
      settings.set('R2_TEST_ENDPOINT', 'http://localhost:1/fixture');
      const storage = new R2MediaStorage(settings);
      expect(() => storage.settings()).toThrow();
      const link = await storage.readLink('numora-bucket', row().objectKey);
      const url = new URL(link.url);
      expect(url.hostname).toBe(`${'a'.repeat(32)}.r2.cloudflarestorage.com`);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('publishes only the actual verified bytes to a separate final key', async () => {
    const item = row();
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Body: Readable.from([png]),
        ContentLength: png.length,
        ContentType: 'image/png',
      } as never)
      .mockResolvedValueOnce({} as never);
    await new R2MediaStorage(config()).verifyAndPublish(item);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
    const publish = send.mock.calls[1]![0] as PutObjectCommand;
    expect(publish.input.Key).toBe(item.objectKey);
    expect(publish.input.Body).toEqual(png);
  });
  it('rejects checksum/type/size mismatch without publishing', async () => {
    for (const change of [
      { sha256: 'b'.repeat(64) },
      { byteLength: png.length - 1 },
      { contentType: 'image/jpeg' },
    ]) {
      const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
        Body: Readable.from([png]),
        ContentLength: png.length,
        ContentType: 'image/png',
      } as never);
      await expect(
        new R2MediaStorage(config()).verifyAndPublish({ ...row(), ...change }),
      ).rejects.toMatchObject({ status: 422 });
      expect(send).toHaveBeenCalledTimes(1);
      send.mockRestore();
    }
  });
  it('rejects spoofed PNG bytes even if its claimed checksum matches', async () => {
    const bytes = Buffer.from('<svg onload="unsafe()"/>');
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Body: Readable.from([bytes]),
      ContentLength: bytes.length,
      ContentType: 'image/png',
    } as never);
    await expect(
      new R2MediaStorage(config()).verifyAndPublish({
        ...row(),
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('does not expose SDK error messages or signed URLs', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(new Error('PRIVATE_SDK_DETAILS'));
    try {
      await new R2MediaStorage(config()).verifyAndPublish(row());
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_SDK_DETAILS');
      expect(error).toMatchObject({ status: 503 });
    }
  });
});
