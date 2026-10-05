import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  getDatabase,
  closeDatabaseConnection,
  users,
  feedback,
  notificationOutbox,
  notifications,
  enqueueNotification,
  chapters,
  subchapters,
  levels,
  levelProgress,
  assessmentPackages,
  assessmentAttempts,
  packageItems,
  irtBatches,
  irtItemResults,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { PvpService } from '../pvp/pvp.service';
import { PvpEngineService } from '../pvp/pvp-engine.service';
import { pvpFixture } from '../pvp/pvp.test-fixture';
import { MaterialsService } from '../learning/materials.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { configureApplication } from '../../bootstrap';
import { discoverNotificationReleases, drainNotificationBatch } from '../../../../worker/src/notifications';

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)('materials and durable notification delivery', () => {
  let fixture: Awaited<ReturnType<typeof pvpFixture>>;
  let service: NotificationsService;
  let identity: IdentityService;
  let app: INestApplication;
  const db = () => getDatabase().db;
  beforeAll(async () => {
    if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw Error('Isolated database required');
    process.env.DATABASE_URL = url;
    fixture = await pvpFixture();
    identity = {
      me: async (auth?: string) => {
        if (!auth) throw new UnauthorizedException();
        const key = auth.replace(/^Bearer /, '');
        return {
          id: key === 'other' ? fixture.students[0]!.id : fixture.students[1]!.id,
          role: key === 'teacher' ? 'TEACHER' : 'STUDENT',
          status: key === 'disabled' ? 'DISABLED' : 'ACTIVE',
        };
      },
    } as unknown as IdentityService;
    service = new NotificationsService(identity, {
      availability: async () => ({ available: true }),
    } as unknown as PvpService);
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
    await closeDatabaseConnection();
  });

  it('validates HTTP filters, role, identifiers and read response status', async () => {
    const base = `${await app.getUrl()}/api/v1/students/me/notifications`;
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: { authorization: 'Bearer teacher' } })).status).toBe(403);
    const headers = { authorization: 'Bearer student' };
    expect((await fetch(`${base}?filter=unknown`, { headers })).status).toBe(400);
    expect((await fetch(`${base}?cursor=invalid`, { headers })).status).toBe(400);
    expect((await fetch(base, { headers })).status).toBe(200);
    expect((await fetch(`${base}/read-all`, { method: 'POST', headers })).status).toBe(200);
    expect((await fetch(`${base}/not-a-uuid/read`, { method: 'POST', headers })).status).toBe(400);
  });

  it('permits the API runtime and denies a browser role through RLS even if table select is granted', async () => {
    const role = `test_notifications_${randomUUID().replaceAll('-', '')}`;
    await db().execute(sql.raw(`CREATE ROLE ${role} NOLOGIN`));
    try {
      await db().execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await db().execute(sql.raw(`GRANT SELECT ON notifications, notification_outbox TO ${role}`));
      await db().transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        expect(await tx.select().from(notifications)).toHaveLength(0);
        expect(await tx.select().from(notificationOutbox)).toHaveLength(0);
      });
      await db().transaction(async (tx) => {
        await tx.execute(sql.raw('SET LOCAL ROLE numora_main_runtime'));
        expect(
          (
            await tx
              .select()
              .from(notificationOutbox)
              .where(eq(notificationOutbox.sourceKey, 'SYSTEM_STARTED'))
          ).length,
        ).toBe(1);
      });
    } finally {
      await db().execute(sql.raw(`DROP OWNED BY ${role}`));
      await db().execute(sql.raw(`DROP ROLE ${role}`));
    }
  });

  it('keeps category null, scores zero, visibility and level availability authoritative', async () => {
    const order = parseInt(randomUUID().slice(0, 8), 16) % 2_000_000_000;
    const [chapter] = await db()
      .insert(chapters)
      .values({
        code: randomUUID(),
        name: 'TEST materials',
        slug: randomUUID(),
        displayOrder: order,
        status: 'READY',
        materialCategory: 'algebra',
      })
      .returning();
    const [uncategorized, draft] = await db()
      .insert(chapters)
      .values([
        {
          code: randomUUID(),
          name: 'TEST null category',
          slug: randomUUID(),
          displayOrder: order + 1,
          status: 'READY',
        },
        { code: randomUUID(), slug: randomUUID(), name: 'TEST hidden', displayOrder: order + 2, status: 'DRAFT' },
      ])
      .returning();
    const subs = await db()
      .insert(subchapters)
      .values(
        [1, 2].map((n) => ({
          chapterId: chapter!.id,
          code: randomUUID(),
          name: `TEST sub ${n}`,
          slug: randomUUID(),
          displayOrder: n,
          status: 'READY' as const,
        })),
      )
      .returning();
    const nodes = await db()
      .insert(levels)
      .values(
        subs.flatMap((sub) =>
          [1, 2].map((n) => ({ subchapterId: sub.id, levelNumber: n, status: 'READY' as const })),
        ),
      )
      .returning();
    await db()
      .insert(levelProgress)
      .values({
        studentId: fixture.students[1]!.id,
        levelId: nodes[0]!.id,
        bestScore: 0,
        latestScore: 0,
      });
    const materials = new MaterialsService(identity);
    const result = await materials.list('student');
    const own = result.chapters.find((c) => c.id === chapter!.id)!;
    expect(own).toMatchObject({
      category: 'algebra',
      totalLevels: 4,
      completedLevels: 0,
      continueSubchapterId: subs[0]!.id,
    });
    expect(own.subchapters.map((s) => s.availableLevels)).toEqual([1, 1]);
    expect(own.subchapters[0]!.bestScore).toBe(0);
    expect(own.subchapters[1]!.bestScore).toBeNull();
    expect(result.chapters.find((c) => c.id === uncategorized!.id)?.category).toBeNull();
    expect(result.chapters.some((c) => c.id === draft!.id)).toBe(false);
    await expect(materials.list('teacher')).rejects.toMatchObject({ status: 403 });
    await expect(materials.list('disabled')).rejects.toMatchObject({ status: 403 });
    await db().update(chapters).set({ materialCategory: null }).where(eq(chapters.id, chapter!.id));
    expect(
      (await materials.list('student')).chapters.find((c) => c.id === chapter!.id)?.category,
    ).toBeNull();
  });

  it('rolls back outbox with its source, retries delivery exactly once, and separates feedback read state', async () => {
    const recipientId = fixture.students[1]!.id;
    const id = randomUUID();
    await expect(
      db().transaction(async (tx) => {
        await tx
          .insert(feedback)
          .values({
            id,
            teacherId: fixture.teacher.id,
            studentId: recipientId,
            classIdAtSend: fixture.schoolClass.id,
            body: 'TEST rollback',
          });
        await enqueueNotification(tx, { kind: 'FEEDBACK_RECEIVED', sourceId: id, recipientId });
        throw Error('ROLLBACK_TEST');
      }),
    ).rejects.toThrow('ROLLBACK_TEST');
    expect(await db().select().from(feedback).where(eq(feedback.id, id))).toHaveLength(0);
    expect(
      await db()
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.sourceKey, `FEEDBACK_RECEIVED:${id}`)),
    ).toHaveLength(0);
    await db().transaction(async (tx) => {
      await tx
        .insert(feedback)
        .values({
          id,
          teacherId: fixture.teacher.id,
          studentId: recipientId,
          classIdAtSend: fixture.schoolClass.id,
          body: 'TEST persisted catatan',
        });
      await enqueueNotification(tx, { kind: 'FEEDBACK_RECEIVED', sourceId: id, recipientId });
      await enqueueNotification(tx, { kind: 'FEEDBACK_RECEIVED', sourceId: id, recipientId });
    });
    await Promise.all([drainNotificationBatch(), drainNotificationBatch()]);
    const [item] = await db()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          eq(notifications.sourceKey, `FEEDBACK_RECEIVED:${id}`),
        ),
      );
    expect(item?.body).toBe('TEST persisted catatan');
    // Simulate recovery after a lost completion acknowledgement.
    await db()
      .update(notificationOutbox)
      .set({ processedAt: null })
      .where(eq(notificationOutbox.sourceKey, item!.sourceKey));
    await drainNotificationBatch();
    expect(
      await db().select().from(notifications).where(eq(notifications.sourceKey, item!.sourceKey)),
    ).toHaveLength(1);
    await expect(service.read('other', item!.id)).rejects.toMatchObject({ status: 404 });
    await service.read('student', item!.id);
    await service.read('student', item!.id);
    expect((await db().select().from(feedback).where(eq(feedback.id, id)))[0]!.readAt).toBeNull();
  });

  it('uses durable broadcast cursor across batches and excludes newly registered students', async () => {
    const [pack] = await db()
      .insert(assessmentPackages)
      .values({
        familyCode: randomUUID(),
        packageVersion: 1,
        name: 'TEST fan-out',
        assessmentType: 'TRYOUT',
        isDemo: true,
      })
      .returning();
    await db().transaction((tx) =>
      enqueueNotification(tx, { kind: 'TRYOUT_OPENED', sourceId: pack!.id }),
    );
    const [late] = await db()
      .insert(users)
      .values({
        authUserId: randomUUID(),
        role: 'STUDENT',
        displayName: 'TEST registered later',
        email: `${randomUUID()}@example.test`,
      })
      .returning();
    const key = `TRYOUT_OPENED:${pack!.id}`;
    // Exactly one recipient per transaction forces restart-safe pagination.
    await drainNotificationBatch(1, 1);
    for (let i = 0; i < 200; i++) {
      const [event] = await db()
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.sourceKey, key));
      if (event!.processedAt) break;
      await drainNotificationBatch(20, 1);
    }
    const delivered = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.sourceKey, key));
    expect(delivered.some((n) => n.recipientId === fixture.students[2]!.id)).toBe(true); // Mandiri included.
    expect(delivered.some((n) => n.recipientId === late!.id)).toBe(false);
    expect(new Set(delivered.map((n) => n.recipientId)).size).toBe(delivered.length);
    expect(
      (
        await db().select().from(notificationOutbox).where(eq(notificationOutbox.sourceKey, key))
      )[0]!.processedAt,
    ).not.toBeNull();
  });

  it('keeps pagination valid after marking the cursor read, isolates accounts and archives without deleting', async () => {
    const recipientId = fixture.students[1]!.id;
    await db()
      .insert(notifications)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          recipientId,
          sourceKey: randomUUID(),
          kind: 'LEVEL_UNLOCKED' as const,
          title: `TEST page ${i}`,
          body: 'TEST',
          context: {},
          occurredAt: new Date(Date.now() + 1000 - i),
        })),
      );
    const page = await service.list('student', { filter: 'unread' });
    expect(page.items).toHaveLength(20);
    await service.read('student', page.nextCursor!);
    const next = await service.list('student', { filter: 'unread', cursor: page.nextCursor! });
    expect(next.items.length).toBeGreaterThan(0);
    expect(next.items.every((n) => !page.items.some((p) => p.id === n.id))).toBe(true);
    await expect(
      service.list('other', { filter: 'all', cursor: page.nextCursor! }),
    ).rejects.toMatchObject({ status: 400 });
    const [old] = await db()
      .insert(notifications)
      .values({
        recipientId,
        sourceKey: randomUUID(),
        kind: 'LEVEL_UNLOCKED',
        title: 'TEST archive boundary',
        body: 'TEST',
        context: {},
        occurredAt: sql`clock_timestamp() - interval '30 days'`,
      })
      .returning();
    expect(
      (await service.list('student', { filter: 'archive' })).items.some(
        (n) => n.id === old!.id && n.archived,
      ),
    ).toBe(true);
    // A cursor can cross the archive boundary between page requests.
    expect((await service.list('student', { filter: 'all', cursor: old!.id })).items).toEqual([]);
    await service.readAll('student');
    expect((await service.summary('student')).unread).toBe(0);
    expect(
      (await db().select().from(notifications).where(eq(notifications.id, old!.id)))[0]!.readAt,
    ).toBeNull();
    await db()
      .insert(notifications)
      .values({
        recipientId,
        sourceKey: randomUUID(),
        kind: 'LEVEL_UNLOCKED',
        title: 'TEST arrived after read all',
        body: 'TEST',
        context: {},
        occurredAt: new Date(),
      });
    expect((await service.summary('student')).unread).toBe(1);
    await expect(service.summary('teacher')).rejects.toMatchObject({ status: 403 });
  });

  it('preserves microsecond pagination and rejects cursors from a different kind filter', async () => {
    const ids: string[] = Array.from({ length: 21 }, () => randomUUID());
    await db().insert(notifications).values(ids.map((id, index) => ({
      id, recipientId: fixture.students[1]!.id, sourceKey: randomUUID(),
      kind: 'LEVEL_UNLOCKED' as const, title: 'TEST microseconds', body: 'TEST', context: {},
      occurredAt: sql`date_trunc('second', statement_timestamp()) + interval '1 hour' + ${index} * interval '1 microsecond'`,
    })));
    const first = await service.list('student', { filter: 'learning' });
    expect(first.items.map(row => row.id)).toEqual(ids.slice(1).reverse());
    const second = await service.list('student', { filter: 'learning', cursor: first.nextCursor! });
    expect(second.items.filter(row => ids.includes(row.id)).map(row => row.id)).toEqual([ids[0]]);
    await expect(service.list('student', { filter: 'tryout', cursor: first.nextCursor! }))
      .rejects.toMatchObject({ status: 400 });
    await db().delete(notifications).where(inArray(notifications.id, ids));
  });

  it('delivers a real invitation once and disables actions after decline', async () => {
    const engine = new PvpEngineService(fixture.policy);
    const room = await engine.create(fixture.students[0]!.id, 'easy', randomUUID());
    const invite = await engine.invite(
      fixture.students[0]!.id,
      room.matchId,
      fixture.students[1]!.id,
    );
    await engine.invite(fixture.students[0]!.id, room.matchId, fixture.students[1]!.id);
    await drainNotificationBatch();
    const inbox = await service.list('student', { filter: 'class' });
    const item = inbox.items.find((n) => n.kind === 'PVP_INVITED')!;
    expect(item.action).toMatchObject({ type: 'pvp', enabled: true });
    await engine.respondInvite(fixture.students[1]!.id, invite.inviteId, false);
    const updated = await service.list('student', { filter: 'class' });
    expect(updated.items.find((n) => n.id === item.id)?.action).toMatchObject({
      enabled: false,
      status: 'Ditolak',
    });
    await engine.leave(fixture.students[0]!.id, room.matchId);
  });

  it('notifies new submissions for an already released package without backfilling historical attempts', async () => {
    const [activation] = await db().select().from(notificationOutbox).where(eq(notificationOutbox.sourceKey, 'SYSTEM_STARTED'));
    const oldTime = new Date(activation!.occurredAt.getTime() - 10000);
    const [pack] = await db().insert(assessmentPackages).values({ familyCode: randomUUID(), packageVersion: 1, name: 'TEST older release', assessmentType: 'TRYOUT', isDemo: true }).returning();
    const originals = await db().select().from(packageItems).where(eq(packageItems.packageId, fixture.pack.id));
    await db().insert(packageItems).values(originals.map((item) => ({ packageId: pack!.id, questionVersionId: item.questionVersionId, displayOrder: item.displayOrder, maxPoints: item.maxPoints })));
    const [batch] = await db().insert(irtBatches).values({ packageId: pack!.id, batchKind: 'TEST', modelVersion: 'fixture', status: 'SUCCEEDED', finishedAt: oldTime, resultReleasedAt: oldTime }).returning();
    await db().insert(irtItemResults).values(originals.map((item) => ({ batchId: batch!.id, questionVersionId: item.questionVersionId, sampleSize: 30, dataStatus: 'SUFFICIENT' })));
    const [historical, recent] = await db().insert(assessmentAttempts).values([
      { studentId: fixture.students[0]!.id, packageId: pack!.id, assessmentType: 'TRYOUT', status: 'GRADED', startedAt: oldTime, finishedAt: oldTime },
      { studentId: fixture.students[1]!.id, packageId: pack!.id, assessmentType: 'TRYOUT', status: 'GRADED', startedAt: new Date(Date.now() - 1000), finishedAt: new Date() },
    ]).returning();
    await discoverNotificationReleases(); await drainNotificationBatch(100);
    expect(await db().select().from(notifications).where(eq(notifications.sourceKey, `TRYOUT_RESULT_READY:${historical!.id}`))).toHaveLength(0);
    expect(await db().select().from(notifications).where(eq(notifications.sourceKey, `TRYOUT_RESULT_READY:${recent!.id}`))).toHaveLength(1);
  });
});
