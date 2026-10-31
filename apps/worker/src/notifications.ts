import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import {
  getDatabase,
  notificationOutbox,
  notifications,
  users,
  feedback,
  classes,
  pvpInvites,
  pvpMatches,
  assessmentAttempts,
  assessmentPackages,
  levelProgress,
  levels,
  subchapters,
  enqueueNotification,
  currentTryoutPackage,
  releasedTryoutPackageTimes,
  type NotificationKind,
  type NotificationContext,
} from '@tka/database';

// Scheduled releases use the same predicates as the Student API, never an analytics gate.
export async function discoverNotificationReleases() {
  const { db } = getDatabase();
  const current = await currentTryoutPackage();
  if (current)
    await db.transaction((tx) =>
      enqueueNotification(tx, { kind: 'TRYOUT_OPENED', sourceId: current.id }),
    );
  const [activation] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.sourceKey, 'SYSTEM_STARTED'));
  if (!activation) throw new Error('NOTIFICATION_MIGRATION_REQUIRED');
  const packages = await db.execute<{ package_id: string }>(sql`
    WITH published AS (
      SELECT b.package_id, f.published_at AS released_at
      FROM tryout_result_finalizations f JOIN tryout_batches b ON b.id=f.batch_id
      JOIN assessment_packages p ON p.id=b.package_id
      WHERE NOT p.is_demo AND f.published_at <= clock_timestamp()
      UNION ALL
      SELECT b.package_id, b.result_released_at
      FROM irt_batches b JOIN assessment_packages p ON p.id=b.package_id
      WHERE p.is_demo AND b.status='SUCCEEDED' AND b.result_released_at <= clock_timestamp()
    )
    SELECT DISTINCT b.package_id FROM published b WHERE true
    AND EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.package_id=b.package_id
      AND a.assessment_type='TRYOUT' AND a.status='GRADED' AND a.purpose='REGULAR'
      AND (b.released_at >= ${activation.occurredAt.toISOString()}::timestamptz OR a.finished_at >= ${activation.occurredAt.toISOString()}::timestamptz)
      AND NOT EXISTS (SELECT 1 FROM notification_outbox o WHERE o.source_key='TRYOUT_RESULT_READY:' || a.id::text))`);
  const times = await releasedTryoutPackageTimes(packages.map((r) => r.package_id));
  const released = [...times.keys()];
  const newlyReleased = [...times]
    .filter(([, at]) => at >= activation.occurredAt)
    .map(([id]) => id);
  if (!released.length) return;
  const candidates = await db.execute<{ id: string; student_id: string }>(sql`
    SELECT a.id,a.student_id FROM assessment_attempts a
    WHERE a.assessment_type='TRYOUT' AND a.status='GRADED' AND a.purpose='REGULAR'
    AND a.package_id IN (${sql.join(
      released.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    AND (a.finished_at >= ${activation.occurredAt.toISOString()}::timestamptz OR ${
      newlyReleased.length
        ? sql`a.package_id IN (${sql.join(
            newlyReleased.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql`false`
    })
    AND NOT EXISTS (SELECT 1 FROM notification_outbox o WHERE o.source_key='TRYOUT_RESULT_READY:' || a.id::text)
    ORDER BY a.id LIMIT 100`);
  for (const row of candidates)
    await db.transaction((tx) =>
      enqueueNotification(tx, {
        kind: 'TRYOUT_RESULT_READY',
        sourceId: row.id,
        recipientId: row.student_id,
      }),
    );
}

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]>[0];
type Event = typeof notificationOutbox.$inferSelect;
async function presentation(
  tx: Tx,
  event: Event,
): Promise<{ title: string; body: string; context: NotificationContext } | null> {
  if (event.kind === 'FEEDBACK_RECEIVED') {
    const [row] = await tx
      .select({ note: feedback, teacher: users.displayName, className: classes.name })
      .from(feedback)
      .innerJoin(users, eq(users.id, feedback.teacherId))
      .innerJoin(classes, eq(classes.id, feedback.classIdAtSend))
      .where(and(eq(feedback.id, event.sourceId), eq(feedback.studentId, event.recipientId!)));
    return row
      ? {
          title: `Catatan Baru dari ${row.teacher}`,
          body: row.note.body.slice(0, 180),
          context: { feedbackId: row.note.id, classId: row.note.classIdAtSend },
        }
      : null;
  }
  if (event.kind === 'PVP_INVITED') {
    const [row] = await tx
      .select({ invite: pvpInvites, sender: users.displayName, difficulty: pvpMatches.difficulty })
      .from(pvpInvites)
      .innerJoin(users, eq(users.id, pvpInvites.senderStudentId))
      .innerJoin(pvpMatches, eq(pvpMatches.id, pvpInvites.matchId))
      .where(
        and(
          eq(pvpInvites.id, event.sourceId),
          eq(pvpInvites.recipientStudentId, event.recipientId!),
        ),
      );
    const labels: Record<string, string> = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' };
    return row
      ? {
          title: `Tantangan Duel PvP: ${row.sender}`,
          body: `${row.sender} menantangmu di Arena PvP Tingkat ${labels[row.difficulty]}.`,
          context: {
            inviteId: row.invite.id,
            matchId: row.invite.matchId,
            classId: row.invite.classIdAtInvite,
          },
        }
      : null;
  }
  if (event.kind === 'LEVEL_UNLOCKED') {
    const [row] = await tx
      .select({ level: levels, sub: subchapters })
      .from(levelProgress)
      .innerJoin(levels, eq(levels.id, levelProgress.levelId))
      .innerJoin(subchapters, eq(subchapters.id, levels.subchapterId))
      .where(
        and(eq(levelProgress.id, event.sourceId), eq(levelProgress.studentId, event.recipientId!)),
      );
    return row
      ? {
          title: `Level ${row.level.levelNumber} Terbuka!`,
          body: `Lanjutkan latihan ${row.sub.name} pada level yang baru terbuka.`,
          context: { chapterId: row.sub.chapterId, subchapterId: row.sub.id },
        }
      : null;
  }
  if (event.kind === 'TRYOUT_OPENED') {
    const [pack] = await tx
      .select()
      .from(assessmentPackages)
      .where(eq(assessmentPackages.id, event.sourceId));
    return pack
      ? {
          title: pack.name,
          body: 'Paket Tryout sudah dapat dikerjakan. Buka paket untuk melihat ketentuan dan status pengerjaanmu.',
          context: { packageId: pack.id },
        }
      : null;
  }
  if (event.kind === 'TRYOUT_RESULT_READY') {
    const [row] = await tx
      .select({ attempt: assessmentAttempts, title: assessmentPackages.name })
      .from(assessmentAttempts)
      .innerJoin(assessmentPackages, eq(assessmentPackages.id, assessmentAttempts.packageId))
      .where(
        and(
          eq(assessmentAttempts.id, event.sourceId),
          eq(assessmentAttempts.studentId, event.recipientId!),
        ),
      );
    return row
      ? {
          title: 'Hasil Tryout Sudah Tersedia',
          body: `Hasil dan pembahasan ${row.title} sudah dirilis.`,
          context: { attemptId: row.attempt.id, packageId: row.attempt.packageId },
        }
      : null;
  }
  return null;
}

export async function drainNotificationBatch(limit = 20, audienceBatch = 100) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isInteger(audienceBatch) ||
    audienceBatch < 1 ||
    audienceBatch > 1000
  )
    throw new Error('NOTIFICATION_BATCH_INVALID');
  const { db } = getDatabase();
  let delivered = 0,
    failed = 0;
  for (let i = 0; i < limit; i++) {
    let selectedId: string | undefined;
    try {
      const result = await db.transaction(async (tx) => {
        const [event] = await tx
          .select()
          .from(notificationOutbox)
          .where(
            and(
              isNull(notificationOutbox.processedAt),
              or(
                isNull(notificationOutbox.failedAt),
                sql`${notificationOutbox.failedAt} < clock_timestamp() - interval '30 seconds'`,
              ),
            ),
          )
          .orderBy(asc(notificationOutbox.occurredAt), asc(notificationOutbox.id))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!event) return null;
        selectedId = event.id;
        const view = await presentation(tx, event);
        if (!view) throw new Error('NOTIFICATION_SOURCE_UNAVAILABLE');
        const recipients = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.role, 'STUDENT'),
              eq(users.status, 'ACTIVE'),
              event.recipientId
                ? eq(users.id, event.recipientId)
                : lte(users.createdAt, event.audienceBefore),
              !event.recipientId && event.cursor ? gt(users.id, event.cursor) : undefined,
            ),
          )
          .orderBy(asc(users.id))
          .limit(audienceBatch);
        if (recipients.length)
          await tx
            .insert(notifications)
            .values(
              recipients.map(({ id }) => ({
                recipientId: id,
                sourceKey: event.sourceKey,
                kind: event.kind as NotificationKind,
                occurredAt: event.occurredAt,
                ...view,
              })),
            )
            .onConflictDoNothing({ target: [notifications.recipientId, notifications.sourceKey] });
        const done = !!event.recipientId || recipients.length < audienceBatch;
        await tx
          .update(notificationOutbox)
          .set({
            cursor: recipients.at(-1)?.id ?? event.cursor,
            processedAt: done ? sql`clock_timestamp()` : null,
            failedAt: null,
            attempts: sql`${notificationOutbox.attempts} + 1`,
          })
          .where(eq(notificationOutbox.id, event.id));
        return recipients.length;
      });
      if (result === null) break;
      delivered += result;
    } catch {
      failed++;
      if (selectedId)
        await db
          .update(notificationOutbox)
          .set({
            failedAt: sql`clock_timestamp()`,
            attempts: sql`${notificationOutbox.attempts} + 1`,
          })
          .where(eq(notificationOutbox.id, selectedId));
    }
  }
  return { delivered, failed };
}
