import { Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';
import { auditLogs, contentMediaUploads, getDatabase } from '@tka/database';

export type MediaUpload = typeof contentMediaUploads.$inferSelect;
export type NewMediaUpload = typeof contentMediaUploads.$inferInsert;

@Injectable()
export class MediaUploadsRepository {
  async reserve(input: NewMediaUpload): Promise<MediaUpload> {
    return getDatabase().db.transaction(async (tx) => {
      const [created] = await tx
        .insert(contentMediaUploads)
        .values(input)
        .onConflictDoNothing({
          target: [contentMediaUploads.actorUserId, contentMediaUploads.idempotencyKey],
        })
        .returning();
      if (created) {
        await tx.insert(auditLogs).values({
          actorUserId: created.actorUserId,
          action: 'CONTENT_MEDIA_UPLOAD_RESERVED',
          entityType: 'content_media_upload',
          entityId: created.id,
        });
        return created;
      }
      const [existing] = await tx
        .select()
        .from(contentMediaUploads)
        .where(
          and(
            eq(contentMediaUploads.actorUserId, input.actorUserId),
            eq(contentMediaUploads.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (!existing) throw new Error('Media upload reservation unavailable.');
      return existing;
    });
  }

  async find(actorId: string, id: string): Promise<MediaUpload | undefined> {
    const [row] = await getDatabase()
      .db.select()
      .from(contentMediaUploads)
      .where(and(eq(contentMediaUploads.id, id), eq(contentMediaUploads.actorUserId, actorId)));
    return row;
  }

  async markVerified(actorId: string, id: string): Promise<MediaUpload | undefined> {
    return getDatabase().db.transaction(async (tx) => {
      const [row] = await tx
        .update(contentMediaUploads)
        .set({ status: 'VERIFIED', verifiedAt: sql`clock_timestamp()` })
        .where(
          and(
            eq(contentMediaUploads.id, id),
            eq(contentMediaUploads.actorUserId, actorId),
            eq(contentMediaUploads.status, 'PENDING'),
            gt(contentMediaUploads.expiresAt, sql`clock_timestamp()`),
          ),
        )
        .returning();
      if (row) {
        await tx.insert(auditLogs).values({
          actorUserId: actorId,
          action: 'CONTENT_MEDIA_UPLOAD_VERIFIED',
          entityType: 'content_media_upload',
          entityId: id,
        });
        return row;
      }
      const [existing] = await tx
        .select()
        .from(contentMediaUploads)
        .where(and(eq(contentMediaUploads.id, id), eq(contentMediaUploads.actorUserId, actorId)));
      return existing?.status === 'VERIFIED' ? existing : undefined;
    });
  }
}
