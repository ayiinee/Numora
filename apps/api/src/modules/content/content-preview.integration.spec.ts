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
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { getDatabase, closeDatabaseConnection, users, type ImportQuestion } from '@tka/database';
import { ContentModule } from './content.module';
import { IdentityService } from '../identity/identity.service';
import { configureApplication } from '../../bootstrap';
import { R2MediaStorage, matchesImageSignature } from './r2-media.storage';
import type { MediaUpload } from './media-uploads.repository';
import type { ImportReportDto, PreviewSessionDto, PreviewAckDto } from './content-preview.dto';

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
    let enabled = true;
    const bytes = new Map<string, Buffer>();
    const storage = {
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
        if (!chaptersMap.has(q.chapterCode)) {
          const id = randomUUID();
          chaptersMap.set(q.chapterCode, id);
          await owner`INSERT INTO chapters(id,code,slug,name,display_order) VALUES(${id},${q.chapterCode},${q.chapterCode.toLowerCase()},${'TEST ONLY ' + q.chapterCode},${chaptersMap.size})`;
        }
        const subKey = q.chapterCode + ':' + q.subchapterCode;
        if (!subMap.has(subKey)) {
          const id = randomUUID();
          subMap.set(subKey, id);
          await owner`INSERT INTO subchapters(id,chapter_id,code,slug,name,display_order) VALUES(${id},${chaptersMap.get(q.chapterCode)!},${q.subchapterCode},${q.subchapterCode.toLowerCase()},${'TEST ONLY ' + q.subchapterCode},${subMap.size})`;
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
        await ok(`admin/content/questions/${detail.questionId}/status`, 'PATCH', {
          status: 'READY',
        });
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
