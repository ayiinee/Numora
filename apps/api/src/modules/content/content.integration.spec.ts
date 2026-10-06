import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ForbiddenException, UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import {
  assessmentPackages,
  auditLogs,
  chapters,
  closeDatabaseConnection,
  getDatabase,
  irtBatches,
  irtItemResults,
  learningVideos,
  packageItems,
  questionVersions,
  users,
  videoReports,
  videoSubchapterMappings,
} from '@tka/database';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { ContentModule } from './content.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminModule } from '../admin/admin.module';
import { IrtModule } from '../irt/irt.module';
import { ContentService } from './content.service';
import type {
  AdminCurriculumDto,
  AdminVersionDto,
  AdminVersionsDto,
  ContentMutationDto,
  QuestionContentDto,
} from './content.dto';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('Admin/content through HTTP and real PostgreSQL', () => {
  let app: INestApplication;
  let base: string;
  let admin: string;
  let student: string;
  let chapter: string;
  let subchapter: string;
  let competency: string;
  let version: string;
  let question: string;
  let variant: string;
  const suffix = randomUUID().slice(0, 8);
  const content: QuestionContentDto = {
    stem: 'TEST ONLY: 1 + 1 = ?',
    options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id === 'A' ? '2' : '3' })),
    answerOptionId: 'A',
    explanation: 'TEST ONLY: dua.',
    difficulty: 'TEST',
  };
  async function request(path: string, method = 'GET', body?: object, token = 'admin') {
    return fetch(`${base}/${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function mutation(
    path: string,
    body: object,
    method = 'POST',
  ): Promise<ContentMutationDto> {
    const response = await request(`admin/content/${path}`, method, body);
    const result = await response.json();
    expect(response.ok, JSON.stringify(result)).toBe(true);
    return result as ContentMutationDto;
  }
  beforeAll(async () => {
    if (
      !url ||
      !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) ||
      process.env.NODE_ENV !== 'test'
    )
      throw Error('Test database must be local and NODE_ENV=test.');
    process.env.DATABASE_URL = url;
    const [a, s] = await getDatabase()
      .db.insert(users)
      .values([
        {
          authUserId: randomUUID(),
          role: 'ADMIN',
          displayName: 'TEST Admin',
          email: `content-admin-${suffix}@example.test`,
        },
        {
          authUserId: randomUUID(),
          role: 'STUDENT',
          displayName: 'TEST Student',
          email: `content-student-${suffix}@example.test`,
        },
      ])
      .returning({ id: users.id });
    admin = a!.id;
    student = s!.id;
    // Only the provider boundary is substituted; HTTP guards, DTOs, services and DB transactions are real.
    // This does not establish real Google OAuth acceptance.
    const module = await Test.createTestingModule({
      imports: [ContentModule, ReportsModule, AdminModule, IrtModule],
    })
      .overrideProvider(IdentityService)
      .useValue({
        me: async (authorization?: string) => {
          if (
            !['Bearer admin', 'Bearer student', 'Bearer teacher', 'Bearer disabled'].includes(
              authorization ?? '',
            )
          )
            throw new UnauthorizedException();
          if (authorization === 'Bearer disabled') throw new ForbiddenException('Account disabled');
          return {
            id: authorization === 'Bearer admin' ? admin : student,
            role:
              authorization === 'Bearer admin'
                ? 'ADMIN'
                : authorization === 'Bearer teacher'
                  ? 'TEACHER'
                  : 'STUDENT',
            status: 'ACTIVE',
            adminRole: 'CONTENT_DATA_MODERATION',
          };
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  }, 30_000);
  afterAll(async () => {
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('rejects missing/invalid auth and non-Admin roles on every added controller', async () => {
    for (const path of [
      'admin/content/curriculum',
      'admin/reports',
      'admin/irt',
      'admin/dashboard',
      'admin/audit-logs',
    ]) {
      for (const token of ['', 'invalid']) {
        const r = await request(path, 'GET', undefined, token);
        expect(r.status).toBe(401);
        expect(r.headers.get('content-type')).toContain('application/problem+json');
      }
      for (const token of ['student', 'teacher', 'disabled'])
        expect((await request(path, 'GET', undefined, token)).status).toBe(403);
    }
    expect(
      (
        await request(
          'admin/content/chapters',
          'POST',
          { code: 'NOT-CREATED', name: 'Denied', displayOrder: 1 },
          'student',
        )
      ).status,
    ).toBe(403);
  });
  it('validates inputs, writes taxonomy transactionally, and rejects duplicate and forged actor IDs', async () => {
    const body = {
      code: `TEST-${suffix}`,
      name: `TEST chapter ${suffix}`,
      displayOrder: (parseInt(suffix, 16) % 2_000_000_000) + 1,
    };
    // UI is intentionally capped to 100k order; choose an unused positive slot in that range.
    body.displayOrder = (parseInt(suffix, 16) % 99_000) + 1000;
    expect(
      (await request('admin/content/chapters', 'POST', { ...body, actorId: student })).status,
    ).toBe(400);
    expect((await request('admin/content/chapters', 'POST', { ...body, name: '  ' })).status).toBe(
      400,
    );
    chapter = (await mutation('chapters', body)).id;
    expect(
      (await request(`admin/content/chapters/${chapter}`, 'PATCH', { materialCategory: 'guess' }))
        .status,
    ).toBe(400);
    expect(
      (await request(`admin/content/chapters/${chapter}`, 'PATCH', { materialCategory: 'algebra' }))
        .status,
    ).toBe(200);
    expect(
      (await getDatabase().db.select().from(chapters).where(eq(chapters.id, chapter)))[0]!
        .materialCategory,
    ).toBe('algebra');
    expect(
      (await request(`admin/content/chapters/${chapter}`, 'PATCH', { materialCategory: null }))
        .status,
    ).toBe(200);
    expect(
      (await getDatabase().db.select().from(chapters).where(eq(chapters.id, chapter)))[0]!
        .materialCategory,
    ).toBeNull();
    expect((await request('admin/content/chapters', 'POST', body)).status).toBe(409);
    expect(
      (await request(`admin/content/chapters/${chapter}`, 'PATCH', { name: null })).status,
    ).toBe(400);
    expect((await request(`admin/content/chapters/${chapter}`, 'PATCH', {})).status).toBe(400);
    expect(
      (await request('admin/content/chapters/not-a-uuid', 'PATCH', { name: 'x' })).status,
    ).toBe(400);
    subchapter = (
      await mutation('subchapters', {
        chapterId: chapter,
        code: 'SUB',
        name: 'TEST subchapter',
        displayOrder: 1,
      })
    ).id;
    competency = (
      await mutation('competencies', {
        subchapterId: subchapter,
        code: 'COMP',
        description: 'TEST competency',
      })
    ).id;
    const level = await mutation('levels', { subchapterId: subchapter, levelNumber: 1 });
    expect(
      (await request(`admin/content/levels/${level.id}`, 'PATCH', { levelNumber: 2 })).status,
    ).toBe(400);
    const hierarchy = (await (
      await request('admin/content/curriculum')
    ).json()) as AdminCurriculumDto;
    expect(hierarchy.items.find((r) => r.id === level.id)?.name).toBe('Level 1');
    const logs = await getDatabase()
      .db.select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, chapter));
    expect(logs).toHaveLength(3); // Create plus two category updates, all audited.
    expect(logs[0]!.actorUserId).toBe(admin);
    const rollbackCode = `ROLLBACK-${suffix}`;
    await expect(
      new ContentService().createChapter(randomUUID(), {
        code: rollbackCode,
        name: `TEST rollback ${suffix}`,
        displayOrder: body.displayOrder + 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    // Other integration suites can create chapters concurrently in the same test database.
    expect(
      await getDatabase()
        .db.select({ id: chapters.id })
        .from(chapters)
        .where(eq(chapters.code, rollbackCode)),
    ).toEqual([]);
  });
  it('publishes only reviewed PG with READY ancestry and preserves old content during concurrent revisions', async () => {
    const invalid = {
      ...content,
      options: content.options.map((o) => ({ ...o, id: 'A' })),
      primaryCompetencyId: competency,
      variantCode: 'INVALID',
    };
    expect((await request('admin/content/questions', 'POST', invalid)).status).toBe(400);
    version = (
      await mutation('questions', {
        ...content,
        primaryCompetencyId: competency,
        variantCode: `ORIG-${suffix}`,
      })
    ).id;
    const listed = (await (
      await request('admin/content/versions?limit=100')
    ).json()) as AdminVersionsDto;
    const row = listed.items.find((r) => r.id === version) as AdminVersionDto;
    question = row.questionId;
    variant = row.variantId;
    expect(row).toMatchObject({
      contentStatus: 'DRAFT',
      reviewedByUserId: null,
      stem: content.stem,
    });
    expect(
      (await request(`admin/content/versions/${version}/status`, 'PATCH', { status: 'READY' }))
        .status,
    ).toBe(409);
    for (const [path, id] of [
      ['chapters', chapter],
      ['subchapters', subchapter],
      ['competencies', competency],
      ['questions', question],
    ])
      await mutation(
        `${path}/${id}${path === 'questions' ? '/status' : ''}`,
        { status: 'READY' },
        'PATCH',
      );
    await mutation(`versions/${version}/status`, { status: 'READY' }, 'PATCH');
    const stored = (
      await getDatabase().db.select().from(questionVersions).where(eq(questionVersions.id, version))
    )[0]!;
    expect(stored.reviewedByUserId).toBe(admin);
    expect(stored.reviewedAt).toBeInstanceOf(Date);
    expect(
      (await request(`admin/content/versions/${version}`, 'PATCH', { stem: 'overwrite' })).status,
    ).toBe(404);
    expect(
      (await request(`admin/content/versions/${version}/status`, 'PATCH', { status: 'DRAFT' }))
        .status,
    ).toBe(409);
    const newContent = { ...content, stem: 'TEST revised 1 + 2' };
    const [first, second] = await Promise.all([
      mutation(`versions/${version}/revisions`, newContent),
      mutation(`versions/${version}/revisions`, { ...newContent, stem: 'TEST another revision' }),
    ]);
    expect(first.id).not.toBe(second.id);
    const versions = await getDatabase()
      .db.select()
      .from(questionVersions)
      .where(eq(questionVersions.variantId, variant));
    expect(versions.map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
    expect(versions.find((v) => v.id === version)).toEqual(stored);
    const alternate = await mutation(`questions/${question}/variants`, {
      ...content,
      originalVariantId: variant,
      variantCode: `VAR-${suffix}`,
    });
    expect(alternate.id).not.toBe(version);
    expect(
      (
        await request(`admin/content/questions/${randomUUID()}/variants`, 'POST', {
          ...content,
          originalVariantId: variant,
          variantCode: 'FOREIGN',
        })
      ).status,
    ).toBe(404);
  });
  it('retains draft Tryout work, pins version IDs and refuses unapproved publication or published edits', async () => {
    const body = {
      familyCode: `DRAFT-${suffix}`,
      packageVersion: 1,
      name: 'TEST draft package',
      questionVersionIds: [version],
    };
    const p = await mutation('tryout-packages', body);
    const rows = await getDatabase()
      .db.select()
      .from(packageItems)
      .where(eq(packageItems.packageId, p.id));
    expect(rows[0]!.questionVersionId).toBe(version);
    const publish = await request(`admin/content/tryout-packages/${p.id}/publish`, 'POST');
    expect(publish.status).toBe(409);
    expect(await publish.json()).toMatchObject({ code: 'TRYOUT_POLICY_OPEN' });
    expect(
      (
        await request('admin/content/tryout-packages', 'POST', {
          ...body,
          packageVersion: 2,
          questionVersionIds: [version, version],
        })
      ).status,
    ).toBe(400);
    await getDatabase()
      .db.update(assessmentPackages)
      .set({ status: 'CLOSED' })
      .where(eq(assessmentPackages.id, p.id));
    expect(
      (
        await request(`admin/content/tryout-packages/${p.id}`, 'PATCH', {
          name: 'Overwrite',
          questionVersionIds: [],
        })
      ).status,
    ).toBe(409);
    expect(
      await getDatabase().db.select().from(packageItems).where(eq(packageItems.packageId, p.id)),
    ).toEqual(rows);
  });
  it('stores more than three videos, archives without losing reports, and audits Admin follow-up', async () => {
    const mappings: string[] = [];
    for (let n = 1; n <= 4; n++)
      mappings.push(
        (
          await mutation('videos', {
            title: `TEST video ${n}`,
            url: 'https://www.youtube.com/watch?v=TESTVIDEO00',
            source: 'TEST',
            subchapterId: subchapter,
            recommendationOrder: n,
          })
        ).id,
      );
    const mapping = mappings[0]!;
    await mutation(`videos/${mapping}`, { status: 'READY' }, 'PATCH');
    const m = (
      await getDatabase()
        .db.select()
        .from(videoSubchapterMappings)
        .where(eq(videoSubchapterMappings.id, mapping))
    )[0]!;
    expect(
      (
        await getDatabase().db.select().from(learningVideos).where(eq(learningVideos.id, m.videoId))
      )[0]!.curationStatus,
    ).toBe('READY');
    const [report] = await getDatabase()
      .db.insert(videoReports)
      .values({
        reporterStudentId: student,
        mappingId: mapping,
        category: 'TEST',
        details: 'TEST broken link',
      })
      .returning({ id: videoReports.id });
    expect(
      (
        await request(
          `admin/reports/VIDEO/${report!.id}`,
          'PATCH',
          { status: 'RESOLVED', followUp: 'TEST verified' },
          'student',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`admin/reports/INVALID/${report!.id}`, 'PATCH', {
          status: 'RESOLVED',
          followUp: 'TEST verified',
        })
      ).status,
    ).toBe(400);
    const result = await request(`admin/reports/VIDEO/${report!.id}`, 'PATCH', {
      status: 'RESOLVED',
      followUp: 'TEST verified',
    });
    expect(result.status).toBe(200);
    await mutation(`videos/${mapping}`, { status: 'ARCHIVED' }, 'PATCH');
    expect(
      (
        await getDatabase().db.select().from(videoReports).where(eq(videoReports.id, report!.id))
      )[0],
    ).toMatchObject({ mappingId: mapping, status: 'RESOLVED' });
    expect(
      (
        await getDatabase().db.select().from(auditLogs).where(eq(auditLogs.entityId, report!.id))
      )[0]!.actorUserId,
    ).toBe(admin);
    // Content sees only its domains, including when operational events exist.
    const operationalId = randomUUID();
    await getDatabase()
      .db.insert(auditLogs)
      .values({
        actorUserId: admin,
        action: 'TEST_SCHOOL_EVENT',
        entityType: 'school',
        entityId: operationalId,
        metadata: {},
      });
    const auditResponse = await request('admin/audit-logs?limit=100');
    expect(auditResponse.status).toBe(200);
    const scopedAudit = await auditResponse.json();
    expect(JSON.stringify(scopedAudit)).not.toContain(operationalId);
    expect(
      scopedAudit.items.some((item: { entityId: string }) => item.entityId === report!.id),
    ).toBe(true);
    expect((await request('admin/reports?limit=0')).status).toBe(400);
    expect((await request('admin/irt?offset=-1')).status).toBe(400);
    expect((await request('admin/content/videos?limit=100000')).status).toBe(400);
  });
  it('shows no IRT parameters below 30 responses or for an unfinished batch', async () => {
    const { db } = getDatabase();
    const batches = await db
      .insert(irtBatches)
      .values([
        { batchKind: 'TEST', modelVersion: 'TEST-29', status: 'SUCCEEDED' },
        { batchKind: 'TEST', modelVersion: 'TEST-30', status: 'SUCCEEDED' },
        { batchKind: 'TEST', modelVersion: 'TEST-pending', status: 'PENDING' },
      ])
      .returning({ id: irtBatches.id });
    await db.insert(irtItemResults).values(
      batches.map((b, i) => ({
        batchId: b.id,
        questionVersionId: version,
        sampleSize: i === 0 ? 29 : 30,
        difficultyB: i === 0 ? null : '0.5',
        discriminationA: i === 0 ? null : '1.0',
        guessingC: i === 0 ? null : '0.25',
        dataStatus: 'TEST',
      })),
    );
    const response = (await (await request('admin/irt?limit=100')).json()) as {
      items: { batchId: string; difficultyB: string | null }[];
    };
    expect(response.items.find((r) => r.batchId === batches[0]!.id)?.difficultyB).toBeNull();
    expect(response.items.find((r) => r.batchId === batches[1]!.id)?.difficultyB).toBe('0.500000');
    expect(response.items.find((r) => r.batchId === batches[2]!.id)?.difficultyB).toBeNull();
    expect(
      await db
        .select()
        .from(irtItemResults)
        .where(
          inArray(
            irtItemResults.batchId,
            batches.map((b) => b.id),
          ),
        ),
    ).toHaveLength(3);
  });
  it('rejects unsafe video writes and activation of invalid imported metadata', async () => {
    for (const url of [
      'http://youtu.be/TESTVIDEO00',
      'https://youtube.com.example.test/watch?v=TESTVIDEO00',
      'https://example.test/lesson',
    ])
      expect(
        (
          await request('admin/content/videos', 'POST', {
            title: 'TEST invalid',
            url,
            source: 'TEST',
            subchapterId: subchapter,
            recommendationOrder: 1,
            status: 'DRAFT',
          })
        ).status,
      ).toBe(400);
    const db = getDatabase().db;
    const [video] = await db
      .insert(learningVideos)
      .values({ title: 'TEST invalid import', url: 'https://example.test/lesson', source: 'TEST' })
      .returning();
    const [mapping] = await db
      .insert(videoSubchapterMappings)
      .values({ videoId: video!.id, subchapterId: subchapter, recommendationOrder: 99 })
      .returning();
    expect(
      (await request(`admin/content/videos/${mapping!.id}`, 'PATCH', { status: 'READY' })).status,
    ).toBe(400);
    expect(
      (
        await db
          .select()
          .from(videoSubchapterMappings)
          .where(eq(videoSubchapterMappings.id, mapping!.id))
      )[0]!.status,
    ).toBe('DRAFT');
  });
});
