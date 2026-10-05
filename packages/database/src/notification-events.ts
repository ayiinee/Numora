import type { getDatabase } from './client.js';
import { notificationOutbox, type NotificationKind } from './schema/notifications.js';

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]
>[0];
// Independent of analytics policy. Must be awaited in the producer's domain transaction.
export async function enqueueNotification(
  tx: Transaction,
  input: { kind: NotificationKind; sourceId: string; recipientId?: string; occurredAt?: Date },
) {
  await tx
    .insert(notificationOutbox)
    .values({
      kind: input.kind,
      sourceKey: `${input.kind}:${input.sourceId}`,
      sourceId: input.sourceId,
      recipientId: input.recipientId ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    })
    .onConflictDoNothing({ target: notificationOutbox.sourceKey });
}
