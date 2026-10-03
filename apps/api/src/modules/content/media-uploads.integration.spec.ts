import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  auditLogs,
  closeDatabaseConnection,
  contentMediaUploads,
  getDatabase,
  users,
} from '@tka/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaUploadsRepository, type NewMediaUpload } from './media-uploads.repository';

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'media reservation concurrency and audit with local PostgreSQL',
  () => {
    const owner = randomUUID();
    const repository = new MediaUploadsRepository();
    beforeAll(async () => {
      if (
        !url ||
        !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
        process.env.NODE_ENV !== 'test'
      )
        throw new Error('Test database must be local and NODE_ENV=test.');
      process.env.DATABASE_URL = url;
      await getDatabase()
        .db.insert(users)
        .values({
          id: owner,
          authUserId: randomUUID(),
          role: 'ADMIN',
          email: `media-${owner}@example.test`,
          displayName: 'TEST Media Admin',
        });
    });
    afterAll(async () => {
      await getDatabase().db.delete(auditLogs).where(eq(auditLogs.actorUserId, owner));
      await getDatabase()
        .db.delete(contentMediaUploads)
        .where(eq(contentMediaUploads.actorUserId, owner));
      await getDatabase().db.delete(users).where(eq(users.id, owner));
      await closeDatabaseConnection();
    });
    it('concurrent retries create one durable row and one audit record for each transition', async () => {
      const input: NewMediaUpload = {
        id: randomUUID(),
        actorUserId: owner,
        idempotencyKey: 'concurrent-test',
        externalId: 'TEST-ONLY',
        assetId: 'soal-1',
        contentVersion: 1,
        bucket: 'numora-bucket',
        pendingObjectKey: `question-media/_pending/${owner}/test.png`,
        objectKey: `question-media/${owner}/test-final.png`,
        contentType: 'image/png',
        byteLength: 10,
        sha256: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 900_000),
      };
      const reservations = await Promise.all([
        repository.reserve(input),
        repository.reserve({ ...input, id: randomUUID() }),
      ]);
      expect(reservations[0]!.id).toBe(reservations[1]!.id);
      const verified = await Promise.all([
        repository.markVerified(owner, reservations[0]!.id),
        repository.markVerified(owner, reservations[0]!.id),
      ]);
      expect(verified.map((v) => v?.status)).toEqual(['VERIFIED', 'VERIFIED']);
      const events = await getDatabase()
        .db.select()
        .from(auditLogs)
        .where(and(eq(auditLogs.actorUserId, owner), eq(auditLogs.entityId, reservations[0]!.id)));
      expect(events.map((e) => e.action).sort()).toEqual([
        'CONTENT_MEDIA_UPLOAD_RESERVED',
        'CONTENT_MEDIA_UPLOAD_VERIFIED',
      ]);
      expect(await repository.find(randomUUID(), reservations[0]!.id)).toBeUndefined();
    });
  },
);
