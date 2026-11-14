import { randomUUID } from 'node:crypto';
import { connect, createServer, type Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  getDatabase,
  closeDatabaseConnection,
  users,
  schools,
  classes,
  classMemberships,
  assessmentPackages,
  assessmentAttempts,
  xpLedger,
  pvpMatches,
  pvpPlayers,
  leaderboardPeriods,
  classLeaderboardEntries,
  globalActivityLeaderboardEntries,
  pvpBestRecords,
  pvpLeaderboardEntries,
} from '@tka/database';
import { projectClassLeaderboard } from './class-leaderboard.js';
import { projectLeaderboardRows } from './leaderboard-projection.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'SQL projection writes and transfer on isolated localhost',
  { timeout: 60000 },
  () => {
    afterAll(closeDatabaseConnection);
    const db = () => getDatabase().db;
    async function measured<T>(run: () => Promise<T>) {
      await closeDatabaseConnection();
      const original = process.env.DATABASE_URL!,
        previousPool = process.env.DB_POOL_MAX,
        url = new URL(original),
        host = url.hostname,
        port = Number(url.port || 5432);
      let bytes = 0,
        counting = false;
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
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      try {
        await new Promise<void>((done, fail) =>
          proxy.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = proxy.address();
        if (!address || typeof address === 'string') throw new Error('TEST proxy missing');
        url.hostname = '127.0.0.1';
        url.port = String(address.port);
        process.env.DATABASE_URL = url.toString();
        process.env.DB_POOL_MAX = '1';
        await getDatabase().client`select 1`;
        counting = true;
        const started = performance.now();
        const value = await run();
        return { value, bytes, durationMs: Math.round(performance.now() - started) };
      } finally {
        counting = false;
        await closeDatabaseConnection();
        process.env.DATABASE_URL = original;
        if (previousPool === undefined) delete process.env.DB_POOL_MAX;
        else process.env.DB_POOL_MAX = previousPool;
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => proxy.close(() => done()));
      }
    }
    it('keeps dense ties, modes, best records and archive while avoiding unchanged rewrites', async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      const suffix = randomUUID().replaceAll('-', ''),
        marker = `test_projection_${suffix}`;
      const students = await db()
        .insert(users)
        .values(
          Array.from({ length: 30 }, (_, i) => ({
            authUserId: randomUUID(),
            role: 'STUDENT' as const,
            displayName: 'TEST ' + i,
            email: `${suffix}-${i}@example.test`,
          })),
        )
        .returning();
      const [school] = await db()
        .insert(schools)
        .values({ code: suffix, name: 'TEST' })
        .returning();
      const [group] = await db()
        .insert(classes)
        .values({ schoolId: school!.id, name: 'TEST', joinCode: suffix })
        .returning();
      const now = new Date(Date.now() + 60000);
      await db()
        .insert(classMemberships)
        .values(
          students.map((student) => ({
            classId: group!.id,
            studentUserId: student.id,
            joinedAt: new Date(now.getTime() - 86400000),
          })),
        );
      const [pack] = await db()
        .insert(assessmentPackages)
        .values({
          familyCode: suffix,
          packageVersion: 1,
          name: 'TEST',
          assessmentType: 'TRYOUT',
          isDemo: true,
        })
        .returning();
      const attempts = await db()
        .insert(assessmentAttempts)
        .values(
          students.map((student) => ({
            studentId: student.id,
            packageId: pack!.id,
            assessmentType: 'TRYOUT' as const,
            status: 'GRADED' as const,
            startedAt: new Date(now.getTime() - 2000),
            finishedAt: new Date(now.getTime() - 1000),
          })),
        )
        .returning();
      await db()
        .insert(xpLedger)
        .values(
          students.map((student, i) => ({
            studentId: student.id,
            attemptId: attempts[i]!.id,
            sourceType: 'TRYOUT' as const,
            xpAmount: [12.125, 12.125, 7, 0][i % 4]!,
            occurredAt: new Date(now.getTime() - 1000),
          })),
        );
      const records = await db()
        .insert(pvpMatches)
        .values(
          Array.from({ length: 150 }, (_, i) => ({
            roomCode: randomUUID(),
            packageId: pack!.id,
            creatorStudentId: students[i % 30]!.id,
            difficulty: 'easy',
            dataMode: i % 2 === 0 ? ('demo' as const) : ('official' as const),
            status: 'FINISHED' as const,
            endReason: 'COMPLETED',
            recordEligible: true,
            startedAt: new Date(now.getTime() - 5000),
            endedAt: new Date(now.getTime() - 2000),
          })),
        )
        .returning();
      await db()
        .insert(pvpPlayers)
        .values(
          records.map((match, i) => ({
            matchId: match.id,
            studentId: match.creatorStudentId,
            playerSlot: 1,
            totalPoints: String(100 + (i % 3)),
          })),
        );
      const tables = [
        'class_leaderboard_entries',
        'global_activity_leaderboard_entries',
        'pvp_best_records',
        'pvp_leaderboard_entries',
      ];
      await db().execute(sql.raw(`CREATE TABLE ${marker}(operation text)`));
      await db().execute(sql.raw(`GRANT INSERT,SELECT ON ${marker} TO numora_main_runtime`));
      await db().execute(
        sql.raw(
          `CREATE FUNCTION ${marker}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.${marker} VALUES(TG_OP); RETURN NULL; END $$`,
        ),
      );
      for (const table of tables)
        await db().execute(
          sql.raw(
            `CREATE TRIGGER ${marker} AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${marker}()`,
          ),
        );
      try {
        const first = await measured(() => projectClassLeaderboard(now));
        const [before] = await db().execute<{ n: number }>(
          sql.raw(`SELECT count(*)::integer AS n FROM ${marker}`),
        );
        const rows = await db()
          .select()
          .from(classLeaderboardEntries)
          .where(eq(classLeaderboardEntries.periodId, first.value.periodId));
        const repeat = await measured(() =>
          projectClassLeaderboard(new Date(now.getTime() + 1000)),
        );
        const [after] = await db().execute<{ n: number }>(
          sql.raw(`SELECT count(*)::integer AS n FROM ${marker}`),
        );
        const rewritten = after!.n - before!.n;
        const stable = await db()
          .select()
          .from(classLeaderboardEntries)
          .where(eq(classLeaderboardEntries.periodId, first.value.periodId));
        console.info(
          JSON.stringify({
            measurement: 'leaderboard_projection',
            students: 30,
            matches: 150,
            freshBytes: first.bytes,
            repeatBytes: repeat.bytes,
            repeatRowWrites: rewritten,
            freshDurationMs: first.durationMs,
            repeatDurationMs: repeat.durationMs,
          }),
        );
        expect(rewritten).toBe(0);
        expect(first.bytes).toBeLessThan(10000);
        expect(stable).toEqual(rows);
        expect(rows.map((row) => [row.totalXp, row.rank]).sort((a, b) => b[0]! - a[0]!)).toEqual(
          students
            .map((_, i) => [[12.125, 12.125, 7, 0][i % 4]!, [1, 1, 2, 3][i % 4]!])
            .sort((a, b) => b[0]! - a[0]!),
        );
        const [period] = await db()
          .select()
          .from(leaderboardPeriods)
          .where(eq(leaderboardPeriods.id, first.value.periodId));
        const counts = await db().transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL ROLE numora_main_runtime`);
          return projectLeaderboardRows(tx, period!, now, false, now);
        });
        expect(counts).toMatchObject({ entries: 30, written: 0, removed: 0 });
        const best = await db()
          .select()
          .from(pvpBestRecords)
          .where(eq(pvpBestRecords.periodId, period!.id));
        expect(best).toHaveLength(30);
        // Equal points/time keep the same UUID tie-break as the old JavaScript order.
        for (const item of best) {
          const candidates = records
            .filter((record) => record.creatorStudentId === item.studentId)
            .sort((a, b) => a.id.localeCompare(b.id));
          expect(item.matchId).toBe(candidates[0]!.id);
        }
        const [extraPack] = await db()
          .insert(assessmentPackages)
          .values({
            familyCode: suffix + 'extra',
            packageVersion: 1,
            name: 'TEST',
            assessmentType: 'TRYOUT',
            isDemo: true,
          })
          .returning();
        const [extra] = await db()
          .insert(assessmentAttempts)
          .values({
            studentId: students[0]!.id,
            packageId: extraPack!.id,
            assessmentType: 'TRYOUT',
            status: 'GRADED',
            startedAt: new Date(now.getTime() - 1000),
            finishedAt: now,
          })
          .returning();
        await db()
          .insert(xpLedger)
          .values({
            studentId: students[0]!.id,
            sourceType: 'TRYOUT',
            attemptId: extra!.id,
            xpAmount: 1.125,
            occurredAt: now,
          });
        const sabotage = marker + '_fail';
        await db().execute(
          sql.raw(
            `CREATE FUNCTION ${sabotage}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY projection failure'; END $$`,
          ),
        );
        await db().execute(
          sql.raw(
            `CREATE TRIGGER ${sabotage} BEFORE INSERT ON global_activity_leaderboard_entries FOR EACH ROW EXECUTE FUNCTION ${sabotage}()`,
          ),
        );
        try {
          await expect(projectClassLeaderboard(now)).rejects.toThrow();
        } finally {
          await db().execute(
            sql.raw(`DROP TRIGGER ${sabotage} ON global_activity_leaderboard_entries`),
          );
          await db().execute(sql.raw(`DROP FUNCTION ${sabotage}()`));
        }
        expect(
          await db()
            .select()
            .from(classLeaderboardEntries)
            .where(eq(classLeaderboardEntries.periodId, period!.id)),
        ).toEqual(stable);
        await projectClassLeaderboard(now);
        const [changed] = await db()
          .select()
          .from(classLeaderboardEntries)
          .where(
            and(
              eq(classLeaderboardEntries.periodId, period!.id),
              eq(classLeaderboardEntries.studentId, students[0]!.id),
            ),
          );
        expect(changed).toMatchObject({
          id: stable.find((row) => row.studentId === students[0]!.id)!.id,
          totalXp: 13.25,
          rank: 1,
        });
        await db()
          .update(classMemberships)
          .set({ leftAt: new Date(now.getTime() - 500) })
          .where(eq(classMemberships.studentUserId, students[1]!.id));
        await db().update(users).set({ status: 'DISABLED' }).where(eq(users.id, students[2]!.id));
        await projectClassLeaderboard(now);
        expect(
          await db()
            .select()
            .from(classLeaderboardEntries)
            .where(
              and(
                eq(classLeaderboardEntries.periodId, period!.id),
                inArray(classLeaderboardEntries.studentId, [students[1]!.id, students[2]!.id]),
              ),
            ),
        ).toHaveLength(0);
        expect(
          await db()
            .select()
            .from(globalActivityLeaderboardEntries)
            .where(
              and(
                eq(globalActivityLeaderboardEntries.periodId, period!.id),
                eq(globalActivityLeaderboardEntries.studentId, students[1]!.id),
              ),
            ),
        ).toHaveLength(1);
        const nextWeek = new Date(now.getTime() + 7 * 86400000);
        await projectClassLeaderboard(nextWeek);
        const archived = await db()
          .select()
          .from(pvpLeaderboardEntries)
          .where(eq(pvpLeaderboardEntries.periodId, period!.id));
        const archivedClass = await db()
          .select()
          .from(classLeaderboardEntries)
          .where(eq(classLeaderboardEntries.periodId, period!.id));
        await projectClassLeaderboard(nextWeek);
        expect(
          await db()
            .select()
            .from(pvpLeaderboardEntries)
            .where(eq(pvpLeaderboardEntries.periodId, period!.id)),
        ).toEqual(archived);
        expect(
          await db()
            .select()
            .from(classLeaderboardEntries)
            .where(eq(classLeaderboardEntries.periodId, period!.id)),
        ).toEqual(archivedClass);
      } finally {
        for (const table of tables)
          await db().execute(sql.raw(`DROP TRIGGER ${marker} ON ${table}`));
        await db().execute(sql.raw(`DROP FUNCTION ${marker}()`));
        await db().execute(sql.raw(`DROP TABLE ${marker}`));
      }
    }, 120000);
  },
);
