import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  assessmentAttempts,
  getDatabase,
  learningVideos,
  questionReports,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';
databaseSuite('Student reports and recommendations through HTTP/PostgreSQL', () => {
  const fixture = installFerdiFixture();
  it('protects Student support and rejects forged reporter IDs', async () => {
    const { request, attemptId, itemId, other } = fixture;
    expect(
      (await request(`students/me/drill-attempts/${attemptId}/videos`, 'GET', undefined, 'teacher'))
        .status,
    ).toBe(403);
    expect(
      (
        await request(
          'students/me/question-reports',
          'POST',
          { attemptItemId: itemId, category: 'QUESTION', reporterStudentId: other },
          'student',
        )
      ).status,
    ).toBe(400);
  });
  it('does not expose unsafe URLs from imported READY video metadata', async () => {
    const { db } = getDatabase();
    const [video] = await db
      .insert(learningVideos)
      .values({
        title: 'TEST unsafe',
        url: 'javascript:alert(1)',
        source: 'TEST',
        curationStatus: 'READY',
      })
      .returning();
    const [mapping] = await db
      .insert(videoSubchapterMappings)
      .values({
        videoId: video!.id,
        subchapterId: fixture.subchapter,
        recommendationOrder: 1,
        status: 'READY',
      })
      .returning();
    try {
      expect(
        await (
          await fixture.request(
            `students/me/drill-attempts/${fixture.attemptId}/videos`,
            'GET',
            undefined,
            'student',
          )
        ).json(),
      ).toEqual({ items: [] });
    } finally {
      await db
        .update(videoSubchapterMappings)
        .set({ status: 'ARCHIVED' })
        .where(eq(videoSubchapterMappings.id, mapping!.id));
    }
  });
  it('returns only curated recommendations, caps three, and scopes reports to actual owned items', async () => {
    const { request, subchapter, attemptId, itemId, student } = fixture;
    const { db } = getDatabase();
    for (const url of [
      'https://youtube.com.example.test/watch?v=TESTVIDEO00',
      'https://example.test/lesson',
    ]) {
      const [unsafe] = await db
        .insert(learningVideos)
        .values({
          title: 'TEST spoofed imported URL',
          url,
          source: 'TEST',
          curationStatus: 'READY',
        })
        .returning();
      await db.insert(videoSubchapterMappings).values({
        videoId: unsafe!.id,
        subchapterId: subchapter,
        recommendationOrder: 1,
        status: 'READY',
      });
    }
    for (let i = 0; i < 5; i++) {
      const [video] = await db
        .insert(learningVideos)
        .values({
          title: `TEST video ${i}`,
          url: `https://www.youtube.com/watch?v=TESTVIDEO0${i}`,
          source: 'TEST',
          curationStatus: i === 0 ? 'DRAFT' : 'READY',
        })
        .returning();
      await db.insert(videoSubchapterMappings).values({
        videoId: video!.id,
        subchapterId: subchapter,
        recommendationOrder: i + 1,
        status: 'READY',
      });
    }
    const videos = (await (
      await request(`students/me/drill-attempts/${attemptId}/videos`, 'GET', undefined, 'student')
    ).json()) as { items: { mappingId: string; title: string }[] };
    expect(videos.items.map((v) => v.title)).toEqual([
      'TEST video 1',
      'TEST video 2',
      'TEST video 3',
    ]);
    expect(
      (await request(`students/me/drill-attempts/${attemptId}/videos`, 'GET', undefined, 'other'))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          'students/me/question-reports',
          'POST',
          { attemptItemId: itemId, category: 'QUESTION' },
          'other',
        )
      ).status,
    ).toBe(404);
    const report = await request(
      'students/me/question-reports',
      'POST',
      { attemptItemId: itemId, category: 'QUESTION', details: 'TEST issue' },
      'student',
    );
    expect(report.status).toBe(201);
    const id = ((await report.json()) as { id: string }).id;
    const [stored] = await db.select().from(questionReports).where(eq(questionReports.id, id));
    expect(stored!.reporterStudentId).toBe(student);
    expect(
      (
        await request(
          'students/me/video-reports',
          'POST',
          { attemptId, mappingId: randomUUID(), category: 'QUESTION' },
          'student',
        )
      ).status,
    ).toBe(404);
    const vr = await request(
      'students/me/video-reports',
      'POST',
      { attemptId, mappingId: videos.items[0]!.mappingId, category: 'QUESTION' },
      'student',
    );
    expect(vr.status).toBe(201);
    expect(
      await db
        .select()
        .from(videoReports)
        .where(eq(videoReports.mappingId, videos.items[0]!.mappingId)),
    ).toHaveLength(1);
    const [source] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId));
    const [mastered] = await db
      .insert(assessmentAttempts)
      .values({ ...source!, id: randomUUID(), score0To100: '80' })
      .returning();
    expect(
      await (
        await request(
          `students/me/drill-attempts/${mastered!.id}/videos`,
          'GET',
          undefined,
          'student',
        )
      ).json(),
    ).toEqual({ items: [] });
  });
  it('keeps concurrent report retries idempotent and rejects reuse for another actor or payload', async () => {
    const { db } = getDatabase();
    const questionBody = {
      clientRequestId: randomUUID(),
      attemptItemId: fixture.itemId,
      category: 'QUESTION',
      details: 'Same issue',
    };
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        fixture.request('students/me/question-reports', 'POST', questionBody, 'student'),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const ids = await Promise.all(
      responses.map(async (r) => ((await r.json()) as { id: string }).id),
    );
    expect(ids).toEqual([questionBody.clientRequestId, questionBody.clientRequestId]);
    expect(
      await db
        .select()
        .from(questionReports)
        .where(eq(questionReports.id, questionBody.clientRequestId)),
    ).toHaveLength(1);
    for (const [token, body] of [
      ['other', questionBody],
      ['student', { ...questionBody, details: 'Different' }],
    ] as const)
      expect(
        (await fixture.request('students/me/question-reports', 'POST', body, token)).status,
      ).toBe(409);
    const videos = (await (
      await fixture.request(
        `students/me/drill-attempts/${fixture.attemptId}/videos`,
        'GET',
        undefined,
        'student',
      )
    ).json()) as { items: { mappingId: string }[] };
    const videoBody = {
      clientRequestId: randomUUID(),
      attemptId: fixture.attemptId,
      mappingId: videos.items[0]!.mappingId,
      category: 'TEST video retry',
    };
    const sent = await Promise.all(
      Array.from({ length: 2 }, () =>
        fixture.request('students/me/video-reports', 'POST', videoBody, 'student'),
      ),
    );
    expect(sent.map((r) => r.status)).toEqual([201, 201]);
    const [stored] = await db
      .select()
      .from(videoReports)
      .where(eq(videoReports.id, videoBody.clientRequestId));
    expect(stored!.attemptContext).toMatchObject({
      attemptId: fixture.attemptId,
      levelId: fixture.level,
      subchapterId: fixture.subchapter,
    });
    const [original] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, fixture.attemptId));
    const [different] = await db
      .insert(assessmentAttempts)
      .values({ ...original!, id: randomUUID() })
      .returning();
    expect(
      (
        await fixture.request(
          'students/me/video-reports',
          'POST',
          { ...videoBody, attemptId: different!.id },
          'student',
        )
      ).status,
    ).toBe(409);
    expect(
      await db.select().from(videoReports).where(eq(videoReports.id, videoBody.clientRequestId)),
    ).toHaveLength(1);
    // More requests than the default pool capacity must not acquire a second connection inside a transaction.
    const burst = await Promise.all(
      Array.from({ length: 12 }, () =>
        fixture.request(
          'students/me/video-reports',
          'POST',
          { ...videoBody, clientRequestId: randomUUID() },
          'student',
        ),
      ),
    );
    expect(burst.map((response) => response.status)).toEqual(Array(12).fill(201));
    await db
      .update(videoSubchapterMappings)
      .set({ status: 'ARCHIVED' })
      .where(eq(videoSubchapterMappings.id, videoBody.mappingId));
    expect(
      (await fixture.request('students/me/video-reports', 'POST', videoBody, 'student')).status,
    ).toBe(201);
    expect(
      (
        await fixture.request(
          'students/me/video-reports',
          'POST',
          { ...videoBody, category: 'Different' },
          'student',
        )
      ).status,
    ).toBe(409);
  });
});
