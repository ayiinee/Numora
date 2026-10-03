import { createHash } from 'node:crypto';
import { Injectable, Inject, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaUpload } from './media-uploads.repository';

function invalidObject() {
  return new HttpException(
    {
      code: 'MEDIA_CONTENT_MISMATCH',
      message: 'Uploaded image does not match the reserved type, size or checksum.',
    },
    422,
  );
}

export function matchesImageSignature(bytes: Buffer, type: string) {
  if (type === 'image/png')
    return (
      bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.subarray(12, 16).toString('ascii') === 'IHDR'
    );
  if (type === 'image/jpeg')
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp')
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  return false;
}

@Injectable()
export class R2MediaStorage {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  settings() {
    const account = this.config.get<string>('R2_ACCOUNT_ID') ?? '';
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
    const bucket = this.config.get<string>('R2_BUCKET') ?? '';
    const prefix = this.config.get<string>('R2_MEDIA_PREFIX') ?? 'question-media';
    const ttl = Number(this.config.get('R2_UPLOAD_TTL_SECONDS') ?? 900);
    if (
      this.config.get('R2_MEDIA_UPLOADS_ENABLED') !== 'true' ||
      !/^[a-f0-9]{32}$/i.test(account) ||
      !accessKeyId ||
      !secretAccessKey ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(prefix) ||
      !Number.isInteger(ttl) ||
      ttl < 60 ||
      ttl > 3600
    )
      throw new ServiceUnavailableException({
        code: 'R2_NOT_CONFIGURED',
        message: 'R2 media uploads are not configured.',
      });
    return { account, accessKeyId, secretAccessKey, bucket, prefix, ttl };
  }

  private client(bucket: string) {
    const settings = this.settings();
    if (bucket !== settings.bucket)
      throw new ServiceUnavailableException({
        code: 'R2_BUCKET_CHANGED',
        message: 'Upload bucket configuration changed; operator review is required.',
      });
    return new S3Client({
      region: 'auto',
      endpoint: `https://${settings.account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
    });
  }

  async presign(row: MediaUpload) {
    const client = this.client(row.bucket);
    const seconds = Math.floor((row.expiresAt.getTime() - Date.now()) / 1000);
    if (seconds <= 0)
      throw new HttpException(
        {
          code: 'MEDIA_UPLOAD_EXPIRED',
          message: 'Upload reservation expired; use a new idempotency key.',
        },
        410,
      );
    try {
      return await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: row.bucket,
          Key: row.pendingObjectKey,
          ContentType: row.contentType,
          ContentLength: row.byteLength,
        }),
        {
          expiresIn: Math.min(seconds, 3600),
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      );
    } finally {
      client.destroy();
    }
  }

  async verifyAndPublish(row: MediaUpload) {
    const client = this.client(row.bucket);
    try {
      // Direct PUT can be replayed until expiry. Verify a bounded staging object and
      // publish the verified bytes server-side; clients never get a PUT URL for final keys.
      const result = await client.send(
        new GetObjectCommand({ Bucket: row.bucket, Key: row.pendingObjectKey }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
      if (!result.Body) throw invalidObject();
      const body = result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
      try {
        if (result.ContentLength !== row.byteLength || result.ContentType !== row.contentType)
          throw invalidObject();
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of body) {
          const buffer = Buffer.from(chunk);
          length += buffer.length;
          if (length > row.byteLength || length > 5_242_880) throw invalidObject();
          chunks.push(buffer);
        }
        const bytes = Buffer.concat(chunks);
        if (
          length !== row.byteLength ||
          createHash('sha256').update(bytes).digest('hex') !== row.sha256 ||
          !matchesImageSignature(bytes, row.contentType)
        )
          throw invalidObject();
        await client.send(
          new PutObjectCommand({
            Bucket: row.bucket,
            Key: row.objectKey,
            Body: bytes,
            ContentType: row.contentType,
            ContentLength: bytes.length,
            Metadata: { sha256: row.sha256 },
          }),
          { abortSignal: AbortSignal.timeout(15_000) },
        );
      } finally {
        body.destroy?.();
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && ['NoSuchKey', 'NotFound'].includes(error.name))
        throw new HttpException(
          {
            code: 'MEDIA_UPLOAD_NOT_FOUND',
            message: 'The pending uploaded object is not available.',
          },
          409,
        );
      // SDK messages can contain operational details; never expose or log them.
      throw new ServiceUnavailableException({
        code: 'R2_UNAVAILABLE',
        message: 'R2 verification failed; retry completion with the same upload ID.',
      });
    } finally {
      client.destroy();
    }
  }
}
