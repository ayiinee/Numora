import { randomUUID } from 'node:crypto';
import { connect, createServer, type Socket } from 'node:net';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assessmentPackages,
  closeDatabaseConnection,
  enqueueNotification,
  getDatabase,
  notificationOutbox,
  notifications,
  pvpAnswers,
  pvpMatchQuestions,
  pvpPlayers,
  questionVersions,
  packageItems,
} from '@tka/database';
import { and, eq, inArray } from 'drizzle-orm';
import { PvpEngineService } from './pvp-engine.service';
import { PvpSchedulerService } from './pvp-scheduler.service';
import { pvpFixture } from './pvp.test-fixture';
import {
  discoverNotificationReleases,
  drainNotificationBatch,
} from '../../../../worker/src/notifications';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  'runtime read projections on isolated non-owner PostgreSQL',
  { timeout: 60000 },
  () => {
    const suffix = randomUUID().replaceAll('-', ''),
      database = `numora_test_runtime_${suffix}`,
      login = `runtime_reads_${suffix}`;
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOW_SYNTHETIC_CONTENT: process.env.ALLOW_SYNTHETIC_CONTENT,
      DB_POOL_MAX: process.env.DB_POOL_MAX,
    };
    let admin: postgres.Sql,
      owner: postgres.Sql,
      fixture: Awaited<ReturnType<typeof pvpFixture>>,
      engine: PvpEngineService;
    let now = new Date(),
      matchId: string,
      versionId: string;
    async function measured<T>(run: () => Promise<T>) {
      await closeDatabaseConnection();
      const original = process.env.DATABASE_URL!,
        remote = new URL(original),
        host = remote.hostname,
        port = Number(remote.port || 5432);
      let bytes = 0,
        queries = 0,
        counting = false,
        buffer: Buffer = Buffer.alloc(0);
      const sockets = new Set<Socket>();
      const proxy = createServer((downstream) => {
        const upstream = connect(port, host);
        for (const socket of [upstream, downstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => {
            upstream.destroy();
            downstream.destroy();
          });
        }
        upstream.on('data', (chunk) => {
          if (counting) bytes += chunk.length;
        });
        downstream.on('data', (chunk) => {
          if (!counting) return;
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 5) {
            const length = buffer.readInt32BE(1) + 1;
            if (buffer.length < length) break;
            if (buffer[0] === 69 || buffer[0] === 81) queries++;
            buffer = buffer.subarray(length);
          }
        });
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      try {
        await new Promise<void>((done, fail) =>
          proxy.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = proxy.address();
        if (!address || typeof address === 'string') throw new Error('TEST proxy missing');
        remote.hostname = '127.0.0.1';
        remote.port = String(address.port);
        process.env.DATABASE_URL = remote.toString();
        await getDatabase().client`select 1`;
        counting = true;
        const value = await run();
        return { value, bytes, queries };
      } finally {
        counting = false;
        await closeDatabaseConnection();
        process.env.DATABASE_URL = original;
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => proxy.close(() => done()));
      }
    }
    beforeAll(async () => {
      const url = new URL(testUrl!);
      if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Dedicated localhost PostgreSQL required');
      await closeDatabaseConnection();
      admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      url.pathname = '/' + database;
      owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await migrate(drizzle(owner), {
        migrationsFolder: resolve('../../packages/database/drizzle'),
      });
      const password = randomUUID();
      await admin.unsafe(
        `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
      );
      await admin.unsafe(`GRANT numora_main_runtime TO "${login}"`);
      url.username = login;
      url.password = password;
      process.env.DATABASE_URL = url.toString();
      process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
      process.env.DB_POOL_MAX = '1';
      fixture = await pvpFixture();
      engine = new PvpEngineService(fixture.policy);
      vi.spyOn(engine, 'now').mockImplementation(() => now);
      const versions = await getDatabase()
        .db.select({ id: packageItems.questionVersionId })
        .from(packageItems)
        .where(eq(packageItems.packageId, fixture.pack.id));
      await getDatabase()
        .db.update(questionVersions)
        .set({ contentFingerprint: 'a'.repeat(64) })
        .where(
          inArray(
            questionVersions.id,
            versions.map((v) => v.id),
          ),
        );
    }, 120000);
    afterAll(async () => {
      await engine?.onModuleDestroy();
      vi.restoreAllMocks();
      await closeDatabaseConnection();
      await owner?.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
        await admin.unsafe(`DROP ROLE IF EXISTS "${login}"`);
        await admin.end();
      }
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }, 60000);
    const student = (i: number) => fixture.students[i]!.id;
    it('bounds idle reads and preserves repeated PvP snapshot, decoder and delivery behavior', async () => {
      const scheduler = new PvpSchedulerService(engine, null);
      const idleSweep = await measured(() =>
        (scheduler as unknown as { sweep: () => Promise<void> }).sweep(),
      );
      const idleDiscovery = await measured(() => discoverNotificationReleases());
      const idleDrain = await measured(() => drainNotificationBatch());
      const room = await engine.create(student(0), 'easy', randomUUID());
      matchId = room.matchId;
      await engine.join(student(1), room.roomCode);
      await engine.ready(student(0), matchId);
      await engine.ready(student(1), matchId);
      await engine.start(student(0), matchId);
      const initial = await engine.snapshot(student(0), matchId);
      const [question] = await getDatabase()
        .db.select()
        .from(pvpMatchQuestions)
        .where(and(eq(pvpMatchQuestions.matchId, matchId), eq(pvpMatchQuestions.status, 'ACTIVE')));
      versionId = question!.questionVersionId;
      const deliveries = await getDatabase()
        .client`select count(*)::integer as n from student_item_exposures where student_id=${student(0)} and question_version_id=${versionId} and module='PVP'`;
      expect(deliveries[0]!.n).toBe(1);
      const snapshot = await measured(() => engine.snapshot(student(0), matchId));
      expect(snapshot.value).toEqual(initial);
      expect(snapshot.value.question).toMatchObject({
        answered: false,
        selectedOptionId: null,
        order: 1,
      });
      const later = await getDatabase()
        .client`select count(*)::integer as n from student_item_exposures where student_id=${student(0)} and question_version_id=${versionId} and module='PVP'`;
      expect(later[0]!.n).toBe(deliveries[0]!.n);
      expect(JSON.stringify(snapshot.value)).not.toMatch(
        /answerKey|explanation|correctOptionId|email/,
      );
      const sweep = await measured(() =>
        (scheduler as unknown as { sweep: () => Promise<void> }).sweep(),
      );
      console.info(
        JSON.stringify({
          measurement: 'runtime_reads',
          idleSweep: { bytes: idleSweep.bytes, queries: idleSweep.queries },
          idleDiscovery: { bytes: idleDiscovery.bytes, queries: idleDiscovery.queries },
          idleDrain: { bytes: idleDrain.bytes, queries: idleDrain.queries },
          snapshot: { bytes: snapshot.bytes, queries: snapshot.queries },
          activeSweepNoRedis: { bytes: sweep.bytes, queries: sweep.queries },
        }),
      );
      expect(snapshot.bytes).toBeLessThan(4500);
      await expect(engine.snapshot(student(2), matchId)).rejects.toMatchObject({ status: 403 });
    });
    it('retains own unanswered/answered selection and immutable scoring through the server deadline', async () => {
      const before = await engine.snapshot(student(0), matchId);
      const id = before.question!.id;
      await engine.answer(student(0), matchId, id, 'A', randomUUID());
      expect((await engine.snapshot(student(0), matchId)).question).toMatchObject({
        answered: true,
        selectedOptionId: 'A',
      });
      expect((await engine.snapshot(student(1), matchId)).question).toMatchObject({
        answered: false,
        selectedOptionId: null,
      });
      now = new Date(before.question!.deadlineAt);
      await engine.tick(matchId);
      const next = await engine.snapshot(student(1), matchId);
      expect(next.question!.order).toBe(2);
      const own = await getDatabase()
        .db.select()
        .from(pvpAnswers)
        .where(eq(pvpAnswers.matchQuestionId, id));
      expect(own).toHaveLength(2);
      const players = await getDatabase()
        .db.select()
        .from(pvpPlayers)
        .where(eq(pvpPlayers.matchId, matchId));
      expect(players.some((p) => Number(p.totalPoints) > 0)).toBe(true);
      await engine.leave(student(0), matchId);
      expect((await engine.snapshot(student(1), matchId)).question).toBeNull();
    });
    it('keeps notification fan-out output and durable cursor while reducing package presentation bytes', async () => {
      const [pack] = await getDatabase()
        .db.insert(assessmentPackages)
        .values({
          familyCode: suffix,
          packageVersion: 1,
          name: 'TEST notification title',
          assessmentType: 'TRYOUT',
          isDemo: true,
        })
        .returning();
      await getDatabase()
        .client`update assessment_packages set import_source=${JSON.stringify({ testOnly: 'X'.repeat(32768) })}::text::jsonb where id=${pack!.id}`;
      await getDatabase().db.transaction((tx) =>
        enqueueNotification(tx, { kind: 'TRYOUT_OPENED', sourceId: pack!.id }),
      );
      const first = await measured(() => drainNotificationBatch(1, 1));
      expect(first.value.delivered).toBe(1);
      const [event] = await getDatabase()
        .db.select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.sourceKey, `TRYOUT_OPENED:${pack!.id}`));
      expect(event!.cursor).not.toBeNull();
      expect(event!.processedAt).toBeNull();
      await drainNotificationBatch(20, 1);
      const rows = await getDatabase()
        .db.select()
        .from(notifications)
        .where(eq(notifications.sourceKey, event!.sourceKey));
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((row) => row.recipientId)).size).toBe(3);
      for (const row of rows)
        expect(row).toMatchObject({
          title: 'TEST notification title',
          body: 'Paket Tryout sudah dapat dikerjakan. Buka paket untuk melihat ketentuan dan status pengerjaanmu.',
          context: { packageId: pack!.id },
        });
      expect((await drainNotificationBatch()).delivered).toBe(0);
      console.info(
        JSON.stringify({
          measurement: 'notification_package_presentation',
          bytes: first.bytes,
          queries: first.queries,
          metadataBytes: 32768,
        }),
      );
      expect(first.bytes).toBeLessThan(4500);
    });
  },
);
