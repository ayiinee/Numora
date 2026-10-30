import type { Page } from '@playwright/test';
import { setup, id } from './admin';
import type {
  PretestDto,
  AdminVersionDto,
  PretestBlueprintDto,
} from '../../src/features/admin/generated-types';

export async function setupPretest(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const questions: AdminVersionDto[] = Array.from({ length: 25 }, (_, i) => ({
    id: id(3000 + i),
    questionId: id(3100 + i),
    primaryCompetencyId: null,
    variantId: id(3200 + i),
    variantCode: `SOURCE-${'a52b9db762ad57'.repeat(3)}-${i}`,
    variantKind: 'ORIGINAL',
    originalVariantId: null,
    versionNumber: 1,
    questionType: i % 3 === 0 ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' : 'SINGLE_CHOICE',
    stem:
      i === 0
        ? 'Tentukan hasil dari $\\frac{3}{4}+\\frac{1}{2}$.'
        : `Pertanyaan fixture ${i + 1}: perhatikan operasi bilangan berikut.`,
    options: [
      { id: 'A', text: '$\\frac{5}{4}$' },
      { id: 'B', text: '$\\frac{1}{4}$' },
    ],
    answerOptionId: 'A',
    explanation: 'Pembahasan sintetis.',
    difficulty: 'EASY',
    contentStatus: 'READY',
    questionStatus: 'READY',
    reviewedAt: null,
    reviewedByUserId: null,
    usageType: 'PRETEST',
    imported: true,
  }));
  const packs: PretestDto[] = Array.from({ length: 7 }, (_, i) => ({
    id: id(4000 + i),
    familyCode: `PRETEST-TEST-${i + 1}`,
    packageVersion: i + 1,
    name:
      i === 0
        ? 'Pretest Bilangan'
        : i === 1
          ? 'Pretest Bilangan — hasil review'
          : i === 4
            ? 'Paket Dengan Nama Panjang Untuk Pemeriksaan Keterbacaan Pada Layar Kecil'
            : `Pretest Fixture ${i + 1}`,
    chapterId: id(5000),
    blueprintVersionId: i === 1 ? id(5100) : null,
    state: i === 1 ? 'REVIEWED' : i === 2 ? 'ARCHIVED' : 'DRAFT',
    manifestDigest: i === 1 ? 'TEST-MANIFEST' : null,
    questionVersionIds: questions.slice(0, i === 0 ? 2 : 20).map((q) => q.id),
    reviewBlockers: i === 0 ? ['ASSESSMENT_PACKAGE_INCOMPLETE'] : [],
    publicationBlockers: [
      'PRETEST_STUDENT_CONSUMER_REQUIRED',
      ...(i !== 1 ? ['APPROVED_PRETEST_BLUEPRINT_REQUIRED'] : []),
    ],
  }));
  const blueprints: PretestBlueprintDto[] = [
    {
      id: id(5100),
      code: 'PRETEST-FIXTURE',
      version: 2,
      approvalReference: 'TEST-CURRICULUM-ONLY',
      approvedAt: '2026-10-01T00:00:00Z',
    },
  ];
  const chapters = [
    {
      id: id(5000),
      kind: 'CHAPTER',
      name: 'Bilangan & Operasi',
      code: 'TEST-NUM',
      parentId: null,
      displayOrder: 1,
      status: 'READY',
    },
    {
      id: id(5001),
      kind: 'CHAPTER',
      name: 'Aljabar & Fungsi',
      code: 'TEST-ALG',
      parentId: null,
      displayOrder: 2,
      status: 'READY',
    },
  ];
  const state = {
    packs,
    questions,
    blueprints,
    chapters,
    calls: [] as { path: string; query: string; method: string; body: unknown }[],
    failPath: '',
    failStatus: 503,
    failMutation: 0,
  };
  await page.route('**/api/v1/admin/content/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/v1/', '');
    state.calls.push({
      path,
      query: url.search,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
    });
    if (state.failPath && path === state.failPath)
      return route.fulfill({
        status: state.failStatus,
        json: { detail: 'Data fixture sementara tidak tersedia.' },
      });
    if (request.method() !== 'GET') {
      if (state.failMutation)
        return route.fulfill({
          status: state.failMutation,
          json: { detail: 'Perubahan fixture belum tersimpan.' },
        });
      const p = packs.find((p) => path.includes(p.id));
      const body = request.postData() ? request.postDataJSON() : {};
      if (path.endsWith('/review') && p) {
        p.state = 'REVIEWED';
        p.manifestDigest = 'TEST-DIGEST';
      } else if (path.endsWith('/archive') && p) p.state = 'ARCHIVED';
      else if (request.method() === 'PUT' && p) Object.assign(p, body);
      else if (path.endsWith('/revisions') && p)
        packs.push({
          ...p,
          ...body,
          id: id(4900),
          state: 'DRAFT',
          packageVersion: p.packageVersion + 1,
        });
      else packs.unshift({ ...packs[0]!, ...body, id: id(4901), state: 'DRAFT' });
      return route.fulfill({ json: { id: p?.id ?? id(4901) } });
    }
    if (path.endsWith('/blueprints')) return route.fulfill({ json: { items: blueprints } });
    if (path.endsWith('/curriculum')) return route.fulfill({ json: { items: chapters } });
    if (path === 'admin/content/pretest-packages') {
      const offset = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 6);
      return route.fulfill({ json: { items: packs.slice(offset, offset + limit) } });
    }
    const pack = packs.find((p) => path === `admin/content/pretest-packages/${p.id}`);
    if (pack) return route.fulfill({ json: pack });
    if (path === 'admin/content/versions') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const items =
        url.searchParams.get('chapterId') === id(5001) ? questions.slice(24) : questions;
      return route.fulfill({
        json: {
          items: items.slice(offset, offset + 5),
          nextOffset: offset + 5 < items.length ? offset + 5 : null,
        },
      });
    }
    const question = questions.find((q) => path === `admin/content/versions/${q.id}`);
    if (question)
      return route.fulfill({
        json: {
          id: question.id,
          questionId: question.questionId,
          versionNumber: question.versionNumber,
          status: question.contentStatus,
          sourceNamespace: 'TEST',
          revisedFromId: null,
          reviewedByUserId: null,
          reviewedAt: null,
          reviews: [],
          payload: {
            type: question.questionType,
            stem: { text: question.stem },
            options: question.options.map((o) => ({ id: o.id, content: { text: o.text } })),
          },
          readiness: { canReviewReady: true, contentBlockers: [], publicationBlockers: [] },
        },
      });
    return route.fulfill({ status: 404, json: { detail: 'Fixture tidak ditemukan.' } });
  });
  return { ...base, pretest: state };
}
