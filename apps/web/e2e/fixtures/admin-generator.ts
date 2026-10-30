import type { Page } from '@playwright/test';
import { setup, id } from './admin';
import type {
  GeneratorPackageCatalogDto,
  GeneratorPackageDto,
  GeneratorPackageFileDto,
} from '../../src/features/admin/generated-types';

export function generatorPack(index = 0): GeneratorPackageDto {
  return {
    id: id(8000 + index),
    title:
      [
        'Latihan Bilangan — paket pertama',
        'Pretest Bilangan perlu dilanjutkan',
        'Tryout persiapan sekolah',
      ][index % 3] + (index > 2 ? ` ${index + 1}` : ''),
    assessmentType: (['DRILL', 'PRETEST', 'TRYOUT'] as const)[index % 3]!,
    expectedCount: [10, 20, 30][index % 3]!,
    completedCount: index === 0 ? 4 : index === 1 ? 15 : [10, 20, 30][index % 3]!,
    failedCount: index === 1 ? 5 : 0,
    status:
      index === 0 ? 'GENERATING' : index === 1 ? 'FAILED' : index === 3 ? 'IMPORTED' : 'READY',
    packageId: index === 3 ? id(9000) : null,
    createdAt: '2026-10-30T01:00:00Z',
    requests: [],
  };
}

export async function setupGenerator(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const state = {
    items: Array.from({ length: 7 }, (_, index) => generatorPack(index)),
    catalog: {
      options: [
        {
          assessmentType: 'TRYOUT',
          scopeId: null,
          scopeLabel: 'Semua materi',
          availableCount: 45,
          requiredCount: 30,
          canGenerate: true,
        },
        {
          assessmentType: 'DRILL',
          scopeId: id(8100),
          scopeLabel: 'Bilangan · Operasi bilangan · Level 1',
          availableCount: 18,
          requiredCount: 10,
          canGenerate: true,
        },
        {
          assessmentType: 'PRETEST',
          scopeId: id(8200),
          scopeLabel: 'Bilangan & Operasi',
          availableCount: 12,
          requiredCount: 20,
          canGenerate: false,
        },
      ],
    } as GeneratorPackageCatalogDto,
    requests: [] as { path: string; method: string; key: string | undefined; body: unknown }[],
    failCatalog: false,
    failList: false,
    failMutation: false,
    denied: false,
  };
  await page.route(/\/api\/v1\/admin\/content\/generator\/packages(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(
      '/api/v1/admin/content/generator/packages',
      '',
    );
    state.requests.push({
      path,
      method: request.method(),
      key: request.headers()['idempotency-key'],
      body: request.postData() ? request.postDataJSON() : null,
    });
    if (state.denied)
      return route.fulfill({
        status: 403,
        json: { code: 'FORBIDDEN', detail: 'Akses generator dicabut.' },
      });
    if (
      (path === '/catalog' && state.failCatalog) ||
      (path === '' && request.method() === 'GET' && state.failList) ||
      (request.method() === 'POST' && state.failMutation)
    )
      return route.fulfill({
        status: 503,
        json: { code: 'SERVICE_UNAVAILABLE', detail: 'Layanan sementara tidak tersedia.' },
      });
    if (path === '/catalog') return route.fulfill({ json: state.catalog });
    if (path === '' && request.method() === 'GET')
      return route.fulfill({ json: { items: state.items } });
    if (path === '' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const pack = {
        ...generatorPack(0),
        id: id(8500),
        title: body.title,
        assessmentType: body.assessmentType,
        expectedCount:
          body.assessmentType === 'TRYOUT' ? 30 : body.assessmentType === 'DRILL' ? 10 : 20,
        completedCount: 0,
      };
      state.items.unshift(pack);
      return route.fulfill({ status: 201, json: pack });
    }
    const pack = state.items.find((p) => path === `/${p.id}` || path.startsWith(`/${p.id}/`));
    if (!pack) return route.fulfill({ status: 404, json: { detail: 'Paket tidak ditemukan.' } });
    if (path.endsWith('/retry')) {
      Object.assign(pack, { status: 'GENERATING', failedCount: 0 });
      return route.fulfill({ json: pack });
    }
    if (path.endsWith('/file')) {
      const file: GeneratorPackageFileDto = {
        contractVersion: 'numora-generator-package-v1',
        generatorPackageId: pack.id,
        title: pack.title,
        assessmentType: pack.assessmentType,
        expectedCount: pack.expectedCount,
        items: [
          {
            requestId: id(8600),
            candidateId: id(8601),
            content: {},
            question: {
              externalId: 'TEST-GENERATOR-PGK',
              type: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
              chapterCode: 'TEST',
              subchapterCode: 'TEST',
              competencyCode: 'TEST',
              difficulty: 'EASY',
              stem: { text: 'TEST ONLY — Perhatikan keempat operasi berikut.' },
              options: [
                { id: 'A', content: { text: '$(-25)+3=-22$' } },
                { id: 'B', content: { text: '$60\\div(-6)=6$' } },
                { id: 'C', content: { text: '$8\\times(-2)=-16$' } },
                { id: 'D', content: { text: '$(-12)\\div(-3)=4$' } },
              ],
              answer: { optionIds: ['A', 'C', 'D'] },
              explanation: { text: 'TEST ONLY — pembahasan sintetis, bukan persetujuan akademik.' },
              metadata: {
                sourceLevelNumber: 1,
                sourceSheet: 'TEST',
                sourceRowNumber: 2,
                assetManifest: [],
              },
            },
          },
        ],
      };
      return route.fulfill({ json: file });
    }
    return route.fulfill({ json: pack });
  });
  return { ...base, generator: state };
}
