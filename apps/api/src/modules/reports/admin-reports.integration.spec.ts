import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  auditLogs,
  assessmentPackages,
  attemptItems,
  chapters,
  competencies,
  getDatabase,
  learningVideos,
  questionVersions,
  questionReports,
  subchapters,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';
import type { AdminTransaction } from '../audit/admin-mutation';

async function raceWithUncommittedChange<T>(
  first: (tx: AdminTransaction) => Promise<unknown>,
  second: () => Promise<T>,
) {
  const { db } = getDatabase();
  let pending!: Promise<T>;
  await db.transaction(async (tx) => {
    const [blocker] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    await first(tx);
    pending = second();
    await expect
      .poll(async () => {
        const [result] = await db.execute<{ blocked: boolean }>(sql`
        select exists(select 1 from pg_stat_activity where ${blocker!.pid} = any(pg_blocking_pids(pid))) as blocked
      `);
        return result?.blocked;
      })
      .toBe(true);
  });
  return pending;
}
databaseSuite('Admin historical moderation through HTTP/PostgreSQL', () => {
  const fixture = installFerdiFixture();
  it('pins the reported question, validates revision lineage and audits resolution without exposing learner responses', async () => {
    const { request } = fixture;
    const create = await request(
      'students/me/question-reports',
      'POST',
      { attemptItemId: fixture.itemId, category: 'ANSWER_KEY', clientRequestId: randomUUID() },
      'student',
    );
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    const original = await (await request(`admin/reports/QUESTION/${id}`)).json();
    expect(original).toMatchObject({ id, status: 'OPEN', caseRevision: 0, reportCount: 1 });
    expect(original.question.id).toBe(fixture.versionIds[0]);
    expect(JSON.stringify(original)).not.toMatch(
      /reporterStudentId|awardedPoints|fullyCorrect|authUserId/,
    );
    const revise = await request(
      `admin/content/versions/${original.question.id}/revisions`,
      'POST',
      {
        stem: 'TEST revised question',
        options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
        answerOptionId: 'B',
        explanation: 'TEST revision explanation',
        difficulty: 'EASY',
      },
    );
    expect(revise.status).toBe(201);
    const next = (await revise.json()) as { id: string };
    const closeBody = { status: 'RESOLVED', followUp: 'TEST fixed in revision' };
    expect(
      (
        await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
          ...closeBody,
          expectedRevision: 0,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `admin/reports/QUESTION/${id}`,
          'PATCH',
          {
            status: 'IN_REVIEW',
            expectedRevision: 0,
          },
          'operations',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
          status: 'IN_REVIEW',
          expectedRevision: 0,
        })
      ).status,
    ).toBe(200);
    const mismatch = await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
      status: 'RESOLVED',
      expectedRevision: 1,
      followUp: 'TEST wrong lineage',
      revisionQuestionVersionId: fixture.versionIds[1],
    });
    expect(mismatch.status).toBe(400);
    expect(
      (
        await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
          ...closeBody,
          expectedRevision: 1,
          revisionQuestionVersionId: next.id,
        })
      ).status,
    ).toBe(200);
    const after = await (await request(`admin/reports/QUESTION/${id}`)).json();
    expect(after.question.id).toBe(original.question.id);
    expect(after.question.payload.stem.text).toBe(original.question.payload.stem.text);
    expect(after.revisionQuestionVersionId).toBe(next.id);
    const { db } = getDatabase();
    expect(
      (await db.select().from(auditLogs).where(eq(auditLogs.entityId, id))).map((r) => r.metadata),
    ).toContainEqual(
      expect.objectContaining({ status: 'RESOLVED', reason: 'TEST fixed in revision' }),
    );
    expect(
      (
        await request(`admin/content/versions/${original.question.id}/review`, 'POST', {
          status: 'ARCHIVED',
          expectedStatus: 'READY',
          reason: 'TEST active reference',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await db
          .select()
          .from(questionVersions)
          .where(eq(questionVersions.id, original.question.id))
      )[0]?.contentStatus,
    ).toBe('READY');
    const filtered = await (
      await request(
        `admin/reports?kind=QUESTION&status=RESOLVED&category=ANSWER_KEY&from=${encodeURIComponent(original.reportedAt)}&to=${encodeURIComponent(new Date(Date.parse(original.reportedAt) + 1).toISOString())}&limit=1`,
      )
    ).json();
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].id).toBe(id);
    expect(filtered.nextOffset).toBeNull();

    const incoming = Array.from({ length: 2 }, () => ({
      attemptItemId: fixture.itemId,
      category: 'EXPLANATION',
      clientRequestId: randomUUID(),
    }));
    const reports = await Promise.all(
      incoming.map((body) => request('students/me/question-reports', 'POST', body, 'student')),
    );
    expect(reports.map((report) => report.status)).toEqual([201, 201]);
    const reopened = await (
      await request(`admin/reports/QUESTION/${incoming[0]!.clientRequestId}`)
    ).json();
    expect(reopened).toMatchObject({
      id,
      status: 'OPEN',
      caseRevision: 4,
      reportCount: 3,
      revisionQuestionVersionId: null,
    });
    expect(reopened.sourceReports.map((source: { id: string }) => source.id).sort()).toEqual(
      [id, ...incoming.map((body) => body.clientRequestId)].sort(),
    );
    expect(reopened.history).toMatchObject([
      { status: 'OPEN', reason: 'Laporan baru diterima.' },
      { status: 'RESOLVED', reason: closeBody.followUp, revisionQuestionVersionId: next.id },
      { status: 'IN_REVIEW' },
    ]);
    expect(
      (await request('students/me/question-reports', 'POST', incoming[0]!, 'student')).status,
    ).toBe(201);
    expect(await (await request(`admin/reports/QUESTION/${id}`)).json()).toMatchObject({
      caseRevision: 4,
      reportCount: 3,
    });
    expect(
      (await db.select().from(questionReports).where(eq(questionReports.id, id)))[0],
    ).toMatchObject({ status: 'OPEN', followUp: null });

    expect(
      (
        await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
          status: 'IN_REVIEW',
          expectedRevision: 4,
        })
      ).status,
    ).toBe(200);
    const [newReport, close] = await Promise.all([
      request(
        'students/me/question-reports',
        'POST',
        {
          ...incoming[0],
          clientRequestId: randomUUID(),
        },
        'student',
      ),
      request(`admin/reports/QUESTION/${id}`, 'PATCH', { ...closeBody, expectedRevision: 5 }),
    ]);
    expect(newReport.status).toBe(201);
    expect([200, 409]).toContain(close.status);
    expect(await (await request(`admin/reports/QUESTION/${id}`)).json()).toMatchObject({
      status: close.status === 200 ? 'OPEN' : 'IN_REVIEW',
      reportCount: 4,
    });
  });
  it('opens snapshot video targets outside the current metadata page and preserves report context', async () => {
    const { db, client } = getDatabase();
    const [video] = await db
      .insert(learningVideos)
      .values({
        title: 'TEST original video',
        url: 'https://www.youtube.com/watch?v=TESTVIDEO00',
        source: 'TEST',
      })
      .returning();
    const [mapping] = await db
      .insert(videoSubchapterMappings)
      .values({ videoId: video!.id, subchapterId: fixture.subchapter, recommendationOrder: 95 })
      .returning();
    const [report] = await db
      .insert(videoReports)
      .values({
        reporterStudentId: fixture.student,
        mappingId: mapping!.id,
        category: 'TEST_VIDEO_SNAPSHOT',
        targetSnapshot: {
          title: video!.title,
          url: video!.url,
          source: video!.source,
          videoId: video!.id,
          subchapterId: fixture.subchapter,
          recommendationOrder: 95,
        },
      })
      .returning();
    await db
      .update(learningVideos)
      .set({ title: 'TEST changed video' })
      .where(eq(learningVideos.id, video!.id));
    const response = await fixture.request(`admin/reports/VIDEO/${report!.id}`);
    expect(response.status).toBe(200);
    expect((await response.json()).video).toMatchObject({
      title: 'TEST original video',
      evidence: 'REPORT_SNAPSHOT',
      recommendationOrder: 95,
    });
    await expect(
      client`UPDATE video_reports SET target_snapshot='{}' WHERE id=${report!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await fixture.request(`admin/reports/VIDEO/${report!.id}`, 'GET', undefined, 'student'))
        .status,
    ).toBe(403);
  });

  it('blocks archive while published packages depend on the material and preserves historical items', async () => {
    const { db } = getDatabase();
    const [subchapter] = await db
      .select()
      .from(subchapters)
      .where(eq(subchapters.id, fixture.subchapter));
    const [competency] = await db
      .select()
      .from(competencies)
      .where(eq(competencies.subchapterId, fixture.subchapter));
    const [historicalItem] = await db
      .select()
      .from(attemptItems)
      .where(eq(attemptItems.id, fixture.itemId));
    const targets = [
      ['chapters', subchapter!.chapterId],
      ['subchapters', fixture.subchapter],
      ['competencies', competency!.id],
      ['levels', fixture.level],
    ];
    for (const [resource, target] of targets) {
      const response = await fixture.request(`admin/content/${resource}/${target}`, 'PATCH', {
        status: 'ARCHIVED',
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'CURRICULUM_USED_BY_ACTIVE_PACKAGES',
        detail: expect.stringContaining('TEST canonical'),
      });
    }
    await db
      .update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(eq(assessmentPackages.id, fixture.canonicalPackage));
    const concurrentArchive = await raceWithUncommittedChange(
      async (tx) =>
        tx
          .update(assessmentPackages)
          .set({ status: 'PUBLISHED' })
          .where(eq(assessmentPackages.id, fixture.canonicalPackage)),
      () =>
        fixture.request(`admin/content/chapters/${subchapter!.chapterId}`, 'PATCH', {
          status: 'ARCHIVED',
        }),
    );
    expect(concurrentArchive.status).toBe(409);
    await db
      .update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(eq(assessmentPackages.id, fixture.canonicalPackage));
    const concurrentPublish = await raceWithUncommittedChange(
      async (tx) =>
        tx
          .update(chapters)
          .set({ status: 'ARCHIVED' })
          .where(eq(chapters.id, subchapter!.chapterId)),
      () =>
        db
          .update(assessmentPackages)
          .set({ status: 'PUBLISHED' })
          .where(eq(assessmentPackages.id, fixture.canonicalPackage))
          .then(
            () => null,
            (error: unknown) => error,
          ),
    );
    expect(concurrentPublish).toMatchObject({
      cause: { constraint_name: 'package_archived_curriculum' },
    });
    for (const [resource, target] of targets) {
      expect(
        (
          await fixture.request(`admin/content/${resource}/${target}`, 'PATCH', {
            status: 'ARCHIVED',
          })
        ).status,
      ).toBe(200);
    }
    expect(await db.select().from(attemptItems).where(eq(attemptItems.id, fixture.itemId))).toEqual(
      [historicalItem],
    );
    expect(
      (await db.select().from(chapters).where(eq(chapters.id, subchapter!.chapterId)))[0]?.status,
    ).toBe('ARCHIVED');
    await expect(
      db
        .update(assessmentPackages)
        .set({ status: 'PUBLISHED' })
        .where(eq(assessmentPackages.id, fixture.canonicalPackage)),
    ).rejects.toMatchObject({ cause: { constraint_name: 'package_archived_curriculum' } });
  });
});
