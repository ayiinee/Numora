import { BadRequestException, ConflictException } from '@nestjs/common';
import { auditLogs, getDatabase } from '@tka/database';

export type AdminTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]
>[0];

export async function adminMutation<T extends { id: string }>(
  actorId: string,
  action: string,
  entityType: string,
  write: (tx: AdminTransaction) => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  try {
    return await getDatabase().db.transaction(async (tx) => {
      const result = await write(tx);
      // No demo actor or untrusted actor ID. Audit failure rolls back the business write.
      await tx
        .insert(auditLogs)
        .values({ actorUserId: actorId, action, entityType, entityId: result.id, metadata });
      return result;
    });
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 4 && cause instanceof Object; depth++) {
      const record = cause as {
        code?: string;
        constraint_name?: string;
        detail?: string;
        cause?: unknown;
      };
      if (record.code === '23514' && record.constraint_name === 'curriculum_active_packages')
        throw new ConflictException({
          code: 'CURRICULUM_USED_BY_ACTIVE_PACKAGES',
          detail:
            `Materi masih dipakai paket aktif. Selesaikan ketergantungan berikut sebelum mengarsipkan materi. ${record.detail ?? ''}`.trim(),
        });
      if (record.code === '23514' && record.constraint_name === 'package_archived_curriculum')
        throw new ConflictException({
          code: 'PACKAGE_USES_ARCHIVED_CURRICULUM',
          detail: 'Paket tidak bisa diterbitkan karena memakai materi yang sudah diarsipkan.',
        });
      if (record.code === '23505')
        throw new ConflictException('Kode, slug, urutan, atau versi sudah digunakan.');
      if (record.code === '23503') throw new BadRequestException('Referensi tidak tersedia.');
      if (record.code === '23514')
        throw new BadRequestException('Data tidak memenuhi aturan skema.');
      cause = record.cause;
    }
    throw error;
  }
}
