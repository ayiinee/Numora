import type { Page } from '@playwright/test';
import { setup, id } from './admin';
import type {
  AdminVersionDto,
  ContentVersionDetailDto,
} from '../../src/features/admin/generated-types';

export async function setupAssessment(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const versions: AdminVersionDto[] = Array.from({ length: 7 }, (_, i) => ({
    id: id(900 + i),
    questionId: id(920 + i),
    primaryCompetencyId: null,
    variantId: id(940 + i),
    variantCode: `LOCAL-${'083125b756f4107d143ade49f3ccd824'.repeat(2)}-${i}`,
    variantKind: 'ORIGINAL',
    originalVariantId: null,
    versionNumber: 1,
    questionType:
      i === 0 ? 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' : i === 1 ? 'CATEGORY' : 'SINGLE_CHOICE',
    stem:
      i === 0
        ? 'Perhatikan operasi bilangan berikut. Pilih semua jawaban yang benar!'
        : i === 1
          ? 'Tentukan kategori setiap pernyataan berikut.'
          : `Soal ${i + 1}: tentukan hasil dari $\\frac{3}{4} + \\frac{1}{2}$.`,
    options:
      i < 2
        ? [
            { id: 'statement-001', text: '$(-25)+3=-22$' },
            { id: 'statement-002', text: '$60\\div(-6)=6$' },
            { id: 'statement-003', text: '$8\\times(-2)=-16$' },
            { id: 'statement-004', text: '$(-12)\\div(-3)=4$' },
          ]
        : ['A', 'B', 'C', 'D'].map((id, n) => ({ id, text: `$\\frac{${n + 3}}{4}$` })),
    answerOptionId: i < 2 ? null : 'C',
    explanation:
      'Pembahasan sintetis untuk menguji keterbacaan, bukan materi Curriculum yang disahkan.',
    difficulty: 'EASY',
    contentStatus: i === 2 ? 'READY' : 'DRAFT',
    questionStatus: 'DRAFT',
    reviewedByUserId: null,
    reviewedAt: null,
    imported: true,
    usageType: i === 1 ? null : 'TRYOUT',
    sourceName: 'Tryout 1 — fixture lokal',
    sourceReference: 'docs/sources/incoming/2026-10-26-tryout-images.bundle-s1/questions.json',
    sourceFileName: 'questions.json',
    sourceNamespace: 'TEST-ONLY',
  }));
  const detail = (v: AdminVersionDto): ContentVersionDetailDto => ({
    id: v.id,
    questionId: v.questionId,
    versionNumber: v.versionNumber,
    status: v.contentStatus,
    sourceNamespace: 'TEST-ONLY',
    revisedFromId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviews: [],
    readiness: {
      canReviewReady: true,
      contentBlockers: [],
      publicationBlockers: ['APPROVED_PGK_RUBRIC_REQUIRED'],
    },
    payload: {
      type: v.questionType === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER' ? 'MCMA' : v.questionType,
      stem: { text: v.stem },
      options: v.options.map((o) => ({ id: o.id, content: { text: o.text } })),
      answer:
        v.questionType === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER'
          ? { optionIds: ['statement-001', 'statement-003', 'statement-004'] }
          : v.questionType === 'CATEGORY'
            ? {
                categoryByStatementId: {
                  'statement-001': 'TRUE',
                  'statement-002': 'FALSE',
                  'statement-003': 'TRUE',
                  'statement-004': 'TRUE',
                },
              }
            : { optionId: 'C' },
      explanation: { text: v.explanation },
      difficulty: 'EASY',
      metadata: {
        categories: [
          { id: 'TRUE', label: 'Benar' },
          { id: 'FALSE', label: 'Salah' },
        ],
      },
    },
  });
  const state = {
    versions,
    failStatus: 0,
    failReview: 0,
    calls: [] as { path: string; query: string; method: string; body: unknown }[],
  };
  await page.route('**/api/v1/admin/content/versions**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/', '');
    state.calls.push({
      path,
      query: url.search,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
    });
    if (state.failStatus)
      return route.fulfill({
        status: state.failStatus,
        json: { detail: 'Data konten sementara tidak tersedia.' },
      });
    const version = versions.find(
      (v) =>
        path === `admin/content/versions/${v.id}` ||
        path === `admin/content/versions/${v.id}/review`,
    );
    if (version) {
      if (request.method() === 'POST') {
        if (state.failReview)
          return route.fulfill({
            status: state.failReview,
            json: { detail: 'Keputusan belum tersimpan.' },
          });
        version.contentStatus = request.postDataJSON().status;
        return route.fulfill({ json: { id: version.id } });
      }
      return route.fulfill({ json: detail(version) });
    }
    const params = url.searchParams;
    const items = versions.filter(
      (v) =>
        (!params.get('status') || v.contentStatus === params.get('status')) &&
        (!params.get('usageType') ||
          (params.get('usageType') === 'UNCLASSIFIED'
            ? !v.usageType
            : v.usageType === params.get('usageType'))) &&
        (!params.get('source') || v.sourceName?.includes(params.get('source')!)),
    );
    const offset = Number(params.get('offset') ?? 0);
    return route.fulfill({
      json: {
        items: items.slice(offset, offset + 5),
        nextOffset: items.length > offset + 5 ? offset + 5 : null,
      },
    });
  });
  return { ...base, assessment: state };
}
