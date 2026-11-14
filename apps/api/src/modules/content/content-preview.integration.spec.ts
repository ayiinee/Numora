import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, connect, type Socket } from 'node:net';
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
import { TryoutBatchesService } from '../learning/tryout-batches.service';
import { TryoutService } from '../learning/tryout.service';
import { TryoutController } from '../learning/tryout.controller';
import type { TryoutAttemptDto, TryoutSubmitDto } from '../learning/tryout.dto';
import { TryoutReleaseService } from '../learning/tryout-release.service';
import type { SaveTryoutBatchDto, TryoutBatchDto } from '../learning/tryout-batches.dto';
import { IdentityService } from '../identity/identity.service';
import { IdentityModule } from '../identity/identity.module';
import { configureApplication } from '../../bootstrap';
import { R2MediaStorage, matchesImageSignature } from './r2-media.storage';
import { ContentUploadsService } from './content-uploads.service';
import type { MediaUpload } from './media-uploads.repository';
import type { ImportReportDto, PreviewSessionDto, PreviewAckDto } from './content-preview.dto';
import type { ContentPackageDetailDto, CreateContentPackageDto } from './content-packages.dto';
import { ContentImportService } from './content-import.service';
import type { UploadDetailDto, UploadListDto } from './content-uploads.dto';
import type { ExcelParseDto } from './excel-import.dto';
import { DrillAssessmentService } from '../learning/drill-assessment.service';
import { PretestService } from '../learning/pretest.service';
import { AssessmentMediaService } from '../learning/assessment-media.service';
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
    async function measureTransfer<T>(run: () => Promise<T>) {
      await closeDatabaseConnection();
      const runtimeUrl = process.env.DATABASE_URL!;
      const upstreamUrl = new URL(runtimeUrl);
      const upstreamHost = upstreamUrl.hostname;
      const upstreamPort = Number(upstreamUrl.port || 5432);
      const sockets = new Set<Socket>();
      let responseBytes = 0;
      const proxy = createServer((downstream) => {
        const upstream = connect(upstreamPort, upstreamHost);
        for (const socket of [upstream, downstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => {
            upstream.destroy();
            downstream.destroy();
          });
        }
        upstream.on('data', (chunk) => {
          responseBytes += chunk.length;
        });
        upstream.pipe(downstream);
        downstream.pipe(upstream);
      });
      try {
        await new Promise<void>((done, fail) =>
          proxy.once('error', fail).listen(0, '127.0.0.1', done),
        );
        const address = proxy.address();
        if (!address || typeof address === 'string')
          throw new Error('TEST ONLY proxy missing port');
        upstreamUrl.hostname = '127.0.0.1';
        upstreamUrl.port = String(address.port);
        process.env.DATABASE_URL = upstreamUrl.toString();
        // Exclude connection/authentication setup; measure PostgreSQL → API bytes only.
        await getDatabase().client`select 1`;
        responseBytes = 0;
        const value = await run();
        return { value, responseBytes };
      } finally {
        await closeDatabaseConnection();
        process.env.DATABASE_URL = runtimeUrl;
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => proxy.close(() => done()));
      }
    }
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
        ['unallocatedStudent', 'STUDENT', null],
        ['lateStudent', 'STUDENT', null],
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
      const module = await Test.createTestingModule({
        imports: [ContentModule, IdentityModule],
        controllers: [TryoutController],
        providers: [TryoutService, TryoutReleaseService],
      })
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
    it('preserves upload summary counts, validation precedence, filters and pagination without full JSON', async () => {
      const prefix = `TEST SUMMARY ${suffix}`;
      const question = structuredClone(samples[0]!);
      const preview = {
        intakeVersion: 1,
        questions: [question],
        selectedIds: ['TEST selected'],
        issues: [],
        destination: {
          title: prefix + ' destination',
          assessmentType: 'TRYOUT',
          chapterId: null,
          subchapterId: null,
          levelId: null,
        },
      };
      const report = { items: [{}, {}], canImportDraft: true };
      const cases = [
        { preview: null, report: null, count: 0, validation: 'Belum divalidasi' },
        { preview: null, report, count: 2, validation: 'Isi valid' },
        { preview: { ...preview, selectedIds: [] }, report, count: 0, validation: 'Isi valid' },
        {
          preview: { ...preview, issues: [{}, {}] },
          report,
          count: 1,
          validation: '2 masalah parsing',
        },
        {
          preview: { ...preview, validationCounts: { content: 2, mapping: 3 }, issues: [{}] },
          report,
          count: 1,
          validation: 'Konten: 2 masalah; pemetaan: 3 belum selesai',
        },
        {
          preview: { ...preview, validationCounts: { content: 0, mapping: 0 } },
          report: { ...report, canImportDraft: false },
          count: 1,
          validation: 'Pemetaan/validasi belum lengkap',
        },
        {
          preview: { ...preview, validationCounts: { content: 2, mapping: 0 } },
          report,
          error: 'TEST source error',
          count: 1,
          validation: 'TEST source error',
        },
        { preview, report: null, count: 1, validation: 'Belum divalidasi' },
        {
          preview: {
            ...preview,
            destination: { ...preview.destination, assessmentType: 'PRETEST' },
          },
          report,
          count: 1,
          validation: 'Isi valid',
          packageName: prefix + ' package',
        },
      ];
      const ids: string[] = [];
      for (const [index, item] of cases.entries()) {
        let packageId: string | null = null;
        if ('packageName' in item) {
          const [pack] =
            await owner`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type) VALUES(${randomUUID()},1,${item.packageName},'TRYOUT') RETURNING id`;
          packageId = pack!.id;
        }
        const [row] =
          await owner`INSERT INTO content_upload_sessions(actor_user_id,idempotency_key,file_name,file_sha256,byte_length,state,preview,report,error,created_at,package_id) VALUES(${actor},${randomUUID()},${prefix + ' ' + index},'TEST checksum',1,'PREVIEW',${JSON.stringify(item.preview)}::jsonb,${JSON.stringify(item.report)}::jsonb,${'error' in item ? item.error : null},${new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()},${packageId}) RETURNING id`;
        ids.push(row!.id);
      }
      // SQL NULL and JSON null must behave identically after projection.
      await owner`UPDATE content_upload_sessions SET preview=null,report=null WHERE id=${ids[0]!}`;
      const list = await ok<UploadListDto>(
        `admin/content/uploads?search=${encodeURIComponent(prefix)}&limit=100`,
      );
      expect(list.total).toBe(cases.length);
      expect(list.items.map((item) => item.id)).toEqual([...ids].reverse());
      for (const [index, item] of cases.entries()) {
        const actual = list.items.find((row) => row.id === ids[index])!;
        expect(actual).toMatchObject({
          questionCount: item.count,
          validationResult: item.validation,
          title:
            'packageName' in item ? item.packageName : (item.preview?.destination?.title ?? null),
          assessmentType:
            'packageName' in item ? 'TRYOUT' : (item.preview?.destination?.assessmentType ?? null),
        });
        const detail = await ok<UploadDetailDto>(`admin/content/uploads/${actual.id}`);
        expect(detail).toMatchObject({
          validationResult: actual.validationResult,
          title: actual.title,
          assessmentType: actual.assessmentType,
        });
        expect(Object.keys(actual).sort()).toEqual([
          'actorName',
          'assessmentType',
          'createdAt',
          'error',
          'fileName',
          'id',
          'packageId',
          'questionCount',
          'revision',
          'state',
          'status',
          'title',
          'validationResult',
        ]);
      }
      const page = await ok<UploadListDto>(
        `admin/content/uploads?search=${encodeURIComponent(prefix)}&limit=2&offset=1`,
      );
      expect(page.total).toBe(cases.length);
      expect(page.items).toEqual(list.items.slice(1, 3));
      const filtered = await ok<UploadListDto>(
        `admin/content/uploads?search=${encodeURIComponent(prefix)}&assessmentType=TRYOUT&status=PREVIEW&limit=100`,
      );
      expect(filtered.items.map((item) => item.id)).toEqual(
        list.items
          .filter((item) => item.assessmentType === 'TRYOUT' && item.status === 'PREVIEW')
          .map((item) => item.id),
      );
      expect(filtered.total).toBe(6);
      const drafts = await ok<UploadListDto>(
        `admin/content/uploads?search=${encodeURIComponent(prefix)}&assessmentType=TRYOUT&status=DRAFT&limit=100`,
      );
      expect(drafts.total).toBe(1);
      expect(drafts.items[0]!.id).toBe(ids[8]);
      const byTitle = await ok<UploadListDto>(
        `admin/content/uploads?search=${encodeURIComponent(prefix + ' destination')}&limit=100`,
      );
      expect(byTitle.total).toBe(6);
      for (const token of ['', 'operations', 'unassigned', 'student', 'teacher'])
        expect((await request('admin/content/uploads', 'GET', undefined, token)).status).toBe(
          token ? 403 : 401,
        );
      enabled = false;
      try {
        expect((await request('admin/content/uploads')).status).toBe(503);
      } finally {
        enabled = true;
      }
    });
    it('prepares real legacy intake idempotently, rejects stale revisions and preserves reviewed packages', async () => {
      const [chapter] = await owner`SELECT id FROM chapters ORDER BY id LIMIT 1`;
      const [legacy] =
        await owner`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,chapter_id) VALUES(${'TEST-LEGACY-' + suffix},1,'TEST ONLY legacy draft','PRETEST',${chapter!.id}) RETURNING id`;
      const source = {
        sourceNamespace: 'TEST_LEGACY_' + suffix,
        sourceName: 'TEST ONLY source',
        sourceReference: 'TEST ONLY actual source intake',
      };
      const body = { expectedRevision: 0, source };
      for (const role of ['operations', 'unassigned', 'student', 'teacher'])
        expect(
          (await request(`admin/content/packages/${legacy!.id}/intake`, 'POST', body, role)).status,
        ).toBe(403);
      expect(
        (
          await request(`admin/content/packages/${legacy!.id}/intake`, 'POST', {
            ...body,
            expectedRevision: 1,
          })
        ).status,
      ).toBe(409);
      const prepared = await ok<{ id: string }>(
        `admin/content/packages/${legacy!.id}/intake`,
        'POST',
        body,
      );
      expect(prepared.id).toBe(legacy!.id);
      expect(await ok(`admin/content/packages/${legacy!.id}/intake`, 'POST', body)).toEqual(
        prepared,
      );
      const draft = await ok<ContentPackageDetailDto>(`admin/content/packages/${legacy!.id}`);
      expect(draft).toMatchObject({
        contentRevision: 1,
        source,
        items: [],
        curriculumApproval: null,
        frozenAt: null,
      });
      expect(
        (
          await request(`admin/content/packages/${legacy!.id}/publish`, 'POST', {
            expectedRevision: 1,
          })
        ).status,
      ).toBe(409);
      // TEST ONLY historical review marker. It is preserved, never adopted as new approval.
      const [reviewed] =
        await owner`INSERT INTO assessment_packages(family_code,package_version,name,assessment_type,chapter_id,manifest_digest) VALUES(${'TEST-REVIEWED-' + suffix},1,'TEST ONLY reviewed legacy','PRETEST',${chapter!.id},${'a'.repeat(64)}) RETURNING *`;
      const next = await ok<{ id: string }>(
        `admin/content/packages/${reviewed!.id}/intake`,
        'POST',
        body,
      );
      expect(next.id).not.toBe(reviewed!.id);
      expect(await ok(`admin/content/packages/${reviewed!.id}/intake`, 'POST', body)).toEqual(next);
      expect(await ok<ContentPackageDetailDto>(`admin/content/packages/${next.id}`)).toMatchObject({
        packageVersion: 2,
        items: [],
        source,
        curriculumApproval: null,
        frozenAt: null,
      });
      const [unchanged] = await owner`SELECT * FROM assessment_packages WHERE id=${reviewed!.id}`;
      expect(unchanged).toEqual(reviewed);
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
    it('searches package names and family codes across server pages with matching totals and filters', async () => {
      const family = `SEARCH-${suffix}`;
      for (let index = 0; index < 7; index++) {
        await ok('admin/content/packages', 'POST', {
          familyCode: `${family}-${index}`,
          packageVersion: 1,
          name: `TEST ONLY Search Sentinel ${index}`,
          assessmentType: 'TRYOUT',
          source: {
            sourceNamespace: `${namespace}_search`,
            sourceName: 'TEST ONLY Search Source',
            sourceReference: 'TEST ONLY search fixture',
          },
        });
      }
      const query =
        'usageType=TRYOUT&search=search%20sentinel&status=DRAFT&source=search%20source&limit=5';
      const first = await ok<{ items: { id: string }[]; total: number }>(
        `admin/content/packages?${query}`,
      );
      const second = await ok<{ items: { id: string }[]; total: number }>(
        `admin/content/packages?${query}&offset=5`,
      );
      expect(first.total).toBe(7);
      expect(second.total).toBe(7);
      expect(first.items).toHaveLength(5);
      expect(second.items).toHaveLength(2);
      expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(7);
      expect(
        (await ok<{ total: number }>(`admin/content/packages?search=${family.toLowerCase()}-6`))
          .total,
      ).toBe(1);
      expect((await ok<{ total: number }>('admin/content/packages?search=%25')).total).toBe(0);
      expect(
        (
          await ok<{ total: number }>(
            `admin/content/packages?${query.replace('DRAFT', 'ARCHIVED')}`,
          )
        ).total,
      ).toBe(0);
      expect((await request(`admin/content/packages?search=${'x'.repeat(161)}`)).status).toBe(400);
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
      expect(reviewed.readiness.checks.some((c) => c.code === 'REVIEW')).toBe(false);
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
          isDemo: usage !== 'PRETEST',
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
        ).toBe(usage === 'PRETEST' ? 201 : 409);
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
        if (usage === 'TRYOUT' || usage === 'PRETEST')
          expect(runtimePin).toMatchObject({ frozen: true, approved: true });
        const available = await ok<ContentPackageDetailDto>(`admin/content/packages/${pack.id}`);
        if (usage === 'PRETEST') expect(available.availability?.state).toBe('AVAILABLE');
        if (usage === 'TRYOUT') expect(available.availability?.state).toBe('READY_FOR_BATCH');
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
      const pretests = new PretestService(identity);
      expect(await pretests.chapter('Bearer student', scope!.chapter_id)).toMatchObject({
        state: 'available',
        canStart: true,
        isDemo: false,
      });
      const pretest = await pretests.start('Bearer student', scope!.chapter_id);
      expect(pretest.questions).toHaveLength(20);
      expect((await pretests.start('Bearer student', scope!.chapter_id)).id).toBe(pretest.id);
      await pretests.saveAnswer(
        'Bearer student',
        pretest.id,
        pretest.questions[0]!.questionInstanceId,
        { optionId: 'A' },
        0,
      );
      expect((await pretests.attempt('Bearer student', pretest.id)).questions[0]).toMatchObject({
        selectedOptionId: 'A',
        revision: 1,
      });
      for (const question of pretest.questions.slice(1))
        await pretests.saveAnswer(
          'Bearer student',
          pretest.id,
          question.questionInstanceId,
          { optionId: 'A' },
          0,
        );
      const completed = await pretests.submit('Bearer student', pretest.id);
      expect(completed.questionCount).toBe(20);
      expect(await pretests.submit('Bearer student', pretest.id)).toEqual(completed);
      expect(await pretests.chapter('Bearer student', scope!.chapter_id)).toMatchObject({
        state: 'completed',
        canStart: false,
        canSkip: false,
      });
      await expect(pretests.start('Bearer student', scope!.chapter_id)).rejects.toMatchObject({
        status: 409,
      });
      const [pretestEffects] =
        await owner`SELECT (SELECT count(*)::int FROM xp_ledger WHERE attempt_id=${pretest.id}) AS xp, (SELECT count(*)::int FROM analytics_outbox WHERE entity_id=${pretest.id} AND event_name='pretest_completed') AS completions`;
      expect(pretestEffects).toMatchObject({ xp: 0, completions: 1 });
      const [officialPretest] =
        await owner`SELECT is_demo,frozen_at,curriculum_approval->>'manifestDigest'=manifest_digest AS approved FROM assessment_packages WHERE id=${published.find((p) => p.usage === 'PRETEST')!.id}`;
      expect(officialPretest).toMatchObject({ is_demo: false, approved: true });
      expect(officialPretest!.frozen_at).toBeTruthy();
      async function successor(originalId: string, packageVersion: number) {
        const original = await ok<ContentPackageDetailDto>(`admin/content/packages/${originalId}`);
        const next = await ok<{ id: string }>('admin/content/packages', 'POST', {
          familyCode: original.familyCode,
          packageVersion,
          name: 'TEST ONLY reviewed successor',
          assessmentType: original.assessmentType,
          isDemo: original.isDemo,
          source: original.source,
          ...(original.assessmentType === 'PRETEST' ? { chapterId: original.chapterId } : {}),
        });
        await ok(`admin/content/packages/${next.id}`, 'PATCH', {
          expectedRevision: 0,
          name: 'TEST ONLY reviewed successor',
          questionVersionIds: original.items.map((i) => i.questionVersionId),
        });
        await ok(`admin/content/packages/${next.id}/approval`, 'POST', {
          expectedRevision: 1,
          confirmed: true,
          reference: 'TEST ONLY successor approval',
        });
        await ok(`admin/content/packages/${next.id}/publish`, 'POST', { expectedRevision: 1 });
        return next.id;
      }
      const pretestId = published.find((p) => p.usage === 'PRETEST')!.id;
      const nextPretest = await successor(pretestId, 2);
      expect(
        (await ok<ContentPackageDetailDto>(`admin/content/packages/${pretestId}`)).availability,
      ).toMatchObject({
        state: 'BLOCKED',
        blockers: ['PRETEST_NOT_SELECTED_OR_POLICY_UNSUPPORTED'],
      });
      expect(
        (await ok<ContentPackageDetailDto>(`admin/content/packages/${nextPretest}`)).availability
          ?.state,
      ).toBe('AVAILABLE');
      expect(await pretests.result('Bearer student', pretest.id)).toEqual(completed);
      const scheduledTryout = published.find((p) => p.usage === 'TRYOUT')!.id;
      const firstTryout = await successor(scheduledTryout, 2);
      // Package readiness is independent of legacy release dates and newer packages.
      expect(
        (await ok<ContentPackageDetailDto>(`admin/content/packages/${firstTryout}`)).availability
          ?.state,
      ).toBe('READY_FOR_BATCH');
      const latestTryout = await successor(scheduledTryout, 3);
      expect(
        (await ok<ContentPackageDetailDto>(`admin/content/packages/${firstTryout}`)).availability,
      ).toMatchObject({ state: 'READY_FOR_BATCH', blockers: [] });
      expect(
        (await ok<ContentPackageDetailDto>(`admin/content/packages/${latestTryout}`)).availability
          ?.state,
      ).toBe('READY_FOR_BATCH');
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

    it('prepares legacy Pretest scoring atomically without changing content or order', async () => {
      const [published] =
        await owner`SELECT id,chapter_id FROM assessment_packages WHERE assessment_type='PRETEST' AND status='PUBLISHED' LIMIT 1`;
      const source = {
        sourceNamespace: `REPAIR-${suffix}`,
        sourceName: 'TEST ONLY',
        sourceReference: 'TEST ONLY',
      };
      const draft = await ok<{ id: string }>('admin/content/packages', 'POST', {
        familyCode: `REPAIR-${suffix}`,
        packageVersion: 100,
        name: 'TEST ONLY scoring repair',
        assessmentType: 'PRETEST',
        chapterId: published!.chapter_id,
        isDemo: false,
        source,
      });
      const template = structuredClone(samples.find((q) => q.type === 'SINGLE_CHOICE')!);
      template.difficulty = 'EASY';
      template.metadata.sourceLevelNumber = null;
      const rows = Array.from({ length: 20 }, (_, i) => ({
        ...structuredClone(template),
        externalId: `REPAIR-${i}`,
        type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
        answer: { optionIds: [template.options[0]!.id] },
        metadata: { ...template.metadata, assetManifest: [], sourceOrder: i + 1 },
      }));
      const imported = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        {
          sourceNamespace: source.sourceNamespace,
          target: { packageId: draft.id, expectedRevision: 0 },
          questions: rows,
        },
        'admin',
        randomUUID(),
      );
      const [wrongRubric] =
        await owner`SELECT id FROM scoring_rubric_versions WHERE question_type='MULTIPLE_CHOICE_MULTIPLE_ANSWER' AND definition->>'policyCode'<>'PRETEST_PGK_PARTIAL_V1' LIMIT 1`;
      expect(wrongRubric).toBeTruthy();
      async function legacyVersion(oldId: string, invalid = false, rubric: string | null = null) {
        const [row] =
          await owner`INSERT INTO question_versions(variant_id,version_number,question_type,stem,options_or_statements,answer_key,explanation,media,difficulty,level_id,content_status,revised_from_question_version_id,scoring_rubric_version_id)
          SELECT variant_id,(SELECT max(v.version_number)+1 FROM question_versions v WHERE v.variant_id=q.variant_id),question_type,
            CASE WHEN ${invalid} THEN '{"text":""}'::jsonb ELSE stem END,options_or_statements,answer_key,explanation,media,difficulty,level_id,'DRAFT',id,${rubric}
          FROM question_versions q WHERE id=${oldId} RETURNING id`;
        await owner`INSERT INTO content_import_versions(question_version_id,identity_id,import_id,content_hash,provenance)
          SELECT ${row!.id},identity_id,import_id,content_hash,provenance FROM content_import_versions WHERE question_version_id=${oldId}`;
        await owner`UPDATE package_items SET question_version_id=${row!.id},rubric_version_id=null WHERE package_id=${draft.id} AND question_version_id=${oldId}`;
        return row!.id;
      }
      for (const [index, item] of imported.items.entries())
        await legacyVersion(item.questionVersionId!, false, index === 2 ? wrongRubric!.id : null);
      const before =
        await owner`SELECT v.*,i.display_order,i.max_points FROM question_versions v JOIN package_items i ON i.question_version_id=v.id WHERE i.package_id=${draft.id} ORDER BY i.display_order`;
      for (const token of ['operations', 'student', 'unassigned'])
        expect(
          (
            await request(
              `admin/content/packages/${draft.id}/prepare-scoring`,
              'POST',
              { expectedRevision: 1 },
              token,
            )
          ).status,
        ).toBe(403);
      expect(
        (
          await request(`admin/content/packages/${draft.id}/prepare-scoring`, 'POST', {
            expectedRevision: 0,
          })
        ).status,
      ).toBe(409);
      const invalidId = await legacyVersion(before[1]!.id, true);
      const [countBefore] = await owner`SELECT count(*)::int AS n FROM question_versions`;
      expect(
        (
          await request(`admin/content/packages/${draft.id}/prepare-scoring`, 'POST', {
            expectedRevision: 1,
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      const [countFailed] = await owner`SELECT count(*)::int AS n FROM question_versions`;
      expect(countFailed!.n).toBe(countBefore!.n);
      const unchanged = await ok<ContentPackageDetailDto>(`admin/content/packages/${draft.id}`);
      expect(unchanged.contentRevision).toBe(1);
      expect(unchanged.items.map((i) => i.questionVersionId)).toEqual(
        before.map((i, n) => (n === 1 ? invalidId : i.id)),
      );
      await owner`UPDATE package_items SET question_version_id=${before[1]!.id} WHERE package_id=${draft.id} AND question_version_id=${invalidId}`;
      await ok(`admin/content/packages/${draft.id}/prepare-scoring`, 'POST', {
        expectedRevision: 1,
      });
      const after =
        await owner`SELECT v.*,i.display_order,i.max_points FROM question_versions v JOIN package_items i ON i.question_version_id=v.id WHERE i.package_id=${draft.id} ORDER BY i.display_order`;
      expect(after).toHaveLength(20);
      for (let i = 0; i < 20; i++) {
        expect(after[i]!.id).not.toBe(before[i]!.id);
        for (const field of [
          'stem',
          'options_or_statements',
          'answer_key',
          'explanation',
          'media',
          'display_order',
          'max_points',
        ])
          expect(after[i]![field]).toEqual(before[i]![field]);
        expect(after[i]!.scoring_rubric_version_id).toBeTruthy();
      }
      await ok(`admin/content/packages/${draft.id}/prepare-scoring`, 'POST', {
        expectedRevision: 2,
      });
      const repeated = await ok<ContentPackageDetailDto>(`admin/content/packages/${draft.id}`);
      expect(repeated.contentRevision).toBe(2);
      expect(repeated.items.map((i) => i.questionVersionId)).toEqual(after.map((i) => i.id));
      expect(repeated.items.every((i) => !i.scoringRepairRequired)).toBe(true);
      await legacyVersion(after[0]!.id);
      const reimport = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        {
          sourceNamespace: source.sourceNamespace,
          target: { packageId: draft.id, expectedRevision: 2 },
          questions: rows,
        },
        'admin',
        randomUUID(),
      );
      expect(reimport.items[0]!.questionVersionId).not.toBe(after[0]!.id);
      expect(reimport.items.slice(1).every((i) => i.outcome === 'SKIPPED_UNCHANGED')).toBe(true);
      const repeatImport = await ok<ImportReportDto>(
        'admin/content/imports',
        'POST',
        {
          sourceNamespace: source.sourceNamespace,
          target: { packageId: draft.id, expectedRevision: 3 },
          questions: rows,
        },
        'admin',
        randomUUID(),
      );
      expect(repeatImport.items.every((i) => i.outcome === 'SKIPPED_UNCHANGED')).toBe(true);
      const ready = await ok<ContentPackageDetailDto>(`admin/content/packages/${draft.id}`);
      expect(ready.readiness.canPublish, JSON.stringify(ready.readiness)).toBe(true);
      const historical =
        await owner`SELECT id,score_0_100,pretest_result,scoring_policy_version_id FROM assessment_attempts WHERE assessment_type='PRETEST' ORDER BY id`;
      await ok(`admin/content/packages/${draft.id}/publish`, 'POST', { expectedRevision: 4 });
      const publishedDetail = await ok<ContentPackageDetailDto>(
        `admin/content/packages/${draft.id}`,
      );
      expect(publishedDetail.status).toBe('PUBLISHED');
      expect(
        publishedDetail.items.every((item) => !item.validationIssues?.length),
        JSON.stringify(publishedDetail.items.map((item) => item.validationIssues)),
      ).toBe(true);
      expect(publishedDetail.items.every((item) => item.question !== null)).toBe(true);

      const pretests = new PretestService(app.get(IdentityService));
      const attempt = await pretests.start('Bearer otherStudent', published!.chapter_id);
      const [pinned] =
        await owner`SELECT package_id FROM assessment_attempts WHERE id=${attempt.id}`;
      expect(pinned!.package_id).toBe(draft.id);
      for (const [index, question] of attempt.questions.entries()) {
        if (index === 19) continue;
        await pretests.saveAnswer(
          'Bearer otherStudent',
          attempt.id,
          question.questionInstanceId,
          {
            optionIds:
              index < 10
                ? [template.options[0]!.id]
                : [template.options[0]!.id, template.options[1]!.id],
          },
          0,
        );
      }
      const result = await pretests.submit('Bearer otherStudent', attempt.id);
      const expectedPoints = 10 + (9 * (template.options.length - 1)) / template.options.length;
      expect(result.correctCount).toBe(10);
      expect(result.score).toBeCloseTo(expectedPoints * 5, 2);
      expect(result.initialLevel).toBe(2);
      expect(await pretests.submit('Bearer otherStudent', attempt.id)).toEqual(result);
      const [effects] =
        await owner`SELECT (SELECT count(*)::int FROM xp_ledger WHERE attempt_id=${attempt.id}) AS xp`;
      expect(effects!.xp).toBe(0);
      const preserved =
        await owner`SELECT id,score_0_100,pretest_result,scoring_policy_version_id FROM assessment_attempts WHERE assessment_type='PRETEST' AND id<>${attempt.id} ORDER BY id`;
      expect(preserved).toEqual(historical);
      const old =
        await owner`SELECT scoring_rubric_version_id FROM question_versions WHERE id=${before[0]!.id}`;
      expect(old[0]!.scoring_rubric_version_id).toBeNull();
      expect(
        (
          await request(`admin/content/packages/${published!.id}/prepare-scoring`, 'POST', {
            expectedRevision: 1,
          })
        ).status,
      ).toBe(409);
    });

    it('renames a draft without replacing durable package items or their points and rejects stale writes', async () => {
      const [existing] =
        await owner`SELECT id FROM assessment_packages p WHERE p.assessment_type='TRYOUT' AND p.status='PUBLISHED' AND EXISTS(SELECT 1 FROM package_items i WHERE i.package_id=p.id) LIMIT 1`;
      const original = await ok<ContentPackageDetailDto>(`admin/content/packages/${existing!.id}`);
      const draft = await ok<{ id: string }>('admin/content/packages', 'POST', {
        assessmentType: 'TRYOUT',
        familyCode: `RENAME-${suffix}`,
        packageVersion: 1,
        name: 'TEST ONLY before rename',
        source: original.source,
      });
      const questionVersionIds = original.items.map((item) => item.questionVersionId);
      await ok(`admin/content/packages/${draft.id}`, 'PATCH', {
        expectedRevision: 0,
        name: 'TEST ONLY before rename',
        questionVersionIds,
      });
      await owner`UPDATE package_items SET max_points=2.75 WHERE package_id=${draft.id}`;
      const before =
        await owner`SELECT id,question_version_id,display_order,max_points FROM package_items WHERE package_id=${draft.id} ORDER BY display_order`;
      await ok(`admin/content/packages/${draft.id}`, 'PATCH', {
        expectedRevision: 1,
        name: 'TEST ONLY after rename',
        questionVersionIds,
      });
      const after =
        await owner`SELECT id,question_version_id,display_order,max_points FROM package_items WHERE package_id=${draft.id} ORDER BY display_order`;
      expect(after).toEqual(before);
      expect((await ok<ContentPackageDetailDto>(`admin/content/packages/${draft.id}`)).name).toBe(
        'TEST ONLY after rename',
      );
      expect(
        (
          await request(`admin/content/packages/${draft.id}`, 'PATCH', {
            expectedRevision: 1,
            name: 'TEST ONLY stale',
            questionVersionIds,
          })
        ).status,
      ).toBe(409);
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
    it('runs delegated multi-package Tryout batches atomically without leaking results (TEST ONLY)', async () => {
      // All approvals and academic content below are TEST ONLY, never production acceptance.
      const source = {
        sourceNamespace: `BATCH_${suffix}`,
        sourceName: 'TEST ONLY Curriculum',
        sourceReference: 'TEST ONLY batch fixture',
      };
      const q = samples.find(
        (q) => q.type === 'SINGLE_CHOICE' && !q.metadata.assetManifest?.length,
      )!;
      if (!q.answer || !('optionId' in q.answer))
        throw Error('TEST ONLY single-choice key required');
      const correctOptionId = q.answer.optionId;
      const packageIds: string[] = [];
      let questionIds: string[] = [];
      for (let n = 0; n < 3; n++) {
        const p = await ok<{ id: string }>('admin/content/packages', 'POST', {
          familyCode: `BATCH-${suffix}`,
          packageVersion: n + 1,
          name: `TEST ONLY batch package ${n}`,
          assessmentType: 'TRYOUT',
          source,
        });
        packageIds.push(p.id);
        if (!n) {
          const imported = await ok<ImportReportDto>(
            'admin/content/imports',
            'POST',
            {
              sourceNamespace: source.sourceNamespace,
              target: { packageId: p.id, expectedRevision: 0 },
              questions: Array.from({ length: 30 }, (_, i) => ({
                ...structuredClone(q),
                externalId: `BATCH-Q-${i}`,
                chapterCode: null,
                subchapterCode: null,
                competencyCode: null,
                difficulty: null,
                metadata: {
                  ...q.metadata,
                  sourceLevelNumber: null,
                  sourceOrder: i + 1,
                  assetManifest: [],
                },
              })),
            },
            'admin',
            randomUUID(),
          );
          questionIds = imported.items.map((i) => i.questionVersionId!);
        } else
          await ok(`admin/content/packages/${p.id}`, 'PATCH', {
            name: 'TEST ONLY second package',
            expectedRevision: 0,
            questionVersionIds: questionIds,
          });
        for (const questionVersionId of questionIds)
          await ok(`admin/content/versions/${questionVersionId}/review`, 'POST', {
            packageId: p.id,
            confirmed: true,
            notes: 'TEST ONLY approval',
          });
        await ok(`admin/content/packages/${p.id}/approval`, 'POST', {
          expectedRevision: 1,
          confirmed: true,
          reference: 'TEST ONLY academic approval',
        });
        await ok(`admin/content/packages/${p.id}/publish`, 'POST', { expectedRevision: 1 });
      }
      const schoolA = randomUUID(),
        schoolB = randomUUID(),
        schoolC = randomUUID();
      const classA = randomUUID(),
        classB = randomUUID(),
        classC = randomUUID();
      await owner`INSERT INTO schools(id,code,name) VALUES(${schoolA},${'BA-' + suffix},'TEST School A'),(${schoolB},${'BB-' + suffix},'TEST School B')`;
      await owner`INSERT INTO classes(id,school_id,name,join_code) VALUES(${classA},${schoolA},'TEST IX',${'CA-' + suffix}),(${classB},${schoolB},'TEST IX',${'CB-' + suffix})`;
      await owner`INSERT INTO schools(id,code,name) VALUES(${schoolC},${'BC-' + suffix},'TEST School without delegation')`;
      await owner`INSERT INTO classes(id,school_id,name,join_code) VALUES(${classC},${schoolC},'TEST IX',${'CC-' + suffix})`;
      const [student] = await owner`SELECT id FROM users WHERE display_name='student'`;
      const [unallocated] =
        await owner`SELECT id FROM users WHERE display_name='unallocatedStudent'`;
      await owner`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${classC},${unallocated!.id})`;
      await owner`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${classA},${student!.id}),(${classB},${student!.id})`;
      const makeInput = (name: string): SaveTryoutBatchDto => ({
        title: `TEST ONLY ${name}`,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        closesAt: new Date(Date.now() + 7200000).toISOString(),
        packageIds,
        mandiriPackageId: null,
        schools: [
          { schoolId: schoolA, packageId: packageIds[0]! },
          { schoolId: schoolB, packageId: packageIds[1]! },
        ],
      });
      const sparePackageId = packageIds.pop()!;
      const sparePath = `admin/content/packages/${sparePackageId}`;
      const spare = await ok<ContentPackageDetailDto>(sparePath);
      const spareBatch = await ok<{ id: string }>('admin/tryout-batches', 'POST', {
        ...makeInput('archive race'),
        packageIds: [sparePackageId],
        schools: [],
      });
      const [archive, publish] = await Promise.all([
        request(`${sparePath}/archive`, 'POST', { expectedRevision: spare.contentRevision }),
        request(`admin/tryout-batches/${spareBatch.id}/publish`, 'POST', { expectedRevision: 1 }),
      ]);
      if (publish.ok) {
        expect(archive.status).toBe(409);
        expect(await archive.json()).toMatchObject({ code: 'TRYOUT_PACKAGE_USED_BY_ACTIVE_BATCH' });
        await ok(`admin/tryout-batches/${spareBatch.id}/cancel`, 'POST', {
          expectedRevision: 2,
          reason: 'TEST ONLY archive after cancellation',
        });
        await ok(`${sparePath}/archive`, 'POST', { expectedRevision: spare.contentRevision });
      } else {
        expect(archive.status).toBe(201);
        expect(publish.status).toBe(400);
      }
      expect((await ok<ContentPackageDetailDto>(sparePath)).status).toBe('ARCHIVED');
      for (const role of ['operations', 'unassigned', 'student', 'teacher', ''])
        expect(
          (await request('admin/tryout-batches', 'POST', makeInput('denied'), role)).status,
        ).toBe(role ? 403 : 401);
      const options = await ok<{ schools: { schoolId: string }[] }>(
        'admin/tryout-batches/options?limit=100&search=TEST',
      );
      expect(options.schools.map((s) => s.schoolId)).toContain(schoolA);
      const expired = await ok<{ id: string }>('admin/tryout-batches', 'POST', {
        ...makeInput('expired draft'),
      });
      await owner`UPDATE tryout_batches SET starts_at=now()-interval '2 hours', closes_at=now()-interval '1 hour', cutoff_at=now()-interval '1 hour', result_due_at=now()-interval '1 hour'+interval '72 hours' WHERE id=${expired.id}`;
      expect((await ok<TryoutBatchDto>(`admin/tryout-batches/${expired.id}`)).editable).toBe(true);
      expect(
        (
          await request(`admin/tryout-batches/${expired.id}/publish`, 'POST', {
            expectedRevision: 1,
          })
        ).status,
      ).toBe(400);
      await ok(`admin/tryout-batches/${expired.id}`, 'PATCH', {
        ...makeInput('rescheduled draft'),
        expectedRevision: 1,
      });
      await ok(`admin/tryout-batches/${expired.id}/cancel`, 'POST', {
        expectedRevision: 2,
        reason: 'TEST ONLY draft cleanup',
      });
      const inactive = await ok<{ id: string }>(
        'admin/tryout-batches',
        'POST',
        makeInput('inactive recipient'),
      );
      await owner`UPDATE schools SET status='INACTIVE' WHERE id=${schoolA}`;
      expect(
        (
          await request(`admin/tryout-batches/${inactive.id}/publish`, 'POST', {
            expectedRevision: 1,
          })
        ).status,
      ).toBe(400);
      const unchanged = await ok<TryoutBatchDto>(`admin/tryout-batches/${inactive.id}`);
      expect(unchanged.state).toBe('DRAFT');
      expect(unchanged.revision).toBe(1);
      await owner`UPDATE schools SET status='ACTIVE' WHERE id=${schoolA}`;
      await ok(`admin/tryout-batches/${inactive.id}/cancel`, 'POST', {
        expectedRevision: 1,
        reason: 'TEST ONLY inactive school cleanup',
      });
      const defaults = await ok<{ id: string }>('admin/tryout-batches', 'POST', {
        ...makeInput('default only'),
        schools: [],
      });
      await ok(`admin/tryout-batches/${defaults.id}/publish`, 'POST', { expectedRevision: 1 });
      await ok(`admin/tryout-batches/${defaults.id}/cancel`, 'POST', {
        expectedRevision: 2,
        reason: 'TEST ONLY cleanup',
      });
      const created = await ok<{ id: string }>('admin/tryout-batches', 'POST', makeInput('one'));
      expect((await request('admin/tryout-batches', 'GET', undefined, 'operations')).status).toBe(
        200,
      );
      expect(
        (await request(`admin/tryout-batches/${created.id}`, 'GET', undefined, 'operations'))
          .status,
      ).toBe(200);
      expect(
        (await request('admin/tryout-batches/options', 'GET', undefined, 'operations')).status,
      ).toBe(403);
      for (const [path, method, payload] of [
        [
          `admin/tryout-batches/${created.id}`,
          'PATCH',
          { ...makeInput('forbidden'), expectedRevision: 1 },
        ],
        [`admin/tryout-batches/${created.id}/publish`, 'POST', { expectedRevision: 1 }],
        [
          `admin/tryout-batches/${created.id}/cancel`,
          'POST',
          { expectedRevision: 1, reason: 'TEST ONLY forbidden' },
        ],
      ] as const)
        expect((await request(path, method, payload, 'operations')).status).toBe(403);
      const duplicate = await request('admin/tryout-batches', 'POST', {
        ...makeInput('invalid'),
        schools: [
          { schoolId: schoolA, packageId: packageIds[0] },
          { schoolId: schoolA, packageId: packageIds[1] },
        ],
      });
      expect(duplicate.status).toBe(400);
      expect(
        (
          await request(`admin/tryout-batches/${created.id}`, 'PATCH', {
            ...makeInput('conflict'),
            expectedRevision: 99,
          })
        ).status,
      ).toBe(409);
      const competing = await ok<{ id: string }>('admin/tryout-batches', 'POST', makeInput('two'));
      const races = await Promise.all(
        [created, competing].map((b) =>
          request(`admin/tryout-batches/${b.id}/publish`, 'POST', { expectedRevision: 1 }),
        ),
      );
      expect(races.map((r) => r.status).sort()).toEqual([201, 409]);
      const activeId = races[0]!.ok ? created.id : competing.id;
      async function expectArchiveBlocked(packageId: string) {
        const path = `admin/content/packages/${packageId}`;
        const pack = await ok<ContentPackageDetailDto>(path);
        const response = await request(`${path}/archive`, 'POST', {
          expectedRevision: pack.contentRevision,
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: 'TRYOUT_PACKAGE_USED_BY_ACTIVE_BATCH',
        });
        expect((await ok<ContentPackageDetailDto>(path)).status).toBe('PUBLISHED');
      }
      await expectArchiveBlocked(packageIds[0]!);
      await expectArchiveBlocked(packageIds[1]!);
      const service = app.get(TryoutBatchesService);
      const tryout = app.get(TryoutService);
      expect(
        (
          await ok<{ items: { id: string }[] }>('tryout/batches', 'GET', undefined, 'otherStudent')
        ).items.map((b) => b.id),
      ).not.toContain(activeId);
      await ok(`admin/tryout-batches/${activeId}`, 'PATCH', {
        ...makeInput('Mandiri enabled before start'),
        mandiriPackageId: packageIds[0],
        expectedRevision: 2,
      });
      await expect(tryout.startBatch('Bearer student', activeId, schoolA)).rejects.toThrow();
      // TEST ONLY advance fixture schedule, without waiting an hour. Runtime uses database time.
      await owner`UPDATE tryout_batches SET starts_at=now()-interval '1 minute' WHERE id=${activeId}`;
      await expectArchiveBlocked(packageIds[0]!);
      await expectArchiveBlocked(packageIds[1]!);
      const visible = await service.studentList(student!.id as string);
      expect(visible.routingActive).toBe(true);
      expect(visible.items.find((b) => b.id === activeId)!.schools).toHaveLength(2);
      await expect(tryout.startBatch('Bearer student', activeId)).rejects.toThrow();
      await expect(tryout.startBatch('Bearer student', activeId, randomUUID())).rejects.toThrow();
      await expect(tryout.start('Bearer student', packageIds[0]!)).rejects.toThrow();
      const fallback = await ok<TryoutAttemptDto>(
        `tryout/batches/${activeId}/attempts`,
        'POST',
        {},
        'unallocatedStudent',
      );
      expect(fallback.packageId).toBe(packageIds[0]);
      await owner`UPDATE schools SET status='INACTIVE' WHERE id=${schoolC}`;
      expect(
        (await service.studentList(unallocated!.id as string)).items.find((b) => b.id === activeId)!
          .schools,
      ).toHaveLength(0);
      await owner`UPDATE schools SET status='ACTIVE' WHERE id=${schoolC}`;
      expect(
        (
          await request(
            `tryout/batches/${activeId}/attempts`,
            'POST',
            { schoolId: schoolA, packageId: packageIds[1] },
            'student',
          )
        ).status,
      ).toBe(400);
      const attempts = await Promise.all([
        ok<TryoutAttemptDto>(
          `tryout/batches/${activeId}/attempts`,
          'POST',
          { schoolId: schoolB },
          'student',
        ),
        ok<TryoutAttemptDto>(
          `tryout/batches/${activeId}/attempts`,
          'POST',
          { schoolId: schoolA },
          'student',
        ),
      ]);
      expect(attempts[0].id).toBe(attempts[1].id);
      const [assignment] =
        await owner`SELECT * FROM tryout_student_assignments WHERE batch_id=${activeId} AND student_id=${student!.id}`;
      expect(assignment!.package_id).toBe(
        assignment!.school_id === schoolB ? packageIds[1] : packageIds[0],
      );
      expect(attempts[0].packageId).toBe(assignment!.package_id);
      expect(attempts[0].questions).toHaveLength(30);
      expect(JSON.stringify(attempts[0])).not.toContain('answerKey');
      for (const question of attempts[0].questions)
        await ok(
          `tryout/attempts/${attempts[0].id}/answers/${question.questionInstanceId}`,
          'PATCH',
          { optionId: correctOptionId },
          'student',
        );
      const resumed = await ok<TryoutAttemptDto>(
        `tryout/attempts/${attempts[0].id}`,
        'GET',
        undefined,
        'student',
      );
      expect(resumed.questions.map((question) => question.questionInstanceId)).toEqual(
        attempts[0].questions.map((question) => question.questionInstanceId),
      );
      expect(
        resumed.questions.every((question) => question.selectedOptionId === correctOptionId),
      ).toBe(true);
      expect(
        (await request(`tryout/attempts/${attempts[0].id}`, 'GET', undefined, 'otherStudent'))
          .status,
      ).toBe(404);
      const independent = await ok<TryoutAttemptDto>(
        `tryout/batches/${activeId}/attempts`,
        'POST',
        {},
        'otherStudent',
      );
      const [independentAssignment] =
        await owner`SELECT package_id FROM tryout_student_assignments WHERE attempt_id=${independent.id}`;
      expect(independentAssignment!.package_id).toBe(packageIds[0]);
      const recipients = {
        expectedRevision: 3,
        mandiriPackageId: packageIds[0],
        schools: [
          { schoolId: schoolA, packageId: packageIds[1] },
          { schoolId: schoolB, packageId: packageIds[0] },
          { schoolId: schoolC, packageId: packageIds[1] },
        ],
      };
      expect(
        (
          await request(
            `admin/tryout-batches/${activeId}/delegations`,
            'PATCH',
            recipients,
            'operations',
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request(`admin/tryout-batches/${activeId}/delegations`, 'PATCH', {
            ...recipients,
            schools: [{ schoolId: schoolC, packageId: randomUUID() }],
          })
        ).status,
      ).toBe(400);
      const recipientRace = await Promise.all([
        request(`admin/tryout-batches/${activeId}/delegations`, 'PATCH', recipients),
        request(`admin/tryout-batches/${activeId}/delegations`, 'PATCH', recipients),
      ]);
      expect(recipientRace.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await owner`SELECT id FROM audit_logs WHERE entity_id=${activeId} AND action='tryout_batch_delegations_updated'`,
      ).toHaveLength(1);
      await expect(
        owner`UPDATE tryout_batches SET package_id=${packageIds[1]!} WHERE id=${activeId}`,
      ).rejects.toThrow();
      await expect(
        owner`DELETE FROM tryout_batch_packages WHERE batch_id=${activeId}`,
      ).rejects.toThrow();
      const [late] = await owner`SELECT id FROM users WHERE display_name='lateStudent'`;
      await owner`INSERT INTO class_memberships(class_id,student_user_id) VALUES(${classC},${late!.id})`;
      const lateAttempt = await ok<TryoutAttemptDto>(
        `tryout/batches/${activeId}/attempts`,
        'POST',
        {},
        'lateStudent',
      );
      expect(lateAttempt.packageId).toBe(packageIds[1]);
      expect((await tryout.startBatch('Bearer unallocatedStudent', activeId)).packageId).toBe(
        packageIds[0],
      );
      expect((await tryout.startBatch('Bearer student', activeId)).packageId).toBe(
        attempts[0].packageId,
      );
      expect(
        (await ok<TryoutBatchDto>(`admin/tryout-batches/${activeId}`)).delegationsEditable,
      ).toBe(true);
      await owner`UPDATE class_memberships SET left_at=now(),end_reason='LEFT' WHERE student_user_id=${student!.id}`;
      expect((await tryout.startBatch('Bearer student', activeId)).id).toBe(attempts[0].id);
      expect(
        (
          await request(`admin/tryout-batches/${activeId}`, 'PATCH', {
            ...makeInput('locked'),
            expectedRevision: 2,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(`admin/tryout-batches/${activeId}/cancel`, 'POST', {
            expectedRevision: 2,
            reason: 'TEST ONLY',
          })
        ).status,
      ).toBe(409);
      const submissions = await Promise.all([
        ok<TryoutSubmitDto>(`tryout/attempts/${attempts[0].id}/submit`, 'POST', {}, 'student'),
        ok<TryoutSubmitDto>(`tryout/attempts/${attempts[0].id}/submit`, 'POST', {}, 'student'),
      ]);
      expect(submissions.map((value) => value.xp)).toEqual([300, 300]);
      const ledger = await owner`SELECT * FROM xp_ledger WHERE attempt_id=${attempts[0].id}`;
      expect(ledger).toHaveLength(1);
      await expect(tryout.result('Bearer student', attempts[0].id)).rejects.toThrow();
      const detail = await ok<TryoutBatchDto>(`admin/tryout-batches/${activeId}`);
      expect(detail.resultBlockers).toContain('IRT_DELIVERY_DISABLED');
      expect(detail.participants.reduce((sum, p) => sum + p.assigned, 0)).toBe(4);
      // Distinct recipients may share the same package; a following non-overlapping batch is valid.
      const shared = {
        ...makeInput('shared'),
        mandiriPackageId: packageIds[0],
        packageIds: [packageIds[0]!],
        schools: [
          { schoolId: schoolA, packageId: packageIds[0]! },
          { schoolId: schoolB, packageId: packageIds[0]! },
        ],
        startsAt: detail.closesAt,
        closesAt: new Date(Date.parse(detail.closesAt) + 3600000).toISOString(),
      };
      const next = await ok<{ id: string }>('admin/tryout-batches', 'POST', shared);
      await ok(`admin/tryout-batches/${next.id}/publish`, 'POST', { expectedRevision: 1 });
      const extension = { expectedRevision: 4, closesAt: shared.closesAt };
      const beforeExtension =
        await owner`SELECT id,package_id,deadline_at,status FROM assessment_attempts WHERE tryout_batch_id=${activeId} ORDER BY id`;
      expect(
        (await request(`admin/tryout-batches/${activeId}/extend`, 'POST', extension, 'operations'))
          .status,
      ).toBe(403);
      expect(
        (await request(`admin/tryout-batches/${activeId}/extend`, 'POST', extension)).status,
      ).toBe(409);
      expect((await ok<TryoutBatchDto>(`admin/tryout-batches/${activeId}`)).revision).toBe(4);

      await ok(`admin/tryout-batches/${next.id}/cancel`, 'POST', {
        expectedRevision: 2,
        reason: 'TEST ONLY cancelled schedule',
      });
      const extensionRace = await Promise.all([
        request(`admin/tryout-batches/${activeId}/extend`, 'POST', extension),
        request(`admin/tryout-batches/${activeId}/extend`, 'POST', extension),
      ]);
      expect(extensionRace.map((r) => r.status).sort()).toEqual([201, 409]);
      const extended = await ok<TryoutBatchDto>(`admin/tryout-batches/${activeId}`);
      expect(extended.closesAt).toBe(extension.closesAt);
      expect(extended.resultDueAt).toBe(
        new Date(Date.parse(extension.closesAt) + 72 * 3600000).toISOString(),
      );
      expect(extended.revision).toBe(5);
      expect(extended.extendable).toBe(true);
      const afterExtension =
        await owner`SELECT id,package_id,deadline_at,status FROM assessment_attempts WHERE tryout_batch_id=${activeId} ORDER BY id`;
      expect(afterExtension).toEqual(beforeExtension);
      expect(
        await owner`SELECT id FROM audit_logs WHERE entity_id=${activeId} AND action='tryout_batch_extended'`,
      ).toHaveLength(1);
      expect(
        (
          await request(`admin/tryout-batches/${activeId}/extend`, 'POST', {
            expectedRevision: 5,
            closesAt: detail.closesAt,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(`admin/tryout-batches/${next.id}/extend`, 'POST', {
            expectedRevision: 3,
            closesAt: extension.closesAt,
          })
        ).status,
      ).toBe(409);
      await expect(
        owner`UPDATE tryout_batches SET closes_at=closes_at-interval '1 minute',cutoff_at=closes_at-interval '1 minute',result_due_at=closes_at-interval '1 minute'+interval '72 hours' WHERE id=${activeId}`,
      ).rejects.toThrow();
      const terminal = await ok<{ id: string }>(
        'admin/tryout-batches',
        'POST',
        makeInput('terminal fixture'),
      );
      // TEST ONLY atomically age an unpublished fixture, without waiting or disabling guards.
      await owner`UPDATE tryout_batches SET admin_published_at=now()-interval '3 hours',starts_at=now()-interval '2 hours',closes_at=now()-interval '1 hour',cutoff_at=now()-interval '1 hour',result_due_at=now()-interval '1 hour'+interval '72 hours' WHERE id=${terminal.id}`;
      expect(
        (
          await request(`admin/tryout-batches/${terminal.id}/extend`, 'POST', {
            expectedRevision: 1,
            closesAt: extension.closesAt,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(`admin/tryout-batches/${terminal.id}/delegations`, 'PATCH', {
            expectedRevision: 1,
            schools: [],
          })
        ).status,
      ).toBe(409);
      await expect(
        owner`UPDATE tryout_batches SET closes_at=now()+interval '1 hour',cutoff_at=now()+interval '1 hour',result_due_at=now()+interval '73 hours' WHERE id=${terminal.id}`,
      ).rejects.toThrow();
    }, 120000);
    it('batches import FK layers across the chunk boundary, skips unchanged content and rolls back failures', async () => {
      const namespace = `BATCH_${suffix}`,
        marker = `test_import_batch_${randomUUID().replaceAll('-', '')}`;
      const relations = [
        'questions',
        'question_variants',
        'content_import_identities',
        'question_versions',
        'content_import_versions',
      ];
      await owner.unsafe(`CREATE TABLE ${marker}(relation_name text)`);
      await owner.unsafe(`GRANT INSERT,SELECT ON ${marker} TO numora_main_runtime`);
      await owner.unsafe(
        `CREATE FUNCTION ${marker}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.${marker} VALUES(TG_TABLE_NAME); RETURN NULL; END $$`,
      );
      for (const relation of relations)
        await owner.unsafe(
          `CREATE TRIGGER ${marker} AFTER INSERT ON ${relation} FOR EACH STATEMENT EXECUTE FUNCTION ${marker}()`,
        );
      const input = {
        sourceNamespace: namespace,
        questions: Array.from({ length: 201 }, (_, index) => {
          const q = structuredClone(samples[0]!);
          q.externalId = `TEST_BATCH_${index}`;
          q.metadata.sourceOrder = index + 1;
          return q;
        }),
      };
      try {
        const report = await app.get(ContentImportService).import(actor, randomUUID(), input);
        expect(report.items).toHaveLength(201);
        expect(report.items.every((item) => item.outcome === 'CREATED')).toBe(true);
        expect(new Set(report.items.map((item) => item.questionVersionId)).size).toBe(201);
        const [first] = await owner`SELECT count(*)::integer AS n FROM ${owner(marker)}`;
        const changed = structuredClone(input);
        changed.questions[200]!.stem.text += ' TEST revision';
        const revised = await app.get(ContentImportService).import(actor, randomUUID(), changed);
        expect(revised.items.filter((item) => item.outcome === 'SKIPPED_UNCHANGED')).toHaveLength(
          200,
        );
        expect(revised.items[200]!.outcome).toBe('CREATED_REVISION');
        expect(revised.items.slice(0, 200).map((item) => item.questionVersionId)).toEqual(
          report.items.slice(0, 200).map((item) => item.questionVersionId),
        );
        const [version] =
          await owner`SELECT version_number,revised_from_question_version_id FROM question_versions WHERE id=${revised.items[200]!.questionVersionId!}`;
        expect(version).toMatchObject({
          version_number: 2,
          revised_from_question_version_id: report.items[200]!.questionVersionId,
        });
        const [second] = await owner`SELECT count(*)::integer AS n FROM ${owner(marker)}`;
        console.info(
          JSON.stringify({
            measurement: 'import_write_statements',
            questions: 201,
            freshStatements: first!.n,
            revisionStatements: second!.n - first!.n,
            unchanged: 200,
          }),
        );
        expect(first!.n).toBe(10);
        expect(second!.n - first!.n).toBe(2);
        const sabotage = `${marker}_fail`;
        const before =
          await owner`SELECT (SELECT count(*) FROM questions) AS questions,(SELECT count(*) FROM question_versions) AS versions,(SELECT count(*) FROM content_imports) AS imports`;
        await owner.unsafe(
          `CREATE FUNCTION ${sabotage}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST ONLY final FK layer failure'; END $$`,
        );
        await owner.unsafe(
          `CREATE TRIGGER ${sabotage} BEFORE INSERT ON content_import_versions FOR EACH ROW EXECUTE FUNCTION ${sabotage}()`,
        );
        try {
          await expect(
            app
              .get(ContentImportService)
              .import(actor, randomUUID(), { ...input, sourceNamespace: namespace + '_ROLLBACK' }),
          ).rejects.toThrow();
        } finally {
          await owner.unsafe(`DROP TRIGGER ${sabotage} ON content_import_versions`);
          await owner.unsafe(`DROP FUNCTION ${sabotage}()`);
        }
        expect(
          await owner`SELECT (SELECT count(*) FROM questions) AS questions,(SELECT count(*) FROM question_versions) AS versions,(SELECT count(*) FROM content_imports) AS imports`,
        ).toEqual(before);
      } finally {
        for (const relation of relations)
          await owner.unsafe(`DROP TRIGGER ${marker} ON ${relation}`);
        await owner.unsafe(`DROP FUNCTION ${marker}()`);
        await owner.unsafe(`DROP TABLE ${marker}`);
      }
    }, 120000);
    it('bounds upload list and fresh import database response bytes', async () => {
      const prefix = `TEST BYTES ${suffix}`;
      const question = structuredClone(samples[0]!);
      question.stem = { ...question.stem, text: 'TEST ONLY stem '.repeat(3000) };
      question.explanation = {
        ...question.explanation,
        text: 'TEST ONLY explanation '.repeat(3000),
      };
      const preview = {
        intakeVersion: 1,
        questions: [question],
        selectedIds: ['TEST selected'],
        issues: [],
      };
      const report = {
        items: [{ provenance: 'TEST ONLY large provenance '.repeat(2000) }],
        canImportDraft: true,
      };
      for (let index = 0; index < 20; index++)
        await owner`INSERT INTO content_upload_sessions(actor_user_id,idempotency_key,file_name,file_sha256,byte_length,state,preview,report) VALUES(${actor},${randomUUID()},${prefix + index},'TEST checksum',1,'PREVIEW',${JSON.stringify(preview)}::jsonb,${JSON.stringify(report)}::jsonb)`;
      const list = await measureTransfer(() =>
        app.get(ContentUploadsService).list({ search: prefix, limit: 20, offset: 0 }),
      );
      expect(list.value.total).toBe(20);
      expect(list.value.items).toHaveLength(20);
      expect(
        list.value.items.every(
          (item) => item.questionCount === 1 && item.validationResult === 'Isi valid',
        ),
      ).toBe(true);
      const input = { sourceNamespace: `BYTES_${suffix}`, questions: [question] };
      const imported = await measureTransfer(() =>
        app.get(ContentImportService).import(actor, randomUUID(), input),
      );
      expect(imported.value.items[0]!.outcome).toBe('CREATED');
      const [stored] =
        await owner`SELECT stem,explanation FROM question_versions WHERE id=${imported.value.items[0]!.questionVersionId!}`;
      const digest = (value: unknown) =>
        createHash('sha256').update(JSON.stringify(value)).digest('hex');
      expect(digest(stored!.stem)).toBe(digest({ text: question.stem.text }));
      expect(digest(stored!.explanation)).toBe(digest({ text: question.explanation.text }));
      console.info(
        JSON.stringify({
          measurement: 'content_query_response_bytes',
          uploads: 20,
          questionsImported: 1,
          listResponseBytes: list.responseBytes,
          importResponseBytes: imported.responseBytes,
        }),
      );
      // Generous bounds on deliberately large fixtures, not production performance targets.
      expect(list.responseBytes).toBeLessThan(20000);
      expect(imported.responseBytes).toBeLessThan(20000);
    });
  },
);
