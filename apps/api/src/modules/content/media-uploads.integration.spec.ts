import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { auditLogs, closeDatabaseConnection, getDatabase } from '@tka/database';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaUploadsRepository, type NewMediaUpload } from './media-uploads.repository';

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'media reservation concurrency and audit with local PostgreSQL',
  () => {
    const owner = randomUUID();
    const repository = new MediaUploadsRepository();
    const previousUrl = process.env.DATABASE_URL;
    const login = `test_media_${owner.replaceAll('-', '')}`;
    let admin: ReturnType<typeof postgres>;
    beforeAll(async () => {
      if (
        !url ||
        !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
        process.env.NODE_ENV !== 'test'
      )
        throw new Error('Test database must be local and NODE_ENV=test.');
      admin = postgres(url, { max: 1, onnotice: () => {} });
      const password = randomUUID();
      await admin.unsafe(
        `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      await admin.unsafe(`GRANT numora_main_runtime TO "${login}"`);
      await admin`INSERT INTO users(id, auth_user_id, role, email, display_name)
        VALUES(${owner}, ${randomUUID()}, 'ADMIN', ${`media-${owner}@example.test`}, 'TEST Media Admin')`;
      await closeDatabaseConnection();
      const runtimeUrl = new URL(url);
      runtimeUrl.username = login;
      runtimeUrl.password = password;
      process.env.DATABASE_URL = runtimeUrl.toString();
    });
    afterAll(async () => {
      await closeDatabaseConnection();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (admin) {
        await admin`DELETE FROM audit_logs WHERE actor_user_id=${owner}`;
        await admin`DELETE FROM content_media_uploads WHERE actor_user_id=${owner}`;
        await admin`DELETE FROM users WHERE id=${owner}`;
        await admin.unsafe(`DROP ROLE IF EXISTS "${login}"`);
        await admin.end();
      }
    });
    it('does not grant media access to the compute role', async () => {
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe('SET LOCAL ROLE numora_irt_runtime');
          await tx`SELECT id FROM content_media_uploads LIMIT 1`;
        }),
      ).rejects.toMatchObject({ code: '42501' });
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
