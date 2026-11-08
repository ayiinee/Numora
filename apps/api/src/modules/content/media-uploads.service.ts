import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Inject, HttpException, NotFoundException } from '@nestjs/common';
import { MediaUploadsRepository, type MediaUpload } from './media-uploads.repository';
import { R2MediaStorage } from './r2-media.storage';
import type {
  CreateMediaUploadDto,
  MediaUploadReceiptDto,
  MediaUploadReservationDto,
} from './media-uploads.dto';

function receipt(row: MediaUpload): MediaUploadReceiptDto {
  return {
    uploadId: row.id,
    status: row.status as 'PENDING' | 'VERIFIED',
    externalId: row.externalId,
    assetId: row.assetId,
    bucket: row.bucket,
    objectKey: row.objectKey,
    contentType: row.contentType,
    byteLength: row.byteLength,
    sha256: row.sha256,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class MediaUploadsService {
  constructor(
    @Inject(MediaUploadsRepository) private readonly repository: MediaUploadsRepository,
    @Inject(R2MediaStorage) private readonly storage: R2MediaStorage,
  ) {}

  async storeGeneratorImage(
    actorId: string,
    externalId: string,
    assetId: string,
    sha256: string,
    bytes: Buffer,
  ) {
    const previous = await this.repository.verified(actorId, externalId, assetId, sha256);
    if (previous) return receipt(previous);
    // A new reservation after expiry retains the old failed upload as evidence.
    const scope = createHash('sha256')
      .update(externalId + ':' + assetId)
      .digest('hex')
      .slice(0, 24);
    const key = `g-${sha256}-${scope}-${Math.floor(Date.now() / 60000)}`;
    const upload = await this.reserve(actorId, key, {
      externalId,
      assetId,
      sha256,
      contentVersion: 1,
      contentType: 'image/png',
      byteLength: bytes.length,
    });
    if (upload.status === 'VERIFIED') return upload;
    try {
      const response = await fetch(upload.uploadUrl!, {
        method: 'PUT',
        headers: upload.headers!,
        body: new Uint8Array(bytes),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('upload failed');
    } catch {
      throw new HttpException({ code: 'GENERATOR_MEDIA_UPLOAD_FAILED' }, 503);
    }
    return this.complete(actorId, upload.uploadId);
  }

  async reserve(
    actorId: string,
    key: string | undefined,
    dto: CreateMediaUploadDto,
  ): Promise<MediaUploadReservationDto> {
    if (!key || !/^[A-Za-z0-9_-]{1,128}$/.test(key))
      throw new HttpException(
        {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'A 1–128 character Idempotency-Key is required.',
        },
        400,
      );
    const settings = this.storage.settings();
    const id = randomUUID();
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
      dto.contentType
    ];
    const row = await this.repository.reserve({
      id,
      actorUserId: actorId,
      idempotencyKey: key,
      ...dto,
      bucket: settings.bucket,
      pendingObjectKey: `${settings.prefix}/_pending/${actorId}/${id}.${extension}`,
      objectKey: `${settings.prefix}/${dto.externalId}/v${dto.contentVersion}/${dto.assetId}-${dto.sha256}.${extension}`,
      expiresAt: new Date(Date.now() + settings.ttl * 1000),
    });
    if (
      row.externalId !== dto.externalId ||
      row.assetId !== dto.assetId ||
      row.contentVersion !== dto.contentVersion ||
      row.contentType !== dto.contentType ||
      row.byteLength !== dto.byteLength ||
      row.sha256 !== dto.sha256
    )
      throw new HttpException(
        { code: 'IDEMPOTENCY_CONFLICT', message: 'This key is already used for different media.' },
        409,
      );
    if (row.status === 'VERIFIED')
      return {
        ...receipt(row),
        uploadUrl: null,
        method: null,
        headers: null,
        expiresAt: row.expiresAt.toISOString(),
      };
    return {
      ...receipt(row),
      uploadUrl: await this.storage.presign(row),
      method: 'PUT',
      headers: { 'Content-Type': row.contentType, 'Content-Length': String(row.byteLength) },
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async complete(actorId: string, id: string): Promise<MediaUploadReceiptDto> {
    const row = await this.repository.find(actorId, id);
    if (!row)
      throw new NotFoundException({ code: 'MEDIA_UPLOAD_NOT_FOUND', message: 'Upload not found.' });
    if (row.status === 'VERIFIED') return receipt(row);
    if (row.expiresAt.getTime() <= Date.now())
      throw new HttpException(
        { code: 'MEDIA_UPLOAD_EXPIRED', message: 'Upload reservation expired.' },
        410,
      );
    await this.storage.verifyAndPublish(row);
    const verified = await this.repository.markVerified(actorId, id);
    if (!verified)
      throw new HttpException(
        { code: 'MEDIA_UPLOAD_EXPIRED', message: 'Upload reservation expired before completion.' },
        410,
      );
    return receipt(verified);
  }
}
