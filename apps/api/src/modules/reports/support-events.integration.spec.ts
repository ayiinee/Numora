import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { analyticsOutbox, assessmentPackages, getDatabase, questionReports } from '@tka/database';
import { databaseSuite, installFerdiFixture } from '../content/ferdi-content.fixture';

databaseSuite('gated support interactions and transactional events', () => {
  const fixture = installFerdiFixture();
  it('authenticates even when disabled and does not record unapproved payloads', async () => {
    const previous = process.env.SUPPORT_ANALYTICS_ENABLED;
    delete process.env.SUPPORT_ANALYTICS_ENABLED;
    try {
      const body = { eventName: 'tryout_opened', clientRequestId: randomUUID() };
      expect(
        (await fixture.request('students/me/learning-interactions', 'POST', body, '')).status,
      ).toBe(401);
      const response = await fixture.request(
        'students/me/learning-interactions',
        'POST',
        body,
        'student',
      );
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ state: 'policyPending' });
      expect(
        await getDatabase()
          .db.select()
          .from(analyticsOutbox)
          .where(eq(analyticsOutbox.id, body.clientRequestId)),
      ).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
      else process.env.SUPPORT_ANALYTICS_ENABLED = previous;
    }
  });
  it('deduplicates concurrent interaction retries, derives actor, and rejects changed payload or ownership', async () => {
    const previous = process.env.SUPPORT_ANALYTICS_ENABLED;
    process.env.SUPPORT_ANALYTICS_ENABLED = 'true';
    try {
      const body = { eventName: 'tryout_opened', clientRequestId: randomUUID() };
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          fixture.request('students/me/learning-interactions', 'POST', body, 'student'),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
      const rows = await getDatabase()
        .db.select()
        .from(analyticsOutbox)
        .where(eq(analyticsOutbox.id, body.clientRequestId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorUserId: fixture.student, eventName: 'tryout_opened' });
      expect(
        (await fixture.request('students/me/learning-interactions', 'POST', body, 'other')).status,
      ).toBe(409);
      expect(
        (
          await fixture.request(
            'students/me/learning-interactions',
            'POST',
            { ...body, actorUserId: fixture.other },
            'student',
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await fixture.request(
            'students/me/learning-interactions',
            'POST',
            {
              clientRequestId: randomUUID(),
              eventName: 'video_clicked',
              attemptId: fixture.attemptId,
              mappingId: randomUUID(),
            },
            'other',
          )
        ).status,
      ).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
      else process.env.SUPPORT_ANALYTICS_ENABLED = previous;
    }
  });
  it('records one outbox event for a committed report across concurrent retries', async () => {
    const previous = process.env.SUPPORT_ANALYTICS_ENABLED;
    process.env.SUPPORT_ANALYTICS_ENABLED = 'true';
    try {
      const body = {
        clientRequestId: randomUUID(),
        attemptItemId: fixture.itemId,
        category: 'QUESTION',
      };
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          fixture.request('students/me/question-reports', 'POST', body, 'student'),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
      const events = await getDatabase()
        .db.select()
        .from(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.entityId, body.clientRequestId),
            eq(analyticsOutbox.eventName, 'question_reported'),
          ),
        );
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({
        attemptItemId: fixture.itemId,
        attemptId: fixture.attemptId,
        levelId: fixture.level,
        subchapterId: fixture.subchapter,
        category: 'QUESTION',
      });
    } finally {
      if (previous === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
      else process.env.SUPPORT_ANALYTICS_ENABLED = previous;
    }
  });
  it('records retry creation atomically and emits nothing twice when start resumes the same attempt', async () => {
    const previous = process.env.SUPPORT_ANALYTICS_ENABLED;
    process.env.SUPPORT_ANALYTICS_ENABLED = 'true';
    try {
      const created = await fixture.request(
        'admin/content/drill-packages',
        'POST',
        fixture.body,
        'admin',
      );
      expect(created.status).toBe(201);
      const { id: packageId } = await created.json();
      expect(
        (
          await fixture.request(
            `admin/content/drill-packages/${packageId}/publish`,
            'POST',
            undefined,
            'admin',
          )
        ).status,
      ).toBe(201);
      // Isolated fixture has no academic approval; explicitly retain synthetic provenance.
      await getDatabase()
        .db.update(assessmentPackages)
        .set({ isDemo: true })
        .where(eq(assessmentPackages.id, packageId));
      const responses = await Promise.all(
        Array.from({ length: 2 }, () =>
          fixture.request(
            'assessments/drill/attempts',
            'POST',
            { levelId: fixture.level },
            'student',
          ),
        ),
      );
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      const attempts = await Promise.all(responses.map((response) => response.json()));
      expect(attempts[1].id).toBe(attempts[0].id);
      const events = await getDatabase()
        .db.select()
        .from(analyticsOutbox)
        .where(eq(analyticsOutbox.id, attempts[0].id));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'level_retry',
        entityId: attempts[0].id,
        actorUserId: fixture.student,
      });
      expect(events[0]!.payload).toMatchObject({
        previousAttemptId: fixture.attemptId,
        packageId,
        levelId: fixture.level,
        subchapterId: fixture.subchapter,
      });
      expect(
        (
          await fixture.request(
            'students/me/learning-interactions',
            'POST',
            { clientRequestId: randomUUID(), eventName: 'level_retry', attemptId: attempts[0].id },
            'student',
          )
        ).status,
      ).toBe(400);
    } finally {
      if (previous === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
      else process.env.SUPPORT_ANALYTICS_ENABLED = previous;
    }
  });
  it('rolls back a report if its outbox insert fails, then permits the same request to retry', async () => {
    const previous = process.env.SUPPORT_ANALYTICS_ENABLED;
    process.env.SUPPORT_ANALYTICS_ENABLED = 'true';
    const db = getDatabase().db;
    const trigger = `test_outbox_${randomUUID().replaceAll('-', '')}`;
    const body = {
      clientRequestId: randomUUID(),
      attemptItemId: fixture.itemId,
      category: 'OPTION',
    };
    try {
      await db.execute(
        sql.raw(
          `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_user_id = '${fixture.student}' AND NEW.event_name = 'question_reported' THEN RAISE EXCEPTION 'TEST ONLY outbox unavailable'; END IF; RETURN NEW; END $$;`,
        ),
      );
      await db.execute(
        sql.raw(
          `CREATE TRIGGER ${trigger} BEFORE INSERT ON analytics_outbox FOR EACH ROW EXECUTE FUNCTION ${trigger}();`,
        ),
      );
      expect(
        (await fixture.request('students/me/question-reports', 'POST', body, 'student')).status,
      ).toBe(500);
      expect(
        await db.select().from(questionReports).where(eq(questionReports.id, body.clientRequestId)),
      ).toHaveLength(0);
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON analytics_outbox;`));
      expect(
        (await fixture.request('students/me/question-reports', 'POST', body, 'student')).status,
      ).toBe(201);
      expect(
        await db
          .select()
          .from(analyticsOutbox)
          .where(eq(analyticsOutbox.entityId, body.clientRequestId)),
      ).toHaveLength(1);
    } finally {
      await db.execute(
        sql.raw(
          `DROP TRIGGER IF EXISTS ${trigger} ON analytics_outbox; DROP FUNCTION IF EXISTS ${trigger}();`,
        ),
      );
      if (previous === undefined) delete process.env.SUPPORT_ANALYTICS_ENABLED;
      else process.env.SUPPORT_ANALYTICS_ENABLED = previous;
    }
  });
});
