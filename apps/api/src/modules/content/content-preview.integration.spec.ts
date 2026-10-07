import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { getDatabase, closeDatabaseConnection, users, type ImportQuestion } from '@tka/database';
import { ContentModule } from './content.module';
import { IdentityService } from '../identity/identity.service';
import { configureApplication } from '../../bootstrap';
import { R2MediaStorage, matchesImageSignature } from './r2-media.storage';
import type { MediaUpload } from './media-uploads.repository';
import type { ImportReportDto, PreviewSessionDto, PreviewAckDto } from './content-preview.dto';
import type { ContentPackageDetailDto, CreateContentPackageDto } from './content-packages.dto';
import { ContentImportService } from './content-import.service';
import type { UploadDetailDto, UploadListDto } from './content-uploads.dto';
import type { ExcelParseDto } from './excel-import.dto';
import { DrillAssessmentService } from '../learning/drill-assessment.service';
import { PretestService } from '../learning/pretest.service';
import { AssessmentMediaService } from '../learning/assessment-media.service';
import { TryoutReleaseService } from '../learning/tryout-release.service';
import {
  finalizeTryout,
  decodeAssessmentContent,
  tryoutCorrectFraction,
} from '@tka/assessment-engine';

const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)(
  'TEST ONLY content chain: HTTP → PostgreSQL main → storage fixture → pinned preview',
  { timeout: 60000 },
  () => {
    let admin: ReturnType<typeof postgres>,
      owner: ReturnType<typeof postgres>,
      compute: ReturnType<typeof postgres>;
    let app: INestApplication, base: string, actor: string;
    const suffix = randomUUID().replaceAll('-', ''),
      database = `numora_test_content_${suffix}`,
      mainLogin = `content_main_${suffix}`,
      computeLogin = `content_compute_${suffix}`;
    const namespace = `TEST_${suffix}`;
    let samples: ImportQuestion[], report: ImportReportDto, session: PreviewSessionDto;
    const beforeUrl = process.env.DATABASE_URL;
    const beforeSynthetic = process.env.ALLOW_SYNTHETIC_CONTENT;
    let enabled = true;
    const bytes = new Map<string, Buffer>();
    const workbooks = new Map<string, Buffer>();
    let workbookFailure = false;
    const storage = {
      storeWorkbook: async (id: string, buffer: Buffer) => {
        if (workbookFailure) throw Error('TEST storage failure');
        workbooks.set(id, buffer);
        return `excel-uploads/${id}/source.xlsx`;
      },
      readWorkbook: async (id: string) => workbooks.get(id)!,
      settings: () => ({ bucket: 'numora-bucket', prefix: 'question-media', ttl: 900 }),
      presign: async () => 'https://example.invalid/TEST-ONLY-upload',
      verifyAndPublish: async (row: MediaUpload) => {
        const content = bytes.get(row.sha256);
        if (
          !content ||
          content.length !== row.byteLength ||
          createHash('sha256').update(content).digest('hex') !== row.sha256 ||
          !matchesImageSignature(content, row.contentType)
        )
          throw Error('TEST ONLY fixture bytes mismatch');
      },
      readLink: async (bucket: string, key: string) => ({
        url: `https://example.invalid/TEST-ONLY/${bucket}/${key}`,
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      }),
    };
    async function request(
      path: string,
      method = 'GET',
      body?: object,
      token = 'admin',
      key?: string,
    ) {
      return fetch(`${base}/${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    async function ok<T>(
      path: string,
      method = 'GET',
      body?: object,
      token = 'admin',
      key?: string,
    ): Promise<T> {
      const response = await request(path, method, body, token, key);
      const value = await response.json();
      expect(response.ok, JSON.stringify(value)).toBe(true);
      return value as T;
    }
    const body = (questions: ImportQuestion[] = samples) => ({
      sourceNamespace: namespace,
      questions,
    });
    beforeAll(async () => {
      if (
        process.env.NODE_ENV !== 'test' ||
        !['localhost', '127.0.0.1'].includes(new URL(testUrl!).hostname)
      )
        throw Error('Isolated local PostgreSQL required.');
      await closeDatabaseConnection();
      admin = postgres(testUrl!, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE DATABASE "${database}"`);
      const url = new URL(testUrl!);
      url.pathname = '/' + database;
      owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await migrate(drizzle(owner), {
        migrationsFolder: resolve('../../packages/database/drizzle'),
      });
      const pass = randomUUID();
      for (const login of [mainLogin, computeLogin])
        await admin.unsafe(
          `CREATE ROLE "${login}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${pass}'`,
        );
      await admin.unsafe(`GRANT numora_main_runtime TO "${mainLogin}"`);
      await admin.unsafe(`GRANT numora_irt_runtime TO "${computeLogin}"`);
      const roles = [
        ['admin', 'ADMIN', 'CONTENT_DATA_MODERATION'],
        ['other', 'ADMIN', 'SUPER_ADMIN'],
        ['operations', 'ADMIN', 'OPERATIONS'],
        ['unassigned', 'ADMIN', null],
        ['student', 'STUDENT', null],
        ['otherStudent', 'STUDENT', null],
        ['teacher', 'TEACHER', null],
      ];
      const ids: string[] = [];
      for (const [label, role, adminRole] of roles) {
        const id = randomUUID();
        ids.push(id);
        await owner`INSERT INTO users(id,auth_user_id,role,admin_role,display_name,email) VALUES(${id},${randomUUID()},${role!},${adminRole ?? null},${label!},${label + '-' + suffix + '@example.test'})`;
      }
      actor = ids[0]!;
      samples = JSON.parse(
        await readFile(resolve('../../docs/data/samples/2026-10-03/questions.draft.json'), 'utf8'),
      ) as ImportQuestion[];
      const chaptersMap = new Map<string, string>(),
        subMap = new Map<string, string>(),
        competencyMap = new Map<string, string>();
      for (const q of samples) {
        if (!chaptersMap.has(q.chapterCode!)) {
          const id = randomUUID();
          chaptersMap.set(q.chapterCode!, id);
          await owner`INSERT INTO chapters(id,code,slug,name,display_order) VALUES(${id},${q.chapterCode},${q.chapterCode!.toLowerCase()},${'TEST ONLY ' + q.chapterCode},${chaptersMap.size})`;
        }
        const subKey = q.chapterCode + ':' + q.subchapterCode;
        if (!subMap.has(subKey)) {
          const id = randomUUID();
          subMap.set(subKey, id);
          await owner`INSERT INTO subchapters(id,chapter_id,code,slug,name,display_order) VALUES(${id},${chaptersMap.get(q.chapterCode!)!},${q.subchapterCode},${q.subchapterCode!.toLowerCase()},${'TEST ONLY ' + q.subchapterCode},${subMap.size})`;
          await owner`INSERT INTO levels(subchapter_id,level_number) VALUES(${id},1)`;
        }
        const competencyKey = subKey + ':' + q.competencyCode;
        if (!competencyMap.has(competencyKey)) {
          const id = randomUUID();
          competencyMap.set(competencyKey, id);
          await owner`INSERT INTO competencies(id,subchapter_id,code,description) VALUES(${id},${subMap.get(subKey)!},${q.competencyCode},'TEST ONLY sample indicator')`;
        }
      }
      url.username = mainLogin;
      url.password = pass;
      process.env.DATABASE_URL = url.toString();
      process.env.ALLOW_SYNTHETIC_CONTENT = 'true';
      url.username = computeLogin;
      compute = postgres(url.toString(), { max: 1, onnotice: () => {} });
      const module = await Test.createTestingModule({ imports: [ContentModule] })
        .overrideProvider(ConfigService)
        .useValue({
          get: (key: string) =>
            key === 'CONTENT_IMPORT_PREVIEW_ENABLED' ? (enabled ? 'true' : 'false') : undefined,
        })
        .overrideProvider(IdentityService)
        .useValue({
          me: async (header?: string) => {
            const index = roles.findIndex((r) => header === `Bearer ${r[0]}`);
            if (index < 0) throw new UnauthorizedException();
            const [profile] = await getDatabase()
              .db.select()
              .from(users)
              .where(eq(users.id, ids[index]!));
            return profile;
          },
        })
        .overrideProvider(R2MediaStorage)
        .useValue(storage)
        .compile();
      app = module.createNestApplication();
      configureApplication(app);
      await app.listen(0, '127.0.0.1');
      base = (await app.getUrl()) + '/api/v1';
    }, 60000);
    afterAll(async () => {
      await app?.close();
      await closeDatabaseConnection();
      process.env.DATABASE_URL = beforeUrl;
      if (beforeSynthetic === undefined) delete process.env.ALLOW_SYNTHETIC_CONTENT;
      else process.env.ALLOW_SYNTHETIC_CONTENT = beforeSynthetic;
      await compute?.end();
      await owner?.end();
      if (admin) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
        for (const login of [mainLogin, computeLogin])
          await admin.unsafe(`DROP ROLE IF EXISTS "${login}"`);
        await admin.end();
      }
    }, 60000);
    it('rejects anonymous and every non-content principal on new and legacy routes', async () => {
      const paths = [
        'admin/content/curriculum',
        'admin/content/versions',
        'admin/content/versions/00000000-0000-4000-8000-000000000001',
        'admin/content/versions/00000000-0000-4000-8000-000000000001/review',
        'admin/content/drill-packages',
        'admin/content/media/uploads',
        'admin/content/import-validations',
        'admin/content/imports',
        'admin/content/preview-sessions',
      ];
      for (const path of paths)
        for (const token of ['', 'student', 'teacher', 'operations', 'unassigned']) {
          const method =
            path.endsWith('curriculum') ||
            path.endsWith('versions') ||
            path.endsWith('00000000-0000-4000-8000-000000000001') ||
            path.endsWith('drill-packages')
              ? 'GET'
              : 'POST';
          const response = await request(path, method, method === 'POST' ? {} : undefined, token);
          expect(response.status).toBe(token ? 403 : 401);
          expect(response.headers.get('content-type')).toContain('application/problem+json');
        }
      expect((await request('admin/content/curriculum', 'GET', undefined, 'other')).status).toBe(
        200,
      );
    });
    it('rejects incomplete, mixed and unknown review payloads before changing a version', async () => {
      const id = '00000000-0000-4000-8000-000000000001';
      for (const payload of [
        {},
        { status: 'READY', expectedStatus: 'DRAFT' },
        { packageId: id, status: 'READY', expectedStatus: 'DRAFT', reason: 'TEST mixed intent' },
        { status: 'READY', expectedStatus: 'DRAFT', reason: 'TEST', unknown: true },
        { packageId: 'invalid' },
      ]) {
        const response = await request(`admin/content/versions/${id}/review`, 'POST', payload);
        expect(response.status).toBe(400);
        expect((await response.json()).code).toBe('CONTENT_REVIEW_INVALID');
      }
    });
    it('validates ten samples without creating import records; media may be held', async () => {
      const r = await ok<ImportReportDto>('admin/content/import-validations', 'POST', body());
      expect(r.canImportDraft).toBe(true);
      expect(r.items).toHaveLength(10);
      expect(r.items.filter((i) => !i.canPreview)).toHaveLength(2);
      expect((await owner`SELECT count(*)::int AS n FROM content_imports`)[0]!.n).toBe(0);
    });
    it('rejects malformed items, oversized batches and bodies at the HTTP boundary', async () => {
      const malformed = await ok<ImportReportDto>('admin/content/import-validations', 'POST', {
        sourceNamespace: namespace,
        questions: [{ ...samples[0], externalId: { untrusted: 'object' } }],
      });
      expect(malformed.canImportDraft).toBe(false);
      expect(malformed.items[0]!.externalId).toBe('');
      expect(malformed.items[0]!.blockers).toContain('INVALID_SCHEMA');
      for (const questions of [[], [null], ['untrusted'], Array(101).fill(samples[0])]) {
        const response = await request('admin/content/import-validations', 'POST', {
          sourceNamespace: namespace,
          questions,
        });
        expect(response.status).toBe(400);
      }
      const response = await request(
        'admin/content/imports',
        'POST',
        {
          ...body(),
          padding: 'x'.repeat(2 * 1024 * 1024),
        },
        'admin',
        randomUUID(),
      );
      expect(response.status).toBe(413);
      expect(response.headers.get('content-type')).toContain('application/problem+json');
      expect(JSON.stringify(await response.json())).not.toContain('stack');
      expect((await owner`SELECT count(*)::int AS n FROM content_imports`)[0]!.n).toBe(0);
    });
    it('rejects wrong scope, duplicate IDs, incomplete Category key, malformed PGK and forged media atomically', async () => {
      const original = samples[0]!;
      const tests: ImportQuestion[][] = [
        [{ ...original, subchapterCode: 'SC-WRONG' }],
        [original, original],
        [
          {
            ...samples.find((q) => q.type === 'CATEGORY')!,
            answer: { categoryByStatementId: { A: 'QUANTITATIVE' } },
          },
        ],
        [{ ...original, answer: { optionIds: ['A', 'A'] } }],
        [
          {
            ...samples.find((q) => q.metadata.assetManifest?.length)!,
            metadata: {
              ...samples.find((q) => q.metadata.assetManifest?.length)!.metadata,
              assetManifest: samples
                .find((q) => q.metadata.assetManifest?.length)!
                .metadata.assetManifest!.map((a) => ({ ...a, objectKey: 'forged/key' })),
            },
          },
        ],
      ];
      for (const qs of tests) {
        const r = await request('admin/content/imports', 'POST', body(qs), 'admin', randomUUID());
        expect(r.status).toBe(422);
      }
      expect((await owner`SELECT count(*)::int AS n FROM content_imports`)[0]!.n).toBe(0);
    });
    it('concurrent prepare creates one batch and one version per identity, replay conflicts are rejected', async () => {
      const key = randomUUID();
      const results = await Promise.all([
        ok<ImportReportDto>('admin/content/imports', 'POST', body(), 'admin', key),
        ok<ImportReportDto>('admin/content/imports', 'POST', body(), 'admin', key),
      ]);
      report = results[0]!;
      expect(results[1]).toEqual(report);
      expect((await owner`SELECT count(*)::int AS n FROM content_import_versions`)[0]!.n).toBe(10);
      expect(
        (await owner`SELECT count(*)::int AS n FROM audit_logs WHERE action='CONTENT_IMPORTED'`)[0]!
          .n,
      ).toBe(1);
      expect(
        (await request('admin/content/imports', 'POST', body([samples[0]!]), 'admin', key)).status,
      ).toBe(409);
      expect(
        (await request(`admin/content/imports/${report.id}`, 'GET', undefined, 'other')).status,
      ).toBe(404);
    });
    it('holds missing media, protects imported versions from legacy revision/publication', async () => {
      const held = report.items.find((i) => !i.canPreview)!;
      expect(
        (
          await request(
            'admin/content/preview-sessions',
            'POST',
            { questionVersionIds: [held.questionVersionId] },
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      const id = report.items[0]!.questionVersionId!;
      expect(
        (await request(`admin/content/versions/${id}/status`, 'PATCH', { status: 'READY' })).status,
      ).toBe(409);
      await expect(
        owner`UPDATE question_versions SET stem='{"text":"changed"}' WHERE id=${id}`,
      ).rejects.toMatchObject({ code: '23514' });
      const unchanged = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        body(),
        'admin',
        randomUUID(),
      );
      expect(unchanged.items.every((i) => i.outcome === 'SKIPPED_UNCHANGED')).toBe(true);
    });
    it('requires review for type, indicator or level changes even when the new master scope exists', async () => {
      const q = samples.find((item) => item.type === 'SINGLE_CHOICE')!;
      const [sub] =
        await owner`SELECT s.id FROM subchapters s JOIN chapters c ON c.id=s.chapter_id WHERE c.code=${q.chapterCode} AND s.code=${q.subchapterCode}`;
      await owner`INSERT INTO levels(subchapter_id,level_number,status) VALUES(${sub!.id},2,'DRAFT')`;
      await owner`INSERT INTO competencies(subchapter_id,code,description,status) VALUES(${sub!.id},'TEST_ALT_INDICATOR','TEST ONLY review scope','DRAFT')`;
      const before =
        await owner`SELECT (SELECT count(*) FROM content_imports)::int AS imports,(SELECT count(*) FROM content_import_versions)::int AS versions`;
      const changes: ImportQuestion[] = [
        {
          ...q,
          type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
          answer: { optionIds: [q.options[0]!.id] },
        },
        { ...q, competencyCode: 'TEST_ALT_INDICATOR' },
        { ...q, metadata: { ...q.metadata, sourceLevelNumber: 2 } },
      ];
      for (const changed of changes) {
        const response = await request(
          'admin/content/imports',
          'POST',
          body([changed]),
          'admin',
          randomUUID(),
        );
        expect(response.status).toBe(422);
        const result = (await response.json()) as { report: ImportReportDto };
        expect(result.report.canImportDraft).toBe(false);
        expect(result.report.items[0]!.blockers).toContain('NEEDS_REVIEW');
      }
      expect(
        await owner`SELECT (SELECT count(*) FROM content_imports)::int AS imports,(SELECT count(*) FROM content_import_versions)::int AS versions`,
      ).toEqual(before);
    });
    it('verifies all six fixture media via actual upload API and creates new ready-to-preview revisions', async () => {
      for (const q of samples)
        for (const a of q.metadata.assetManifest ?? []) {
          const raw = await readFile(
            resolve(
              '../../docs/data/samples/2026-10-03',
              String((a as unknown as { fileReference: string }).fileReference),
            ),
          );
          bytes.set(a.sha256, raw);
          const reservation = await ok<{ uploadId: string }>(
            'admin/content/media/uploads',
            'POST',
            {
              externalId: q.externalId,
              assetId: a.assetId,
              contentVersion: 1,
              contentType: a.contentType,
              byteLength: a.byteLength,
              sha256: a.sha256,
            },
            'admin',
            randomUUID(),
          );
          const receipt = await ok<{ objectKey: string }>(
            `admin/content/media/uploads/${reservation.uploadId}/complete`,
            'POST',
            {},
          );
          a.objectKey = receipt.objectKey;
        }
      const revisions = await Promise.all([
        ok<ImportReportDto>('admin/content/imports', 'POST', body(), 'admin', randomUUID()),
        ok<ImportReportDto>('admin/content/imports', 'POST', body(), 'admin', randomUUID()),
      ]);
      report = revisions[0]!;
      expect(report.items.every((i) => i.canPreview)).toBe(true);
      expect((await owner`SELECT count(*)::int AS n FROM content_import_versions`)[0]!.n).toBe(12);
      expect(
        (
          await owner`SELECT count(*)::int AS n FROM content_media_uploads WHERE status='VERIFIED'`
        )[0]!.n,
      ).toBe(6);
    });
    it('rolls back partial writes when a later item fails at persistence', async () => {
      const before = (await owner`SELECT count(*)::int AS n FROM question_versions`)[0]!.n;
      await owner.unsafe(
        `CREATE FUNCTION test_fail_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_ref='TEST_FAIL_LAST' THEN RAISE EXCEPTION 'TEST ONLY rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail_import BEFORE INSERT ON questions FOR EACH ROW EXECUTE FUNCTION test_fail_import();`,
      );
      const response = await request(
        'admin/content/imports',
        'POST',
        body([
          { ...samples[0]!, externalId: 'TEST_FIRST' },
          { ...samples[0]!, externalId: 'TEST_FAIL_LAST' },
        ]),
        'admin',
        randomUUID(),
      );
      expect(response.status).toBe(500);
      expect((await owner`SELECT count(*)::int AS n FROM question_versions`)[0]!.n).toBe(before);
      await owner.unsafe(
        'DROP TRIGGER test_fail_import ON questions; DROP FUNCTION test_fail_import()',
      );
    });
    it('concurrent preview creation pins all ten items and strips review media/key/provenance', async () => {
      const ids = report.items.map((i) => i.questionVersionId!);
      const key = randomUUID();
      const views = await Promise.all([
        ok<PreviewSessionDto>(
          'admin/content/preview-sessions',
          'POST',
          { questionVersionIds: ids },
          'admin',
          key,
        ),
        ok<PreviewSessionDto>(
          'admin/content/preview-sessions',
          'POST',
          { questionVersionIds: ids },
          'admin',
          key,
        ),
      ]);
      session = views[0]!;
      expect(views[1]!.id).toBe(session.id);
      expect(session.items).toHaveLength(10);
      expect(session.media).toHaveLength(1);
      expect(
        session.items.every(
          (i) => !('answerKey' in i) && !('explanation' in i) && i.score === null,
        ),
      ).toBe(true);
      expect(JSON.stringify(session)).not.toContain('sourceSpreadsheetId');
      expect((await request(`admin/content/preview-sessions/${session.id}/result`)).status).toBe(
        409,
      );
      expect(
        (await request(`admin/content/preview-sessions/${session.id}`, 'GET', undefined, 'other'))
          .status,
      ).toBe(404);
    });
    it('saves PG, MCMA, Category partial/null and rejects foreign identifiers and stale changes', async () => {
      for (const item of session.items) {
        const answer =
          item.type === 'SINGLE_CHOICE'
            ? { optionId: item.options[0]!.id }
            : item.type === 'CATEGORY'
              ? { categoryByStatementId: { [item.options[0]!.id]: item.categories[0]!.id } }
              : { optionIds: [item.options[0]!.id] };
        const saved = await ok<PreviewAckDto>(
          `admin/content/preview-sessions/${session.id}/answers/${item.instanceId}`,
          'PATCH',
          { answer, expectedRevision: 0 },
        );
        expect(saved.revision).toBe(1);
        const same = await ok<PreviewAckDto>(
          `admin/content/preview-sessions/${session.id}/answers/${item.instanceId}`,
          'PATCH',
          { answer, expectedRevision: 0 },
        );
        expect(same.revision).toBe(1);
        expect(
          (
            await request(
              `admin/content/preview-sessions/${session.id}/answers/${item.instanceId}`,
              'PATCH',
              { answer: null, expectedRevision: 0 },
            )
          ).status,
        ).toBe(409);
      }
      const pg = session.items.find((i) => i.type === 'SINGLE_CHOICE')!;
      expect(
        (
          await request(
            `admin/content/preview-sessions/${session.id}/answers/${pg.instanceId}`,
            'PATCH',
            { answer: { optionId: 'FOREIGN' }, expectedRevision: 1 },
          )
        ).status,
      ).toBe(400);
      const cleared = await ok<PreviewAckDto>(
        `admin/content/preview-sessions/${session.id}/answers/${pg.instanceId}`,
        'PATCH',
        { answer: null, expectedRevision: 1 },
      );
      expect(cleared.answer).toBe(null);
      const resume = await ok<PreviewSessionDto>(`admin/content/preview-sessions/${session.id}`);
      expect(resume.items.find((i) => i.instanceId === pg.instanceId)!.revision).toBe(2);
    });
    it('validates media phase and keeps historical snapshot through reimport', async () => {
      const item = session.items.find((i) => i.externalId === 'CURR-IND17-L01-Q05')!;
      expect(
        (
          await request(`admin/content/preview-sessions/${session.id}/media-links`, 'POST', {
            instanceId: item.instanceId,
            phase: 'WORK',
            assetIds: ['bahas-1'],
          })
        ).status,
      ).toBe(400);
      const changed = structuredClone(samples[0]!);
      changed.stem.text = 'TEST ONLY later revision';
      await ok('admin/content/imports', 'POST', body([changed]), 'admin', randomUUID());
      const view = await ok<PreviewSessionDto>(`admin/content/preview-sessions/${session.id}`);
      expect(view.items[0]!.stem.text).toBe(session.items[0]!.stem.text);
      const changedLevel = { ...changed, metadata: { ...changed.metadata, sourceLevelNumber: 2 } };
      expect(
        (
          await request(
            'admin/content/imports',
            'POST',
            body([changedLevel]),
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(422);
    });
    it('serializes save/submit and returns one unscored review with all six media usages', async () => {
      const item = session.items[1]!;
      const paths = `admin/content/preview-sessions/${session.id}`;
      const [save, submit] = await Promise.all([
        request(`${paths}/answers/${item.instanceId}`, 'PATCH', {
          answer: null,
          expectedRevision: 1,
        }),
        request(`${paths}/submit`, 'POST', {}, 'admin', randomUUID()),
      ]);
      expect([200, 409]).toContain(save.status);
      expect(submit.status).toBe(200);
      const result = await ok<PreviewSessionDto>(`${paths}/result`);
      expect(result.scoringStatus).toBe('NOT_SCORED');
      expect(result.score).toBe(null);
      expect(result.items.every((i) => i.answerKey && i.explanation && i.score === null)).toBe(
        true,
      );
      expect(result.media).toHaveLength(6);
      const again = await ok<PreviewSessionDto>(
        `${paths}/submit`,
        'POST',
        {},
        'admin',
        randomUUID(),
      );
      expect(again.items).toEqual(result.items);
      expect(
        (
          await owner`SELECT count(*)::int AS n FROM audit_logs WHERE action='CONTENT_PREVIEW_SUBMITTED'`
        )[0]!.n,
      ).toBe(1);
      expect(
        (
          await request(`${paths}/answers/${item.instanceId}`, 'PATCH', {
            answer: null,
            expectedRevision: 1,
          })
        ).status,
      ).toBe(409);
      await expect(
        owner`UPDATE content_preview_answers SET answer=null,revision=revision+1 WHERE item_id=${item.instanceId}`,
      ).rejects.toMatchObject({ code: '23514' });
    });
    it('revocation and feature disabling stop operations without erasing evidence', async () => {
      await owner`UPDATE users SET admin_role='OPERATIONS' WHERE id=${actor}`;
      expect((await request(`admin/content/preview-sessions/${session.id}`)).status).toBe(403);
      await owner`UPDATE users SET admin_role='CONTENT_DATA_MODERATION' WHERE id=${actor}`;
      enabled = false;
      expect((await request('admin/content/import-validations', 'POST', body())).status).toBe(503);
      enabled = true;
      expect((await owner`SELECT count(*)::int AS n FROM content_preview_sessions`)[0]!.n).toBe(1);
    });
    it('directs three purposes, binds templates, replaces membership atomically and protects review/history', async () => {
      const q = structuredClone(samples.find((q) => !q.metadata.assetManifest?.length)!);
      q.externalId = 'TEST-DIRECTED';
      q.metadata.sourceOrder = 1;
      const [scope] =
        await owner`SELECT c.id AS chapter_id,l.id AS level_id FROM chapters c JOIN subchapters s ON s.chapter_id=c.id JOIN levels l ON l.subchapter_id=s.id WHERE c.code=${q.chapterCode} AND s.code=${q.subchapterCode} AND l.level_number=${q.metadata.sourceLevelNumber}`;
      const source = {
        sourceNamespace: namespace + '_directed',
        sourceName: 'TEST ONLY Curriculum',
        sourceReference: 'TEST ONLY fixture reference',
      };
      const create = async (usage: CreateContentPackageDto['assessmentType'], version = 1) =>
        ok<{ id: string }>('admin/content/packages', 'POST', {
          familyCode: `TEST-${usage}-${suffix.slice(0, 12)}`,
          packageVersion: version,
          name: `TEST ONLY ${usage}`,
          assessmentType: usage,
          isDemo: true,
          source,
          ...(usage === 'DRILL'
            ? { levelId: scope!.level_id }
            : usage === 'PRETEST'
              ? { chapterId: scope!.chapter_id }
              : {}),
        });
      const drill = await create('DRILL'),
        pretest = await create('PRETEST'),
        tryout = await create('TRYOUT');
      for (const token of ['', 'operations', 'student', 'teacher', 'unassigned']) {
        for (const [path, method, input] of [
          ['admin/content/packages', 'GET', undefined],
          ['admin/content/packages', 'POST', { assessmentType: 'PRETEST' }],
          [`admin/content/packages/${drill.id}`, 'PATCH', {}],
          [
            `admin/content/versions/${randomUUID()}/review`,
            'POST',
            { confirmed: true, notes: 'TEST ONLY' },
          ],
          [`admin/content/questions/${randomUUID()}/usage`, 'PATCH', { usageType: 'DRILL' }],
        ] as const)
          expect((await request(path, method, input, token)).status).toBe(token ? 403 : 401);
      }
      const directed = (id: string, revision: number, rows: ImportQuestion[] = [q]) => ({
        sourceNamespace: source.sourceNamespace,
        target: { packageId: id, expectedRevision: revision, fileName: 'TEST_ONLY.xlsx' },
        questions: rows,
      });
      const duplicate = await ok<ImportReportDto>(
        'admin/content/import-validations',
        'POST',
        directed(drill.id, 0, [q, { ...q, externalId: 'TEST-DUPLICATE' }]),
      );
      expect(duplicate.package?.blockers).toContain('QUESTION_ORDER_DUPLICATE');
      expect(duplicate.canImportDraft).toBe(false);
      const wrongScope = structuredClone(q);
      wrongScope.metadata.sourceLevelNumber = wrongScope.metadata.sourceLevelNumber! + 1;
      expect(
        (
          await ok<ImportReportDto>(
            'admin/content/import-validations',
            'POST',
            directed(drill.id, 0, [wrongScope]),
          )
        ).items[0]!.blockers,
      ).toContain('DRILL_SCOPE_MISMATCH');
      const changedChapter = structuredClone(q);
      changedChapter.chapterCode = 'FOREIGN';
      expect(
        (
          await ok<ImportReportDto>(
            'admin/content/import-validations',
            'POST',
            directed(pretest.id, 0, [changedChapter]),
          )
        ).items[0]!.blockers,
      ).toContain('PRETEST_CHAPTER_MISMATCH');
      const key = randomUUID();
      const first = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        directed(drill.id, 0),
        'admin',
        key,
      );
      expect(first.package).toMatchObject({
        contentRevision: 1,
        expectedCount: 10,
        actualCount: 1,
        canPublish: false,
      });
      expect(
        (
          await ok<ImportReportDto>(
            'admin/content/imports',
            'POST',
            directed(drill.id, 0),
            'admin',
            key,
          )
        ).id,
      ).toBe(first.id);
      expect(
        (
          await request(
            'admin/content/imports',
            'POST',
            directed(drill.id, 0),
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      const version = first.items[0]!.questionVersionId!;
      const family = (
        await owner`SELECT question_id FROM question_variants v JOIN question_versions qv ON qv.variant_id=v.id WHERE qv.id=${version}`
      )[0]!.question_id as string;
      const mixed = await ok<ImportReportDto>(
        'admin/content/import-validations',
        'POST',
        directed(pretest.id, 0),
      );
      expect(mixed.items[0]!.blockers).toContain('QUESTION_USAGE_MISMATCH');
      expect(
        (
          await request('admin/content/tryout-packages', 'POST', {
            familyCode: 'TEST-BYPASS',
            packageVersion: 1,
            name: 'TEST',
            questionVersionIds: [version],
          })
        ).status,
      ).toBe(400);
      expect(
        (await request(`admin/content/questions/${family}/usage`, 'PATCH', { usageType: 'TRYOUT' }))
          .status,
      ).toBe(409);
      const copy = structuredClone(q);
      copy.externalId = 'TEST-PRETEST-COPY';
      copy.metadata.sourceQuestionId = family;
      const pre = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        directed(pretest.id, 0, [copy]),
        'admin',
        randomUUID(),
      );
      expect(
        (
          await request('admin/content/drill-packages', 'POST', {
            familyCode: 'TEST-DRILL-BYPASS',
            packageVersion: 1,
            name: 'TEST ONLY',
            levelId: scope!.level_id,
            variantIndex: 1,
            scoringPolicyVersionId: randomUUID(),
            questionVersionIds: [pre.items[0]!.questionVersionId],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await owner`SELECT source_question_id FROM questions WHERE source_ref=${copy.externalId}`
        )[0]!.source_question_id,
      ).toBe(family);
      expect(
        (
          await request(
            `admin/content/versions/${pre.items[0]!.questionVersionId}/review`,
            'POST',
            { confirmed: false, notes: 'TEST' },
          )
        ).status,
      ).toBe(400);
      await ok(`admin/content/versions/${pre.items[0]!.questionVersionId}/review`, 'POST', {
        packageId: pretest.id,
        confirmed: true,
        notes: 'TEST ONLY: reviewed metadata, question, key and explanation',
      });
      const reviewed = await ok<ContentPackageDetailDto>(`admin/content/packages/${pretest.id}`);
      expect(reviewed.items[0]!.reviewedByUserId).toBe(actor);
      expect(reviewed.items[0]!.contentStatus).toBe('DRAFT');
      expect(reviewed.readiness.checks.find((c) => c.code === 'REVIEW')!.passed).toBe(true);
      expect(reviewed.readiness.canPublish).toBe(false);
      expect(
        (
          await owner`SELECT metadata->>'notes' AS notes FROM audit_logs WHERE action='imported_question_reviewed' AND entity_id=${pre.items[0]!.questionVersionId}`
        )[0]!.notes,
      ).toContain('TEST ONLY');
      for (const [pack, expectedCount] of [
        [drill, 10],
        [pretest, 20],
        [tryout, 30],
      ] as const) {
        const template = await fetch(
          `${base}/admin/content/excel-template?packageId=${pack.id}&examples=true`,
          { headers: { Authorization: 'Bearer admin' } },
        );
        expect(template.status).toBe(200);
        const bytes = await template.arrayBuffer();
        const form = new FormData();
        form.append('file', new Blob([bytes]), 'TEST_ONLY.xlsx');
        form.append('sourceNamespace', source.sourceNamespace);
        form.append('packageId', pack.id);
        const parsedResponse = await fetch(`${base}/admin/content/excel-parses`, {
          method: 'POST',
          headers: { Authorization: 'Bearer admin' },
          body: form,
        });
        expect(parsedResponse.status).toBe(200);
        const parsed = (await parsedResponse.json()) as ExcelParseDto;
        expect(parsed.issues).toEqual([]);
        expect(parsed.envelope.questions).toHaveLength(expectedCount);
        expect(new Set(parsed.envelope.questions.map((q) => q.metadata.sourceOrder)).size).toBe(
          expectedCount,
        );
        const formWrong = new FormData();
        formWrong.append('file', new Blob([bytes]), 'TEST_ONLY.xlsx');
        formWrong.append('sourceNamespace', source.sourceNamespace);
        formWrong.append('packageId', pack.id === drill.id ? pretest.id : drill.id);
        const wrong = (await (
          await fetch(`${base}/admin/content/excel-parses`, {
            method: 'POST',
            headers: { Authorization: 'Bearer admin' },
            body: formWrong,
          })
        ).json()) as ExcelParseDto;
        expect(wrong.issues.map((i) => i.code)).toContain('PACKAGE_BINDING_MISMATCH');
        if (pack.id === tryout.id) {
          await ok(
            'admin/content/imports',
            'POST',
            directed(pack.id, 0, parsed.envelope.questions),
            'admin',
            randomUUID(),
          );
          expect(
            (
              await ok<ContentPackageDetailDto>(`admin/content/packages/${pack.id}`)
            ).readiness.checks.find((c) => c.code === 'COUNT')!.passed,
          ).toBe(true);
        } else {
          const completePackage = await create(pack.id === drill.id ? 'DRILL' : 'PRETEST', 2);
          await ok(
            'admin/content/imports',
            'POST',
            directed(completePackage.id, 0, parsed.envelope.questions),
            'admin',
            randomUUID(),
          );
          expect(
            (
              await ok<ContentPackageDetailDto>(`admin/content/packages/${completePackage.id}`)
            ).readiness.checks.find((c) => c.code === 'COUNT')!.passed,
          ).toBe(true);
        }
      }
      const revised = structuredClone(q);
      revised.stem.text += ' TEST revised';
      await expect(
        owner`UPDATE questions SET usage_type='TRYOUT' WHERE id=${family}`,
      ).rejects.toMatchObject({ code: '23514' });
      const foreignChapter = structuredClone(
        samples.find((row) => row.chapterCode !== q.chapterCode)!,
      );
      foreignChapter.metadata.assetManifest = [];
      for (const text of [
        foreignChapter.stem,
        foreignChapter.explanation,
        ...foreignChapter.options.map((o) => o.content),
      ])
        text.text = text.text.replace(/\[\[asset:[^\]]+\]\]/g, 'TEST diagram');
      foreignChapter.externalId = 'TEST-CROSS-CHAPTER';
      foreignChapter.metadata.sourceOrder = 2;
      const cross = await ok<ImportReportDto>(
        'admin/content/import-validations',
        'POST',
        directed(tryout.id, 1, [{ ...q, externalId: 'TEST-TRYOUT-ORIGINAL' }, foreignChapter]),
      );
      expect(cross.canImportDraft).toBe(true);
      const filtered = await ok<{ items: Array<{ usageType: string; sourceName: string }> }>(
        'admin/content/versions?usageType=PRETEST&status=DRAFT&source=Curriculum',
      );
      expect(filtered.items.length).toBeGreaterThan(0);
      expect(
        filtered.items.every(
          (i) => i.usageType === 'PRETEST' && i.sourceName === source.sourceName,
        ),
      ).toBe(true);
      const diff = await ok<ImportReportDto>(
        'admin/content/import-validations',
        'POST',
        directed(drill.id, 1, [revised]),
      );
      expect(diff.items[0]!.change).toBe('REVISE');
      const concurrent = await Promise.all([
        request(
          'admin/content/imports',
          'POST',
          directed(drill.id, 1, [revised]),
          'admin',
          randomUUID(),
        ),
        request(
          'admin/content/imports',
          'POST',
          directed(drill.id, 1, [revised]),
          'admin',
          randomUUID(),
        ),
      ]);
      expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
      const latestVersion = (
        await owner`SELECT qv.id FROM question_versions qv JOIN question_variants v ON v.id=qv.variant_id WHERE v.question_id=${family} ORDER BY qv.version_number DESC LIMIT 1`
      )[0]!.id;
      const duplicateFamily = await request(`admin/content/packages/${drill.id}`, 'PATCH', {
        name: 'TEST ONLY',
        expectedRevision: 2,
        questionVersionIds: [version, latestVersion],
      });
      expect(duplicateFamily.status).toBe(400);
      expect((await duplicateFamily.json()).code).toBe('QUESTION_FAMILY_DUPLICATE');
      expect(
        (await owner`SELECT stem->>'text' AS text FROM question_versions WHERE id=${version}`)[0]!
          .text,
      ).toBe(q.stem.text);
      const replacement = structuredClone(q);
      replacement.externalId = 'TEST-REPLACEMENT';
      const removed = await ok<ImportReportDto>(
        'admin/content/import-validations',
        'POST',
        directed(drill.id, 2, [replacement]),
      );
      expect(removed.package!.removedVersionIds).toHaveLength(1);
      await expect(
        app
          .get(ContentImportService)
          .import(randomUUID(), randomUUID(), directed(drill.id, 2, [replacement])),
      ).rejects.toBeDefined();
      expect(
        (await owner`SELECT content_revision FROM assessment_packages WHERE id=${drill.id}`)[0]!
          .content_revision,
      ).toBe(2);
      expect(
        (
          await owner`SELECT count(*)::int AS n FROM questions WHERE source_ref=${replacement.externalId}`
        )[0]!.n,
      ).toBe(0);
      const legacy = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        {
          sourceNamespace: source.sourceNamespace,
          questions: [{ ...q, externalId: 'TEST-UNCLASSIFIED' }],
        },
        'admin',
        randomUUID(),
      );
      const rejection = await request(`admin/content/packages/${drill.id}`, 'PATCH', {
        name: 'TEST',
        expectedRevision: 2,
        questionVersionIds: [legacy.items[0]!.questionVersionId],
      });
      expect(rejection.status).toBe(400);
      const legacyFamily = (
        await owner`SELECT question_id FROM question_variants v JOIN question_versions qv ON qv.variant_id=v.id WHERE qv.id=${legacy.items[0]!.questionVersionId!}`
      )[0]!.question_id;
      enabled = false;
      try {
        await ok(`admin/content/questions/${legacyFamily}/usage`, 'PATCH', { usageType: 'DRILL' });
      } finally {
        enabled = true;
      }
      expect(
        (
          await request(`admin/content/questions/${legacyFamily}/usage`, 'PATCH', {
            usageType: 'TRYOUT',
          })
        ).status,
      ).toBe(409);
      expect(
        (await request(`admin/content/drill-packages/${drill.id}/publish`, 'POST', {})).status,
      ).toBe(409);
      const listed = await ok<{ items: ContentPackageDetailDto[] }>(
        'admin/content/packages?usageType=PRETEST&source=Curriculum',
      );
      expect(listed.items.map((p) => p.id)).toContain(pretest.id);
    });
    it('enforces main/compute/Data API boundaries and leaves every production learning table empty', async () => {
      for (const table of [
        'content_imports',
        'content_import_versions',
        'content_preview_items',
        'content_preview_answers',
      ]) {
        await expect(compute.unsafe(`SELECT * FROM ${table}`)).rejects.toMatchObject({
          code: '42501',
        });
        for (const role of ['anon', 'authenticated', 'service_role'])
          if ((await owner`SELECT 1 FROM pg_roles WHERE rolname=${role}`).length)
            await expect(
              owner.begin(async (tx) => {
                await tx.unsafe(`SET LOCAL ROLE ${role}`);
                await tx.unsafe(`SELECT * FROM ${table}`);
              }),
            ).rejects.toMatchObject({ code: '42501' });
      }
      const [principal] = await getDatabase()
        .client`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
      expect(principal!.rolsuper).toBe(false);
      expect(principal!.rolbypassrls).toBe(false);
      for (const table of [
        'assessment_attempts',
        'drill_attempts',
        'level_progress',
        'xp_ledger',
        'analytics_outbox',
        'student_item_exposures',
        'response_snapshots',
      ])
        expect((await owner.unsafe(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n).toBe(0);
      expect(
        (
          await owner`SELECT count(*)::int AS n FROM question_versions WHERE content_status<>'DRAFT'`
        )[0]!.n,
      ).toBe(0);
    });
    it('publishes reviewed PG packages with approval pins, protects stale approvals and serves only owned/released media', async () => {
      for (const table of ['chapters', 'subchapters', 'competencies', 'levels'])
        await owner.unsafe(`UPDATE ${table} SET status='READY'`); // TEST ONLY taxonomy fixture.
      const q = structuredClone(
        samples.find((q) => q.type === 'SINGLE_CHOICE' && !q.metadata.assetManifest?.length)!,
      );
      q.difficulty = 'EASY';
      q.metadata.sourceLevelNumber = 1;
      q.options = ['A', 'B', 'C', 'D'].map((id) => ({ id, content: { text: `TEST ONLY ${id}` } }));
      q.answer = { optionId: 'A' };
      const [scope] =
        await owner`SELECT c.id AS chapter_id,l.id AS level_id FROM chapters c JOIN subchapters s ON s.chapter_id=c.id JOIN levels l ON l.subchapter_id=s.id WHERE c.code=${q.chapterCode} AND s.code=${q.subchapterCode} AND l.level_number=1`;
      const image = samples
        .flatMap((q) => q.metadata.assetManifest ?? [])
        .find((a) => a.placement === 'STEM')!;
      const published: { id: string; usage: string }[] = [];
      for (const usage of ['DRILL', 'PRETEST', 'TRYOUT'] as const) {
        const source = {
          sourceNamespace: `TEST-PUBLISH-${usage}-${suffix}`,
          sourceName: 'TEST ONLY',
          sourceReference: 'TEST ONLY synthetic approval',
        };
        const pack = await ok<{ id: string }>('admin/content/packages', 'POST', {
          familyCode: `TEST-PUB-${usage}-${suffix}`,
          packageVersion: 1,
          name: `TEST ONLY ${usage} publication`,
          assessmentType: usage,
          isDemo: true,
          source,
          ...(usage === 'DRILL'
            ? { levelId: scope!.level_id }
            : usage === 'PRETEST'
              ? { chapterId: scope!.chapter_id }
              : {}),
        });
        const count = usage === 'DRILL' ? 10 : usage === 'PRETEST' ? 20 : 30;
        const rows = Array.from(
          { length: count },
          (_, i) =>
            ({
              ...structuredClone(q),
              externalId: `TEST-PUB-${usage}-${i}`,
              ...(usage === 'TRYOUT'
                ? {
                    chapterCode: null,
                    subchapterCode: null,
                    competencyCode: null,
                    difficulty: null,
                    type:
                      i % 3 === 0
                        ? 'SINGLE_CHOICE'
                        : i % 3 === 1
                          ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
                          : 'CATEGORY',
                    answer:
                      i % 3 === 0
                        ? q.answer
                        : i % 3 === 1
                          ? { optionIds: [q.options[0]!.id, q.options[1]!.id] }
                          : {
                              categoryByStatementId: Object.fromEntries(
                                q.options.map((o, n) => [o.id, n % 2 ? 'FALSE' : 'TRUE']),
                              ),
                            },
                  }
                : {}),
              metadata: {
                ...q.metadata,
                ...(usage === 'TRYOUT'
                  ? {
                      sourceLevelNumber: null,
                      ...(i % 3 === 2
                        ? {
                            categories: [
                              { id: 'TRUE', label: 'Benar' },
                              { id: 'FALSE', label: 'Salah' },
                            ],
                          }
                        : {}),
                    }
                  : {}),
                sourceOrder: i + 1,
                assetManifest: [],
              },
            }) as ImportQuestion,
        );
        const first = rows[0]!;
        for (const [placement, assetId] of [
          ['STEM', 'qa-stem'],
          ['EXPLANATION', 'qa-explanation'],
        ] as const) {
          const reserve = await ok<{ uploadId: string }>(
            'admin/content/media/uploads',
            'POST',
            {
              externalId: first.externalId,
              assetId,
              contentVersion: 1,
              contentType: image.contentType,
              byteLength: image.byteLength,
              sha256: image.sha256,
            },
            'admin',
            randomUUID(),
          );
          const receipt = await ok<{ objectKey: string }>(
            `admin/content/media/uploads/${reserve.uploadId}/complete`,
            'POST',
            {},
          );
          first.metadata.assetManifest!.push({
            ...image,
            externalId: first.externalId,
            assetId,
            textMarker: `[[asset:${assetId}]]`,
            placement,
            itemId: null,
            objectKey: receipt.objectKey,
          });
          (placement === 'STEM' ? first.stem : first.explanation).text += ` [[asset:${assetId}]]`;
        }
        const importBody = {
          sourceNamespace: source.sourceNamespace,
          questions: rows,
          target: { packageId: pack.id, expectedRevision: 0 },
        };
        const imported = await ok<ImportReportDto>(
          'admin/content/imports',
          'POST',
          importBody,
          'admin',
          randomUUID(),
        );
        expect(
          (
            await request(`admin/content/packages/${pack.id}/approval`, 'POST', {
              expectedRevision: 1,
              confirmed: true,
              reference: 'TEST ONLY',
            })
          ).status,
        ).toBe(409);
        for (const item of imported.items)
          await ok(`admin/content/versions/${item.questionVersionId}/review`, 'POST', {
            packageId: pack.id,
            confirmed: true,
            notes: 'TEST ONLY reviewed fixture',
          });
        for (const token of ['operations', 'unassigned', 'teacher', 'student']) {
          expect(
            (
              await request(
                `admin/content/packages/${pack.id}/approval`,
                'POST',
                { expectedRevision: 1, confirmed: true, reference: 'TEST ONLY' },
                token,
              )
            ).status,
          ).toBe(403);
          expect(
            (
              await request(
                `admin/content/packages/${pack.id}/publish`,
                'POST',
                { expectedRevision: 1 },
                token,
              )
            ).status,
          ).toBe(403);
        }
        await ok(`admin/content/packages/${pack.id}/approval`, 'POST', {
          expectedRevision: 1,
          confirmed: true,
          reference: 'TEST ONLY synthetic Curriculum fixture',
        });
        expect(
          (await ok<ContentPackageDetailDto>(`admin/content/packages/${pack.id}`)).readiness
            .canPublish,
        ).toBe(true);
        if (usage === 'DRILL') {
          await ok(`admin/content/packages/${pack.id}`, 'PATCH', {
            expectedRevision: 1,
            name: 'TEST ONLY new composition',
            questionVersionIds: imported.items.map((i) => i.questionVersionId!).reverse(),
          });
          expect(
            (await ok<ContentPackageDetailDto>(`admin/content/packages/${pack.id}`)).readiness
              .canPublish,
          ).toBe(false);
          expect(
            (
              await request(`admin/content/packages/${pack.id}/publish`, 'POST', {
                expectedRevision: 1,
              })
            ).status,
          ).toBe(409);
          await ok(`admin/content/packages/${pack.id}/approval`, 'POST', {
            expectedRevision: 2,
            confirmed: true,
            reference: 'TEST ONLY revised fixture',
          });
        }
        const revision = usage === 'DRILL' ? 2 : 1;
        const body = {
          expectedRevision: revision,
          ...(usage === 'TRYOUT' ? { releaseAt: '2099-01-06T14:30:00+07:00' } : {}),
        };
        // Different packages may share reviewed versions; publishing them must not deadlock.
        let siblingId: string | undefined;
        if (usage === 'DRILL') {
          const sibling = await ok<{ id: string }>('admin/content/packages', 'POST', {
            familyCode: `TEST-SIBLING-${suffix}`,
            packageVersion: 1,
            name: 'TEST ONLY shared versions',
            assessmentType: usage,
            isDemo: true,
            source,
            levelId: scope!.level_id,
          });
          siblingId = sibling.id;
          await ok(`admin/content/packages/${siblingId}`, 'PATCH', {
            expectedRevision: 0,
            name: 'TEST ONLY shared versions',
            questionVersionIds: imported.items.map((i) => i.questionVersionId!),
          });
          await ok(`admin/content/packages/${siblingId}/approval`, 'POST', {
            expectedRevision: 1,
            confirmed: true,
            reference: 'TEST ONLY shared version approval',
          });
        }
        const results = await Promise.all([
          request(`admin/content/packages/${pack.id}/publish`, 'POST', body),
          request(`admin/content/packages/${pack.id}/publish`, 'POST', body),
          ...(siblingId
            ? [
                request(`admin/content/packages/${siblingId}/publish`, 'POST', {
                  expectedRevision: 1,
                }),
              ]
            : []),
        ]);
        for (const result of results) expect(result.ok, await result.clone().text()).toBe(true);
        const [pins] =
          await owner`SELECT status,blueprint_version_id,scoring_policy_version_id,curriculum_approval FROM assessment_packages WHERE id=${pack.id}`;
        expect(pins!.status).toBe('PUBLISHED');
        const [runtimePin] =
          await owner`SELECT frozen_at is not null as frozen, curriculum_approval->>'manifestDigest'=manifest_digest as approved FROM assessment_packages WHERE id=${pack.id}`;
        if (usage === 'TRYOUT') expect(runtimePin).toMatchObject({ frozen: true, approved: true });
        expect(pins!.blueprint_version_id).toBeTruthy();
        expect(pins!.scoring_policy_version_id).toBeTruthy();
        expect(pins!.curriculum_approval.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
        if (usage === 'TRYOUT') {
          const [indicators] =
            await owner`SELECT count(*)::int AS total, count(q.primary_competency_id)::int AS mapped FROM package_items i JOIN question_versions v ON v.id=i.question_version_id JOIN question_variants a ON a.id=v.variant_id JOIN questions q ON q.id=a.question_id WHERE i.package_id=${pack.id}`;
          expect(indicators).toMatchObject({ total: 30, mapped: 0 });
          const [nullableScope] =
            await owner`SELECT count(q.chapter_id)::int AS chapters, count(q.subchapter_id)::int AS subchapters, count(q.curriculum_level_number)::int AS source_levels, count(v.level_id)::int AS levels FROM package_items i JOIN question_versions v ON v.id=i.question_version_id JOIN question_variants a ON a.id=v.variant_id JOIN questions q ON q.id=a.question_id WHERE i.package_id=${pack.id}`;
          expect(nullableScope).toMatchObject({
            chapters: 0,
            subchapters: 0,
            source_levels: 0,
            levels: 0,
          });
          const bank = await ok<{ items: { id: string }[] }>(
            'admin/content/versions?usageType=TRYOUT&status=READY&limit=100',
          );
          expect(bank.items.some((v) => v.id === imported.items[0]!.questionVersionId)).toBe(true);
          const [schedule] =
            await owner`SELECT duration_seconds,close_at FROM assessment_packages WHERE id=${pack.id}`;
          expect(schedule!.duration_seconds).toBe(600);
          expect(new Date(schedule!.close_at).toISOString()).toBe('2099-01-13T07:29:00.000Z');
        }
        expect(
          (
            await request(
              'admin/content/imports',
              'POST',
              { ...importBody, target: { packageId: pack.id, expectedRevision: revision } },
              'admin',
              randomUUID(),
            )
          ).status,
        ).toBe(409);
        await expect(
          owner`UPDATE question_versions SET stem='{"text":"tampered"}' WHERE id=${imported.items[0]!.questionVersionId!}`,
        ).rejects.toMatchObject({ code: '23514' });
        published.push({ id: pack.id, usage });
      }
      const identity = app.get(IdentityService);
      const drill = await new DrillAssessmentService(identity).start(
        'Bearer student',
        scope!.level_id,
      );
      expect(drill.questions).toHaveLength(10);
      await expect(
        new AssessmentMediaService(
          identity,
          app.get(R2MediaStorage),
          new TryoutReleaseService(),
        ).links('Bearer otherStudent', drill.questions[0]!.questionInstanceId, 'WORK'),
      ).rejects.toMatchObject({ status: 404 });
      const instance = drill.questions.find((q) => q.stem.includes('[[asset:'))!.questionInstanceId;
      const media = new AssessmentMediaService(
        identity,
        app.get(R2MediaStorage),
        new TryoutReleaseService(),
      );
      expect(
        (await media.links('Bearer student', instance, 'WORK')).media.map((a) => a.assetId),
      ).toEqual(['qa-stem']);
      await expect(media.links('Bearer admin', instance, 'WORK')).rejects.toMatchObject({
        status: 403,
      });
      await expect(media.links('Bearer student', randomUUID(), 'WORK')).rejects.toMatchObject({
        status: 404,
      });
      await expect(media.links('Bearer student', instance, 'REVIEW')).rejects.toMatchObject({
        status: 403,
      });
      for (const question of drill.questions)
        await new DrillAssessmentService(identity).saveAnswer(
          'Bearer student',
          drill.id,
          question.questionInstanceId,
          { optionId: 'A' },
        );
      await new DrillAssessmentService(identity).submit('Bearer student', drill.id);
      expect(
        (await media.links('Bearer student', instance, 'REVIEW')).media.map((a) => a.assetId),
      ).toEqual(['qa-stem', 'qa-explanation']);
      const pretest = await new PretestService(identity).start('Bearer student', scope!.chapter_id);
      expect(pretest.questions).toHaveLength(20);
      const [partialStudent] =
        await owner`SELECT id FROM users WHERE role='STUDENT' AND display_name='otherStudent' LIMIT 1`;
      const tryoutId = published.find((p) => p.usage === 'TRYOUT')!.id;
      const [student] =
        await owner`SELECT id FROM users WHERE role='STUDENT' AND display_name='student' LIMIT 1`;
      const [partialPin] =
        await owner`SELECT scoring_policy_version_id FROM assessment_packages WHERE id=${tryoutId}`;
      const partialAttempt = randomUUID();
      await owner`INSERT INTO assessment_attempts(id,student_id,package_id,assessment_type,scoring_policy_version_id,tryout_xp_policy_version,started_at,deadline_at) VALUES(${partialAttempt},${partialStudent!.id},${tryoutId},'TRYOUT',${partialPin!.scoring_policy_version_id},1,now(),now()+interval '10 minutes')`;
      await owner`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) SELECT ${partialAttempt},package_id,id,question_version_id,display_order,max_points FROM package_items WHERE package_id=${tryoutId}`;
      const gradingRows =
        await owner`SELECT ai.id,v.question_type,v.stem,v.options_or_statements,v.answer_key,v.explanation FROM attempt_items ai JOIN question_versions v ON v.id=ai.question_version_id WHERE ai.attempt_id=${partialAttempt}`;
      let expectedPartial = 0;
      for (const r of gradingRows) {
        const content = decodeAssessmentContent({
          questionType: r.question_type,
          stem: r.stem,
          optionsOrStatements: r.options_or_statements,
          answerKey: r.answer_key,
          explanation: r.explanation,
        });
        const answer =
          'optionIds' in content.answerKey
            ? { optionIds: [content.answerKey.optionIds[0]] }
            : 'categoryByStatementId' in content.answerKey
              ? {
                  categoryByStatementId: Object.fromEntries(
                    Object.entries(content.answerKey.categoryByStatementId).slice(0, 1),
                  ),
                }
              : content.answerKey;
        expectedPartial += Math.round(tryoutCorrectFraction(content, answer) * 100) / 100;
        await owner`INSERT INTO attempt_answers(attempt_item_id,answer,saved_at) VALUES(${r.id},${JSON.stringify(answer)}::jsonb,now())`;
      }
      await finalizeTryout({
        attemptId: partialAttempt,
        kind: 'manual',
        studentId: partialStudent!.id,
      });
      const [partialResult] =
        await owner`SELECT a.status,a.raw_points,x.xp_amount FROM assessment_attempts a JOIN xp_ledger x ON x.attempt_id=a.id WHERE a.id=${partialAttempt}`;
      expect(partialResult!.status).toBe('GRADED');
      expect(Number(partialResult!.raw_points)).toBeCloseTo(expectedPartial, 2);
      expect(Number(partialResult!.xp_amount)).toBeCloseTo(expectedPartial * 10, 6);
      await finalizeTryout({
        attemptId: partialAttempt,
        kind: 'manual',
        studentId: partialStudent!.id,
      });
      const [partialLedger] =
        await owner`SELECT count(*)::int AS n FROM xp_ledger WHERE attempt_id=${partialAttempt}`;
      expect(partialLedger!.n).toBe(1);
      const [attempt] =
        await owner`INSERT INTO assessment_attempts(student_id,package_id,assessment_type,status) VALUES(${student!.id},${tryoutId},'TRYOUT','IN_PROGRESS') RETURNING id`;
      const [item] =
        await owner`INSERT INTO attempt_items(attempt_id,package_id,package_item_id,question_version_id,display_order,max_points) SELECT ${attempt!.id},package_id,id,question_version_id,display_order,max_points FROM package_items WHERE package_id=${tryoutId} AND display_order=1 RETURNING id`;
      expect((await media.links('Bearer student', item!.id, 'WORK')).media).toHaveLength(1);
      await owner`UPDATE assessment_attempts SET status='GRADED',finished_at=now() WHERE id=${attempt!.id}`;
      await expect(media.links('Bearer student', item!.id, 'REVIEW')).rejects.toMatchObject({
        status: 403,
      });
      const pgkSource = {
        sourceNamespace: `TEST-PGK-${suffix}`,
        sourceName: 'TEST ONLY',
        sourceReference: 'TEST ONLY PGK pending rubric',
      };
      const pgk = await ok<{ id: string }>('admin/content/packages', 'POST', {
        familyCode: `TEST-PGK-${suffix}`,
        packageVersion: 1,
        name: 'TEST ONLY PGK held',
        assessmentType: 'DRILL',
        isDemo: true,
        source: pgkSource,
        levelId: scope!.level_id,
      });
      const pgkRows = Array.from({ length: 10 }, (_, i) => ({
        ...structuredClone(q),
        externalId: `TEST-PGK-${i}`,
        type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
        answer: { optionIds: ['A', 'B'] },
        metadata: { ...q.metadata, sourceOrder: i + 1, assetManifest: [] },
      }));
      const pgkImport = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        {
          sourceNamespace: pgkSource.sourceNamespace,
          target: { packageId: pgk.id, expectedRevision: 0 },
          questions: pgkRows,
        },
        'admin',
        randomUUID(),
      );
      for (const item of pgkImport.items)
        await ok(`admin/content/versions/${item.questionVersionId}/review`, 'POST', {
          packageId: pgk.id,
          confirmed: true,
          notes: 'TEST ONLY raw answer preview',
        });
      await ok(`admin/content/packages/${pgk.id}/approval`, 'POST', {
        expectedRevision: 1,
        confirmed: true,
        reference: 'TEST ONLY content approval, no scoring rubric',
      });
      const held = await ok<ContentPackageDetailDto>(`admin/content/packages/${pgk.id}`);
      expect(held.readiness.blockers).toContain('RUNTIME');
      expect(
        (await request(`admin/content/packages/${pgk.id}/publish`, 'POST', { expectedRevision: 1 }))
          .status,
      ).toBe(409);
      expect((await ok<ContentPackageDetailDto>(`admin/content/packages/${pgk.id}`)).status).toBe(
        'DRAFT',
      );
      for (const token of ['operations', 'student'])
        expect(
          (
            await request(
              `admin/content/packages/${tryoutId}/archive`,
              'POST',
              { expectedRevision: 1 },
              token,
            )
          ).status,
        ).toBe(403);
      await ok(`admin/content/packages/${tryoutId}/archive`, 'POST', { expectedRevision: 1 });
      expect((await ok<ContentPackageDetailDto>(`admin/content/packages/${tryoutId}`)).status).toBe(
        'ARCHIVED',
      );
    });

    it('tracks upload-first intake, source recovery, draft edits, idempotency and one-confirmation publication', async () => {
      const ExcelJS = (await import('exceljs')).default;
      const first = samples[0]!;
      await owner`UPDATE competencies SET description=code`;
      const [scope] =
        await owner`SELECT c.name AS chapter,s.name AS subchapter,k.description AS competency FROM competencies k JOIN subchapters s ON s.id=k.subchapter_id JOIN chapters c ON c.id=s.chapter_id WHERE k.code=${first.competencyCode} AND s.code=${first.subchapterCode}`;
      async function workbook(count: number, kind = 'PG', image = false, blankTryoutScope = false) {
        const response = await request('admin/content/upload-template');
        expect(response.status).toBe(200);
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(
          Buffer.from(await response.arrayBuffer()) as unknown as import('exceljs').Buffer,
        );
        expect(book.getWorksheet('Paket')).toBeUndefined();
        const sheet = book.getWorksheet(kind)!;
        const headers = (sheet.getRow(1).values as import('exceljs').CellValue[])
          .slice(1)
          .map(String);
        expect(headers).not.toContain('external_id');
        expect(headers).not.toContain('no');
        expect(sheet.getCell(2, 1).dataValidation.type).toBe('list');
        for (let n = 0; n < count; n++) {
          const values: Record<string, string | number> = {
            Bab: blankTryoutScope ? '' : scope!.chapter,
            Subbab: blankTryoutScope ? '' : scope!.subchapter,
            Indikator: blankTryoutScope ? '' : scope!.competency,
            Level: blankTryoutScope ? '' : 1,
            Kesulitan: blankTryoutScope ? '' : 'Mudah',
            Soal: 'TEST ONLY ' + (n + 1),
            opt_A: 'Dua',
            opt_B: 'Tiga',
            Kunci: kind === 'PG' ? 'A' : 'A,B',
            Pembahasan: 'TEST ONLY explanation',
            alt_stem: image && n === 0 ? 'TEST original image' : '',
          };
          sheet.getRow(n + 2).values = headers.map((h) => values[h] ?? '');
        }
        if (image) {
          const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=',
            'base64',
          );
          bytes.set(createHash('sha256').update(png).digest('hex'), png);
          const imageId = book.addImage({
            buffer: png as unknown as import('exceljs').Buffer,
            extension: 'png',
          });
          sheet.addImage(imageId, {
            tl: { col: headers.indexOf('img_stem') + 0.1, row: 1.1 },
            ext: { width: 32, height: 32 },
          });
        }
        return Buffer.from(await book.xlsx.writeBuffer());
      }
      async function receive(
        buffer: Buffer,
        name = 'TEST upload.xlsx',
        key = randomUUID(),
        token = 'admin',
      ) {
        const form = new FormData();
        form.append('fileName', name);
        form.append('byteLength', String(buffer.length));
        form.append('file', new Blob([new Uint8Array(buffer)]), name);
        const response = await fetch(base + '/admin/content/uploads', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
          body: form,
        });
        return { response, key };
      }
      for (const token of ['operations', 'unassigned', 'student', 'teacher']) {
        expect((await request('admin/content/uploads', 'GET', undefined, token)).status).toBe(403);
        expect(
          (await receive(Buffer.from('bad'), 'bad.xlsx', randomUUID(), token)).response.status,
        ).toBe(403);
      }
      const invalid = (await (
        await receive(Buffer.from('{}'), 'bad.json')
      ).response.json()) as UploadDetailDto;
      expect(invalid.state).toBe('INVALID');
      expect(invalid.error).toBeTruthy();
      expect(workbooks.has(invalid.id)).toBe(false);
      const oversize = (await (
        await receive(Buffer.alloc(10 * 1024 * 1024 + 1))
      ).response.json()) as UploadDetailDto;
      expect(oversize.state).toBe('INVALID');
      expect(oversize.error).toContain('10 MiB');
      workbookFailure = true;
      const storageFailed = (await (
        await receive(await workbook(1))
      ).response.json()) as UploadDetailDto;
      expect(storageFailed.state).toBe('INVALID');
      workbookFailure = false;
      const source = await workbook(10, 'PG', true),
        operation = randomUUID();
      const uploaded = (await (
        await receive(source, 'TEST upload.xlsx', operation)
      ).response.json()) as UploadDetailDto;
      expect(uploaded.error).toBeNull();
      expect(uploaded.excel?.issues).toEqual([]);
      expect(uploaded.packageId).toBeNull();
      expect(uploaded.excel!.envelope.questions).toHaveLength(10);
      expect(uploaded.excel!.media).toHaveLength(1);
      expect(
        (await (await receive(source, 'TEST upload.xlsx', operation)).response.json()).id,
      ).toBe(uploaded.id);
      const [stored] =
        await owner`SELECT preview FROM content_upload_sessions WHERE id=${uploaded.id}`;
      expect(JSON.stringify(stored!.preview)).not.toContain('base64');
      const restored = await ok<UploadDetailDto>('admin/content/uploads/' + uploaded.id);
      expect(restored.excel!.media).toEqual(uploaded.excel!.media);
      const questions = restored.excel!.envelope.questions;
      const validate = (revision: number, selectedIds = questions.map((q) => q.externalId)) =>
        ok<UploadDetailDto>('admin/content/uploads/' + uploaded.id + '/preview', 'PATCH', {
          expectedRevision: revision,
          questions,
          selectedIds,
        });
      questions[0]!.stem.text += ' corrected';
      questions[0]!.metadata.assetManifest[0]!.altText = 'Corrected description';
      const checked = await validate(
        0,
        questions.slice(0, 5).map((q) => q.externalId),
      );
      expect(checked.state).toBe('VALIDATED');
      expect(checked.revision).toBe(1);
      expect(
        (
          await request('admin/content/uploads/' + uploaded.id + '/preview', 'PATCH', {
            expectedRevision: 0,
            questions,
            selectedIds: checked.selectedIds,
          })
        ).status,
      ).toBe(409);
      const draftBody = {
        expectedRevision: 1,
        title: 'TEST upload-first draft',
        assessmentType: 'DRILL',
      };
      expect(
        (
          await request(
            'admin/content/uploads/' + uploaded.id + '/draft',
            'POST',
            draftBody,
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      const asset = questions[0]!.metadata.assetManifest[0]!;
      const reservation = await ok<{ uploadId: string; objectKey: string }>(
        'admin/content/media/uploads',
        'POST',
        {
          externalId: asset.externalId,
          assetId: asset.assetId,
          sha256: asset.sha256,
          byteLength: asset.byteLength,
          contentType: asset.contentType,
          contentVersion: 1,
        },
        'admin',
        randomUUID(),
      );
      await ok(
        'admin/content/media/uploads/' + reservation.uploadId + '/complete',
        'POST',
        undefined,
        'admin',
        randomUUID(),
      );
      asset.objectKey = reservation.objectKey;
      const ready = await validate(1, checked.selectedIds);
      draftBody.expectedRevision = ready.revision;
      const failImport = vi
        .spyOn(app.get(ContentImportService), 'importWithin')
        .mockRejectedValueOnce(Error('TEST database mutation failure'));
      expect(
        (
          await request(
            'admin/content/uploads/' + uploaded.id + '/draft',
            'POST',
            draftBody,
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(500);
      failImport.mockRestore();
      expect(
        (await ok<UploadDetailDto>('admin/content/uploads/' + uploaded.id)).packageId,
      ).toBeNull();
      expect(
        (await owner`SELECT id FROM assessment_packages WHERE name=${draftBody.title}`).length,
      ).toBe(0);
      const saveKey = randomUUID();
      const draft = await ok<UploadDetailDto>(
        'admin/content/uploads/' + uploaded.id + '/draft',
        'POST',
        draftBody,
        'admin',
        saveKey,
      );
      expect(draft.package?.items).toHaveLength(5);
      expect(draft.package?.status).toBe('DRAFT');
      const repeated = await Promise.all([
        ok<UploadDetailDto>(
          'admin/content/uploads/' + uploaded.id + '/draft',
          'POST',
          draftBody,
          'admin',
          saveKey,
        ),
        ok<UploadDetailDto>(
          'admin/content/uploads/' + uploaded.id + '/draft',
          'POST',
          draftBody,
          'admin',
          saveKey,
        ),
      ]);
      expect(repeated.map((r) => r.packageId)).toEqual([draft.packageId, draft.packageId]);
      expect(
        (
          await request(
            'admin/content/uploads/' + uploaded.id + '/draft',
            'POST',
            { ...draftBody, title: 'other' },
            'admin',
            saveKey,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request('admin/content/packages/' + draft.packageId + '/publish', 'POST', {
            expectedRevision: 1,
            confirmed: true,
          })
        ).status,
      ).toBe(409);
      const full = await validate(draft.revision);
      expect(full.state).toBe('VALIDATED');
      const saved = await ok<UploadDetailDto>(
        'admin/content/uploads/' + uploaded.id + '/draft',
        'POST',
        { ...draftBody, expectedRevision: full.revision },
        'admin',
        randomUUID(),
      );
      expect(saved.packageId).toBe(draft.packageId);
      expect(saved.package!.items).toHaveLength(10);
      expect(saved.package!.items.every((q) => !q.reviewedAt)).toBe(true);
      const oldVersion = draft.package!.items[0]!.questionVersionId;
      const published = await request(
        'admin/content/packages/' + saved.packageId + '/publish',
        'POST',
        { expectedRevision: saved.package!.contentRevision, confirmed: true },
      );
      expect(published.ok, await published.text()).toBe(true);
      const history = await ok<UploadListDto>(
        'admin/content/uploads?search=upload-first&assessmentType=DRILL&status=PUBLISHED',
      );
      expect(history.items.some((q) => q.id === uploaded.id)).toBe(true);
      const result = await ok<UploadDetailDto>('admin/content/uploads/' + uploaded.id);
      expect(result.package!.items.every((q) => q.reviewedAt)).toBe(true);
      expect(result.package!.readiness.canPublish).toBe(false);
      expect(
        (
          await request('admin/content/uploads/' + uploaded.id + '/preview', 'PATCH', {
            expectedRevision: result.revision,
            questions,
            selectedIds: result.selectedIds,
          })
        ).status,
      ).toBe(409);
      expect((await owner`SELECT id FROM question_versions WHERE id=${oldVersion}`).length).toBe(1);

      const legacyResponse = await request(
        'admin/content/excel-template?packageId=' + result.packageId,
      );
      expect(legacyResponse.status).toBe(200);
      const legacyBook = new ExcelJS.Workbook();
      await legacyBook.xlsx.load(
        Buffer.from(await legacyResponse.arrayBuffer()) as unknown as import('exceljs').Buffer,
      );
      const legacySheet = legacyBook.getWorksheet('PG')!;
      const legacyValues: Record<string, string | number> = {
        external_id: 'TEST-OLD-ID',
        no: 1,
        chapter_code: first.chapterCode!,
        subchapter_code: first.subchapterCode!,
        competency_code: first.competencyCode!,
        source_level: 1,
        difficulty: 'EASY',
        stem: 'TEST legacy copy',
        opt_A: '2',
        opt_B: '3',
        answer: 'A',
        explanation: 'TEST legacy explanation',
      };
      legacySheet.getRow(1).eachCell((cell, col) => {
        legacySheet.getRow(2).getCell(col).value = legacyValues[cell.text] ?? '';
      });
      const legacy = (await (
        await receive(Buffer.from(await legacyBook.xlsx.writeBuffer()), 'TEST legacy V4.xlsx')
      ).response.json()) as UploadDetailDto;
      expect(legacy.excel!.issues).toEqual([]);
      expect(legacy.packageId).toBeNull();
      expect(
        (legacy.excel!.envelope as unknown as ExcelParseDto['envelope']).binding,
      ).toBeUndefined();
      expect(
        legacy.excel!.envelope.questions.every(
          (q) => q.externalId.startsWith('Q-') && q.metadata.sourceQuestionId === undefined,
        ),
      ).toBe(true);
      expect(
        (await ok<ContentPackageDetailDto>('admin/content/packages/' + result.packageId))
          .contentRevision,
      ).toBe(result.package!.contentRevision);
      const pgk = (await (
        await receive(await workbook(10, 'MCMA'))
      ).response.json()) as UploadDetailDto;
      const pgkChecked = await ok<UploadDetailDto>(
        'admin/content/uploads/' + pgk.id + '/preview',
        'PATCH',
        {
          expectedRevision: pgk.revision,
          questions: pgk.excel!.envelope.questions,
          selectedIds: pgk.selectedIds,
        },
      );
      const pgkSaved = await ok<UploadDetailDto>(
        'admin/content/uploads/' + pgk.id + '/draft',
        'POST',
        {
          expectedRevision: pgkChecked.revision,
          title: 'TEST PGK intake',
          assessmentType: 'DRILL',
        },
        'admin',
        randomUUID(),
      );
      const held = await request(
        'admin/content/packages/' + pgkSaved.packageId + '/publish',
        'POST',
        { expectedRevision: 1, confirmed: true },
      );
      expect(held.status).toBe(409);
      expect(
        (await ok<UploadDetailDto>('admin/content/uploads/' + pgk.id)).package!.items.every(
          (q) => !q.reviewedAt,
        ),
      ).toBe(true);
      const tryout = (await (await receive(await workbook(30))).response.json()) as UploadDetailDto;
      const tc = await ok<UploadDetailDto>(
        'admin/content/uploads/' + tryout.id + '/preview',
        'PATCH',
        {
          expectedRevision: 0,
          questions: tryout.excel!.envelope.questions,
          selectedIds: tryout.selectedIds,
        },
      );
      const ts = await ok<UploadDetailDto>(
        'admin/content/uploads/' + tryout.id + '/draft',
        'POST',
        { expectedRevision: tc.revision, title: 'TEST Tryout date', assessmentType: 'TRYOUT' },
        'admin',
        randomUUID(),
      );
      expect(
        (
          await request('admin/content/packages/' + ts.packageId + '/publish', 'POST', {
            expectedRevision: 1,
            confirmed: true,
            releaseAt: 'invalid-date',
          })
        ).status,
      ).toBe(400);
      expect(
        (await ok<UploadDetailDto>('admin/content/uploads/' + tryout.id)).package!.items.every(
          (q) => !q.reviewedAt,
        ),
      ).toBe(true);
      const blank = (await (
        await receive(await workbook(30, 'PG', false, true))
      ).response.json()) as UploadDetailDto;
      const blankChecked = await ok<UploadDetailDto>(
        'admin/content/uploads/' + blank.id + '/preview',
        'PATCH',
        {
          expectedRevision: 0,
          questions: blank.excel!.envelope.questions,
          selectedIds: blank.selectedIds,
          destination: {
            assessmentType: 'TRYOUT',
            title: 'TEST optional Tryout scope',
            chapterId: null,
            subchapterId: null,
            levelId: null,
          },
        },
      );
      expect(blankChecked.state).toBe('VALIDATED');
      const blankDraft = await ok<UploadDetailDto>(
        'admin/content/uploads/' + blank.id + '/draft',
        'POST',
        {
          expectedRevision: blankChecked.revision,
          title: 'TEST optional Tryout scope',
          assessmentType: 'TRYOUT',
        },
        'admin',
        randomUUID(),
      );
      await ok('admin/content/packages/' + blankDraft.packageId + '/publish', 'POST', {
        expectedRevision: 1,
        confirmed: true,
      });
      const blankPublished = await ok<UploadDetailDto>('admin/content/uploads/' + blank.id);
      expect(blankPublished.package!.status).toBe('PUBLISHED');
      expect(
        blankPublished.package!.items.every(
          (i) =>
            i.question?.subchapterCode === null &&
            i.question?.competencyCode === null &&
            i.question?.metadata.sourceLevelNumber === null,
        ),
      ).toBe(true);
    });
    it('persists incomplete intake mapping, restores legacy dropped rows, rejects spoofed relations and rechecks levels at Publish', async () => {
      const ExcelJS = (await import('exceljs')).default;
      const book = new ExcelJS.Workbook();
      const template = await request('admin/content/upload-template');
      await book.xlsx.load(
        Buffer.from(await template.arrayBuffer()) as unknown as import('exceljs').Buffer,
      );
      const sheet = book.getWorksheet('PG')!;
      const values: Record<string, string> = {
        Soal: 'TEST ONLY unresolved source',
        opt_A: '2',
        opt_B: '3',
        Kunci: 'A',
        Pembahasan: 'TEST ONLY',
        Kesulitan: 'Mudah',
        alt_stem: 'TEST ONLY image',
      };
      sheet.getRow(1).eachCell((c, n) => {
        sheet.getCell(2, n).value = values[c.text] ?? '';
      });
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=',
        'base64',
      );
      const headers = (sheet.getRow(1).values as import('exceljs').CellValue[])
        .slice(1)
        .map(String);
      const img = book.addImage({
        buffer: png as unknown as import('exceljs').Buffer,
        extension: 'png',
      });
      sheet.addImage(img, {
        tl: { col: headers.indexOf('img_stem'), row: 1 },
        ext: { width: 20, height: 20 },
      });
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(await book.xlsx.writeBuffer())]),
        'TEST unresolved.xlsx',
      );
      const received = await fetch(base + '/admin/content/uploads', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin', 'Idempotency-Key': randomUUID() },
        body: form,
      });
      expect(received.ok).toBe(true);
      const upload = (await received.json()) as UploadDetailDto;
      expect(upload.state).toBe('PREVIEW');
      expect(upload.excel!.envelope.questions).toHaveLength(1);
      expect(upload.excel!.media).toHaveLength(1);
      const destination = {
        assessmentType: 'TRYOUT',
        title: 'TEST unresolved history',
        chapterId: null,
        subchapterId: null,
        levelId: null,
      };
      const body = {
        expectedRevision: upload.revision,
        questions: upload.excel!.envelope.questions,
        selectedIds: upload.selectedIds,
        destination,
      };
      const progress = await ok<UploadDetailDto>(
        'admin/content/uploads/' + upload.id + '/preview',
        'PATCH',
        body,
      );
      expect(progress.state).toBe('VALIDATED');
      expect(progress.packageId).toBeNull();
      expect(progress.destination).toEqual(destination);
      expect(progress.excel!.mappingIssues.some((i) => i.field === 'competencyId')).toBe(false);
      expect(progress.excel!.mappingIssues.some((i) => i.field === 'levelId')).toBe(false);
      expect(progress.excel!.mappingIssues.some((i) => i.field === 'chapterId')).toBe(false);
      expect(
        (
          await request(
            'admin/content/uploads/' + upload.id + '/draft',
            'POST',
            {
              expectedRevision: progress.revision,
              title: destination.title,
              assessmentType: 'TRYOUT',
            },
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      expect(
        (await request('admin/content/uploads/' + upload.id + '/preview', 'PATCH', body)).status,
      ).toBe(409);
      const restored = await ok<UploadDetailDto>('admin/content/uploads/' + upload.id);
      expect(restored.excel!.media).toEqual(upload.excel!.media);
      expect(
        (
          await ok<UploadListDto>(
            'admin/content/uploads?search=unresolved%20history&assessmentType=TRYOUT',
          )
        ).items.some((i) => i.id === upload.id),
      ).toBe(true);
      const forged = structuredClone(restored.excel!.envelope.questions);
      forged[0]!.metadata.materialIds = {
        chapterId: 'invalid',
        subchapterId: null,
        competencyId: null,
        levelId: null,
      };
      expect(
        (
          await request('admin/content/uploads/' + upload.id + '/preview', 'PATCH', {
            ...body,
            expectedRevision: restored.revision,
            questions: forged,
          })
        ).status,
      ).toBe(400);
      // The old parser's empty JSON is repaired from original bytes without writing during GET.
      await owner`UPDATE content_upload_sessions SET preview=${JSON.stringify({ questions: [], selectedIds: [], issues: [{ sheet: 'PG', row: 2, cell: 'A2', code: 'TEXT_REQUIRED', detail: 'legacy metadata' }] })}::jsonb,state='INVALID' WHERE id=${upload.id}`;
      const recovered = await ok<UploadDetailDto>('admin/content/uploads/' + upload.id);
      expect(recovered.excel!.envelope.questions).toHaveLength(1);
      expect(recovered.excel!.media).toHaveLength(1);
      const [unchanged] =
        await owner`SELECT preview FROM content_upload_sessions WHERE id=${upload.id}`;
      expect(unchanged!.preview.questions).toHaveLength(0);
      const migrated = await ok<UploadDetailDto>(
        'admin/content/uploads/' + upload.id + '/preview',
        'PATCH',
        {
          expectedRevision: recovered.revision,
          questions: recovered.excel!.envelope.questions,
          selectedIds: recovered.selectedIds,
          destination,
        },
      );
      const [persisted] =
        await owner`SELECT preview FROM content_upload_sessions WHERE id=${upload.id}`;
      expect(persisted!.preview.intakeVersion).toBe(1);
      expect(persisted!.preview.questions).toHaveLength(1);
      expect(JSON.stringify(persisted)).not.toContain('base64');
      expect(migrated.packageId).toBeNull();
      const mappedBook = new ExcelJS.Workbook();
      await mappedBook.xlsx.load(
        Buffer.from(
          await (await request('admin/content/upload-template')).arrayBuffer(),
        ) as unknown as import('exceljs').Buffer,
      );
      const mappedSheet = mappedBook.getWorksheet('PG')!;
      const mappedValues: Record<string, string | number> = { ...values, alt_stem: '' };
      for (let row = 2; row <= 11; row++)
        mappedSheet.getRow(1).eachCell((c, n) => {
          mappedSheet.getCell(row, n).value = mappedValues[c.text] ?? '';
        });
      const mappedForm = new FormData();
      mappedForm.append(
        'file',
        new Blob([new Uint8Array(await mappedBook.xlsx.writeBuffer())]),
        'TEST blank mapping.xlsx',
      );
      const nextResponse = await fetch(base + '/admin/content/uploads', {
        method: 'POST',
        headers: { Authorization: 'Bearer admin', 'Idempotency-Key': randomUUID() },
        body: mappedForm,
      });
      const nextUpload = (await nextResponse.json()) as UploadDetailDto;
      const master = await ok<import('./content.dto').AdminCurriculumDto>(
        'admin/content/curriculum',
      );
      const chosenLevel = master.items.find(
        (i) =>
          i.kind === 'LEVEL' &&
          i.code === '1' &&
          i.status === 'READY' &&
          master.items.filter(
            (c) => c.kind === 'COMPETENCY' && c.parentId === i.parentId && c.status !== 'ARCHIVED',
          ).length === 1,
      )!;
      const chosenSub = master.items.find((i) => i.id === chosenLevel.parentId)!;
      const chosenChapter = master.items.find((i) => i.id === chosenSub.parentId)!;
      const mappedDestination = {
        assessmentType: 'DRILL',
        title: 'TEST mapping auto draft',
        chapterId: chosenChapter.id,
        subchapterId: chosenSub.id,
        levelId: chosenLevel.id,
      };
      const mappedPreview = await ok<UploadDetailDto>(
        'admin/content/uploads/' + nextUpload.id + '/preview',
        'PATCH',
        {
          expectedRevision: 0,
          questions: nextUpload.excel!.envelope.questions,
          selectedIds: nextUpload.selectedIds,
          destination: mappedDestination,
        },
      );
      expect(mappedPreview.state, JSON.stringify(mappedPreview.excel?.mappingIssues)).toBe(
        'VALIDATED',
      );
      expect(
        mappedPreview.excel!.envelope.questions.every(
          (q) =>
            q.metadata.materialOrigins?.chapterId === 'AUTO' &&
            q.metadata.sourceMaterial?.chapter === '',
        ),
      ).toBe(true);
      const mappedDraft = await ok<UploadDetailDto>(
        'admin/content/uploads/' + nextUpload.id + '/draft',
        'POST',
        {
          expectedRevision: mappedPreview.revision,
          title: mappedDestination.title,
          assessmentType: 'DRILL',
        },
        'admin',
        randomUUID(),
      );
      const relations =
        await owner`SELECT i.display_order,v.level_id,q.primary_competency_id,q.curriculum_level_number,v.content_status FROM package_items i JOIN question_versions v ON v.id=i.question_version_id JOIN question_variants vr ON vr.id=v.variant_id JOIN questions q ON q.id=vr.question_id WHERE i.package_id=${mappedDraft.packageId!} ORDER BY i.display_order`;
      expect(relations).toHaveLength(10);
      expect(relations.map((i) => i.display_order)).toEqual(
        Array.from({ length: 10 }, (_, i) => i + 1),
      );
      expect(
        relations.every(
          (i) =>
            i.level_id === chosenLevel.id &&
            i.primary_competency_id &&
            i.curriculum_level_number === 1 &&
            i.content_status === 'DRAFT',
        ),
      ).toBe(true);
      await owner`UPDATE levels SET status='ARCHIVED' WHERE id=${chosenLevel.id}`;
      expect(
        (
          await request('admin/content/uploads/' + nextUpload.id + '/preview', 'PATCH', {
            expectedRevision: mappedDraft.revision,
            questions: mappedPreview.excel!.envelope.questions,
            selectedIds: mappedPreview.selectedIds,
            destination: mappedDestination,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            'admin/content/uploads/' + nextUpload.id + '/draft',
            'POST',
            {
              expectedRevision: mappedDraft.revision + 1,
              title: mappedDestination.title,
              assessmentType: 'DRILL',
            },
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      await owner`UPDATE levels SET status='READY' WHERE id=${chosenLevel.id}`;
      const [academic] =
        await owner`SELECT l.id FROM levels l JOIN question_versions v ON v.level_id=l.id JOIN package_items i ON i.question_version_id=v.id JOIN assessment_packages p ON p.id=i.package_id WHERE p.assessment_type='TRYOUT' AND p.status='DRAFT' LIMIT 1`;
      if (academic) {
        await owner`UPDATE levels SET status='ARCHIVED' WHERE id=${academic.id}`;
        const [p] =
          await owner`SELECT p.id,p.content_revision FROM assessment_packages p JOIN package_items i ON i.package_id=p.id JOIN question_versions v ON v.id=i.question_version_id WHERE p.assessment_type='TRYOUT' AND p.status='DRAFT' AND v.level_id=${academic.id} LIMIT 1`;
        expect(
          (
            await request('admin/content/packages/' + p!.id + '/publish', 'POST', {
              expectedRevision: p!.content_revision,
              confirmed: true,
              releaseAt: '2099-01-05T00:00:00+07:00',
            })
          ).status,
        ).toBe(409);
        await owner`UPDATE levels SET status='READY' WHERE id=${academic.id}`;
      }
    });
    it('reviews all rich types without scoring and preserves imported payload and preview snapshots', async () => {
      await owner`UPDATE chapters SET status='READY'`;
      await owner`UPDATE subchapters SET status='READY'`;
      await owner`UPDATE competencies SET status='READY'`;
      await owner`UPDATE levels SET status='READY'`;
      const revised = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        body(
          samples.map((q) => ({
            ...q,
            difficulty: 'EASY',
            stem: { text: q.stem.text + ' TEST editorial revision' },
          })),
        ),
        'admin',
        randomUUID(),
      );
      for (const entry of revised.items) {
        const id = entry.questionVersionId!;
        const detail = await ok<import('./content-lifecycle.dto').ContentVersionDetailDto>(
          `admin/content/versions/${id}`,
        );
        expect(detail.readiness.canReviewReady).toBe(true);
        const decisions = await Promise.all([
          request(`admin/content/versions/${id}/review`, 'POST', {
            status: 'READY',
            expectedStatus: 'DRAFT',
            reason: 'TEST reviewed key/explanation/taxonomy',
          }),
          request(`admin/content/versions/${id}/review`, 'POST', {
            status: 'REVISION',
            expectedStatus: 'DRAFT',
            reason: 'TEST concurrent decision',
          }),
        ]);
        expect(
          decisions.map((r) => r.status).sort(),
          JSON.stringify(await Promise.all(decisions.map((r) => r.json()))),
        ).toEqual([200, 409]);
        const reviewed = await ok<import('./content-lifecycle.dto').ContentVersionDetailDto>(
          `admin/content/versions/${id}`,
        );
        expect(reviewed.status).not.toBe('DRAFT');
        if (reviewed.status === 'REVISION')
          await ok(`admin/content/versions/${id}/review`, 'POST', {
            status: 'READY',
            expectedStatus: 'REVISION',
            reason: 'TEST final review',
          });
        const ready = await ok<import('./content-lifecycle.dto').ContentVersionDetailDto>(
          `admin/content/versions/${id}`,
        );
        expect(ready.readiness.canReviewReady).toBe(true);
        if (ready.payload.type !== 'SINGLE_CHOICE')
          expect(ready.readiness.publicationBlockers).toContain('APPROVED_PGK_RUBRIC_REQUIRED');
        await expect(
          owner`UPDATE question_versions SET stem='{}' WHERE id=${id}`,
        ).rejects.toMatchObject({ code: '23514' });
        await expect(owner`DELETE FROM question_versions WHERE id=${id}`).rejects.toMatchObject({
          code: '23514',
        });
      }
      const source = revised.items[0]!.questionVersionId!;
      const q = {
        ...samples[0]!,
        difficulty: 'EASY',
        stem: { text: samples[0]!.stem.text + ' TEST next editorial revision' },
      };
      const revision = {
        ...body([q as ImportQuestion]),
        expectedSourceVersionId: source,
        revisionReason: 'TEST fix explanation',
      };
      const key = randomUUID();
      const next = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        revision,
        'admin',
        key,
      );
      expect(
        (await ok<ImportReportDto>('admin/content/imports', 'POST', revision, 'admin', key)).items,
      ).toEqual(next.items);
      expect(
        (await request('admin/content/imports', 'POST', revision, 'admin', randomUUID())).status,
      ).toBe(409);
      expect(
        (
          await ok<import('./content-lifecycle.dto').ContentVersionDetailDto>(
            `admin/content/versions/${next.items[0]!.questionVersionId}`,
          )
        ).revisedFromId,
      ).toBe(source);
      await ok(`admin/content/versions/${source}/review`, 'POST', {
        status: 'ARCHIVED',
        expectedStatus: 'READY',
        reason: 'TEST superseded',
      });
      expect(
        (
          await request(
            'admin/content/preview-sessions',
            'POST',
            { questionVersionIds: [source] },
            'admin',
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      const historical = await ok<PreviewSessionDto>(
        `admin/content/preview-sessions/${session.id}/result`,
      );
      expect(historical.items[0]!.stem.text).toBe(session.items[0]!.stem.text);
      expect(
        (
          await owner`SELECT count(*)::int n FROM audit_logs WHERE action='content_review_decision'`
        )[0]!.n,
      ).toBeGreaterThanOrEqual(11);
    });
  },
);
