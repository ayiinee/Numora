import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  auditLogs,
  getDatabase,
  learningVideos,
  questionVersions,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';
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
    const mismatch = await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
      status: 'RESOLVED',
      followUp: 'TEST wrong lineage',
      revisionQuestionVersionId: fixture.versionIds[1],
    });
    expect(mismatch.status).toBe(400);
    expect(
      (
        await request(`admin/reports/QUESTION/${id}`, 'PATCH', {
          status: 'RESOLVED',
          followUp: 'TEST fixed in revision',
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
      (await db.select().from(auditLogs).where(eq(auditLogs.entityId, id)))[0]?.metadata,
    ).toMatchObject({ status: 'RESOLVED', reason: 'TEST fixed in revision' });
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
});
