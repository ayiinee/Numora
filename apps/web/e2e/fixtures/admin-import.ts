import type { Page } from '@playwright/test';
import { setupGenerator } from './admin-generator';
import { id } from './admin';
import type {
  ContentPackageDetailDto,
  IntakeQuestionDto,
  UploadDetailDto,
} from '../../src/features/admin/generated-types';

export function importQuestion(index = 0, mixed = true): IntakeQuestionDto {
  const type = mixed
    ? (['MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY', 'SINGLE_CHOICE'] as const)[index % 3]!
    : 'SINGLE_CHOICE';
  return {
    externalId: `TEST-IMPORT-${index + 1}`,
    type,
    difficulty: 'EASY',
    chapterCode: null,
    subchapterCode: null,
    competencyCode: null,
    stem: { text: `TEST ONLY — Soal ${index + 1}. Perhatikan operasi $(-25)+3$.` },
    options: [
      { id: 'A', content: { text: '$(-25)+3=-22$' } },
      { id: 'B', content: { text: '$60\\div(-6)=6$' } },
      { id: 'C', content: { text: '$8\\times(-2)=-16$' } },
      { id: 'D', content: { text: '$(-12)\\div(-3)=4$' } },
    ],
    answer:
      type === 'SINGLE_CHOICE'
        ? { optionId: 'A' }
        : type === 'CATEGORY'
          ? { categoryByStatementId: { A: 'TRUE', B: 'FALSE', C: 'TRUE', D: 'TRUE' } }
          : { optionIds: ['A', 'C', 'D'] },
    explanation: {
      text: 'TEST ONLY — contoh sintetis untuk menguji keterbacaan, bukan persetujuan Curriculum.',
    },
    metadata: {
      sourceLevelNumber: null,
      sourceSheet: 'TEST',
      sourceRowNumber: index + 2,
      assetManifest: [],
      categories: [
        { id: 'TRUE', label: 'Benar' },
        { id: 'FALSE', label: 'Salah' },
      ],
    },
  };
}
export function importPackage(mixed = true): ContentPackageDetailDto {
  const packageId = id(8900);
  return {
    id: packageId,
    familyCode: 'TEST-IMPORT',
    packageVersion: 1,
    name: 'Tryout TEST ONLY',
    assessmentType: 'TRYOUT',
    contentRevision: 0,
    status: 'DRAFT',
    isDemo: true,
    source: null,
    chapterId: null,
    levelId: null,
    chapterCode: null,
    chapterName: null,
    subchapterCode: null,
    subchapterName: null,
    levelNumber: null,
    items: Array.from({ length: 30 }, (_, n) => ({
      questionVersionId: id(9000 + n),
      questionId: id(9100 + n),
      displayOrder: n + 1,
      usageType: 'TRYOUT',
      contentStatus: 'DRAFT',
      reviewedAt: null,
      reviewedByUserId: null,
      question: importQuestion(n, mixed),
    })),
    readiness: {
      packageId,
      contentRevision: 0,
      canSaveDraft: true,
      canPublish: !mixed,
      expectedCount: 30,
      actualCount: 30,
      blockers: mixed ? ['PGK_PUBLICATION_RESTRICTED'] : [],
      removedVersionIds: [],
      checks: [
        { code: 'CONTENT', passed: true, detail: 'TEST ONLY — konten lengkap' },
        {
          code: 'SCORING',
          passed: !mixed,
          detail: mixed ? 'TEST ONLY — PGK menunggu rubrik' : 'TEST ONLY — format PG lengkap',
        },
      ],
    },
    distribution: [],
  };
}
export function importUpload(index = 0, mixed = true): UploadDetailDto {
  const questions = Array.from({ length: 30 }, (_, n) => importQuestion(n, mixed));
  return {
    id: id(8700 + index),
    fileName: `TEST-IMPORT-${index + 1}.xlsx`,
    createdAt: '2026-10-30T07:00:00Z',
    actorName: 'Admin TEST',
    revision: 0,
    state: 'PREVIEW',
    status: 'PREVIEW',
    questionCount: 30,
    title: null,
    assessmentType: null,
    packageId: null,
    error: null,
    package: null,
    destination: null,
    selectedIds: questions.map((q) => q.externalId),
    excel: {
      envelope: { intakeVersion: 1, sourceNamespace: 'TEST-UI03', questions },
      mappingIssues: [],
      media: [],
      issues: [],
      report: null,
    },
  };
}
export async function setupImports(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'SUPER_ADMIN',
  mixed = true,
) {
  const base = await setupGenerator(page, role);
  const state = {
    uploads: Array.from({ length: 7 }, (_, n) => importUpload(n, mixed)),
    pack: importPackage(mixed),
    calls: [] as { method: string; path: string; key: string | undefined; body: unknown }[],
    failHistory: false,
    failDetail: false,
    failDraft: false,
    failPreview: false,
    deny: 0,
  };
  await page.route(/\/api\/v1\/admin\/content\/(?:uploads|packages)(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace('/api/v1/admin/content/', '');
    const body =
      request.headers()['content-type']?.includes('application/json') && request.postData()
        ? request.postDataJSON()
        : null;
    state.calls.push({
      method,
      path: url.pathname + url.search,
      key: request.headers()['idempotency-key'],
      body,
    });
    if (state.deny)
      return route.fulfill({
        status: state.deny,
        json: { code: 'FORBIDDEN', detail: 'Akses impor dicabut.' },
      });
    if (path === 'uploads' && method === 'GET') {
      if (state.failHistory)
        return route.fulfill({ status: 503, json: { detail: 'Riwayat belum tersedia.' } });
      const query = url.searchParams;
      let rows = state.uploads;
      if (query.get('search'))
        rows = rows.filter((item) =>
          (item.fileName + ' ' + item.title)
            .toLowerCase()
            .includes(query.get('search')!.toLowerCase()),
        );
      if (query.get('status')) rows = rows.filter((item) => item.status === query.get('status'));
      if (query.get('assessmentType'))
        rows = rows.filter((item) => item.assessmentType === query.get('assessmentType'));
      const offset = Number(query.get('offset') ?? 0),
        limit = Number(query.get('limit') ?? 5);
      return route.fulfill({
        json: { items: rows.slice(offset, offset + limit), total: rows.length },
      });
    }
    if (path === 'uploads' && method === 'POST')
      return route.fulfill({ status: 201, json: state.uploads[0] });
    const upload = state.uploads.find(
      (item) => path === `uploads/${item.id}` || path.startsWith(`uploads/${item.id}/`),
    );
    if (upload) {
      if (method === 'GET')
        return state.failDetail
          ? route.fulfill({ status: 503, json: { detail: 'Sesi unggahan belum tersedia.' } })
          : route.fulfill({ json: upload });
      if (path.endsWith('/preview')) {
        if (state.failPreview)
          return route.fulfill({
            status: 409,
            json: {
              code: 'REVISION_CONFLICT',
              detail: 'Revisi telah berubah. Perubahan lokal belum disimpan.',
            },
          });
        Object.assign(upload, {
          revision: upload.revision + 1,
          destination: body.destination,
          selectedIds: body.selectedIds,
          state: 'VALIDATED',
          status: 'VALIDATED',
          title: body.destination.title,
          assessmentType: body.destination.assessmentType,
        });
        upload.excel!.envelope.questions = body.questions;
        return route.fulfill({ json: upload });
      }
      if (path.endsWith('/draft')) {
        if (state.failDraft)
          return route.fulfill({
            status: 503,
            json: { detail: 'Penyimpanan draft belum tersedia.' },
          });
        Object.assign(upload, {
          packageId: state.pack.id,
          package: state.pack,
          status: 'DRAFT',
          state: 'DRAFT_SAVED',
        });
        return route.fulfill({ json: upload });
      }
    }
    if (path.startsWith(`packages/${state.pack.id}`)) {
      if (path.endsWith('/publish')) {
        state.pack.status = 'PUBLISHED';
        state.uploads[0]!.status = 'PUBLISHED';
      }
      if (path.endsWith('/archive')) state.pack.status = 'ARCHIVED';
      return route.fulfill({ json: state.pack });
    }
    return route.fallback();
  });
  return { ...base, imports: state };
}
