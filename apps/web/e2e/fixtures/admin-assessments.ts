import type { Page } from '@playwright/test';
import type { ContentPackageDetailDto } from '../../src/features/admin/generated-types';
import { id, setup } from './admin';

/** TEST ONLY UI responses. Connected API tests prove runtime eligibility separately. */
export async function setupAssessments(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'CONTENT_DATA_MODERATION',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const packs: ContentPackageDetailDto[] = Array.from({ length: 7 }, (_, index) => ({
    id: id(9000 + index),
    familyCode: `TEST-PRE-${index}`,
    packageVersion: 1,
    name: `Pretest TEST ${index + 1}`,
    assessmentType: 'PRETEST',
    contentRevision: 1,
    status: 'DRAFT',
    isDemo: false,
    source: {
      sourceNamespace: 'TEST_ONLY',
      sourceName: 'TEST ONLY Curriculum',
      sourceReference: 'TEST ONLY fixture',
    },
    chapterId: id(1),
    chapterCode: 'TEST',
    chapterName: 'Bab TEST',
    levelId: null,
    levelNumber: null,
    subchapterCode: null,
    subchapterName: null,
    blueprintVersionId: id(2),
    scoringPolicyVersionId: id(3),
    frozenAt: null,
    releaseAt: null,
    closeAt: null,
    curriculumApproval: null,
    origin: 'IMPORT',
    legacyPreparation: null,
    availability: {
      state: 'DRAFT',
      blockers: ['PACKAGE_NOT_PUBLISHED'],
      checkedAt: '2026-11-09T00:00:00Z',
    },
    readiness: {
      packageId: id(9000 + index),
      contentRevision: 1,
      canSaveDraft: true,
      canPublish: true,
      expectedCount: 20,
      actualCount: 20,
      removedVersionIds: [],
      blockers: [],
      checks: [],
    },
    items: [],
    distribution: [],
  }));
  packs.push({
    ...structuredClone(packs[0]!),
    id: id(9100),
    familyCode: 'TEST-TRYOUT',
    name: 'Tryout TEST',
    assessmentType: 'TRYOUT',
    chapterId: null,
    chapterCode: null,
    chapterName: null,
    curriculumApproval: {
      reference: 'TEST ONLY approved response',
      approvedAt: '2026-11-09T00:00:00Z',
    },
    readiness: {
      ...packs[0]!.readiness,
      packageId: id(9100),
      expectedCount: 30,
      actualCount: 30,
      canPublish: true,
      blockers: [],
      checks: [],
    },
  });
  packs.push({
    ...structuredClone(packs[0]!),
    id: id(9200),
    familyCode: 'TEST-DRILL',
    name: 'Drill TEST',
    assessmentType: 'DRILL',
    levelId: id(3),
    levelNumber: 1,
  });
  await page.route('**/api/v1/admin/content/curriculum', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: id(1),
            kind: 'CHAPTER',
            code: 'TEST',
            name: 'Bab TEST',
            parentId: null,
            status: 'READY',
            displayOrder: 1,
          },
          {
            id: id(2),
            kind: 'SUBCHAPTER',
            code: 'SUBTEST',
            name: 'Subbab TEST',
            parentId: id(1),
            status: 'READY',
            displayOrder: 1,
          },
          {
            id: id(3),
            kind: 'LEVEL',
            code: '1',
            name: 'Level 1',
            parentId: id(2),
            status: 'READY',
            displayOrder: 1,
          },
        ],
      },
    }),
  );
  const fixture = {
    packs,
    calls: [] as { path: string; method: string; body: Record<string, unknown> | null }[],
    status: 200,
  };
  await page.route('**/api/v1/admin/content/packages**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/', ''),
      method = request.method();
    const body = method === 'GET' ? null : (request.postDataJSON() as Record<string, unknown>);
    fixture.calls.push({ path, method, body });
    if (fixture.status !== 200)
      return route.fulfill({
        status: fixture.status,
        json: { code: 'TEST_ONLY_FAILURE', detail: 'TEST ONLY muat ulang diperlukan.' },
      });
    if (path === 'admin/content/packages') {
      if (method === 'POST') {
        const created = {
          ...structuredClone(packs[0]!),
          ...body,
          id: id(9900 + packs.length),
          contentRevision: 0,
          items: [],
          readiness: { ...packs[0]!.readiness, actualCount: 0 },
        } as ContentPackageDetailDto;
        packs.push(created);
        return route.fulfill({ status: 201, json: { id: created.id } });
      }
      let items = packs.filter((p) => p.assessmentType === url.searchParams.get('usageType'));
      if (url.searchParams.get('status'))
        items = items.filter((p) => p.status === url.searchParams.get('status'));
      if (url.searchParams.get('search')) {
        const search = url.searchParams.get('search')!.toLowerCase();
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(search) || p.familyCode.toLowerCase().includes(search),
        );
      }
      if (url.searchParams.get('chapterId'))
        items = items.filter((p) => p.chapterId === url.searchParams.get('chapterId'));
      if (url.searchParams.get('source'))
        items = items.filter((p) =>
          p.source?.sourceName
            .toLowerCase()
            .includes(url.searchParams.get('source')!.toLowerCase()),
        );
      const offset = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 6);
      return route.fulfill({
        json: { items: items.slice(offset, offset + limit), total: items.length },
      });
    }
    const pack = packs.find((p) => path.split('/')[3] === p.id);
    if (!pack) return route.fulfill({ status: 404, json: { detail: 'TEST ONLY package missing' } });
    if (method === 'GET') return route.fulfill({ json: pack });
    if (method === 'PATCH') {
      pack.name = String(body!.name);
      pack.contentRevision++;
    }
    if (path.endsWith('/archive')) {
      pack.status = 'ARCHIVED';
      pack.availability = {
        state: 'ARCHIVED',
        blockers: ['PACKAGE_ARCHIVED'],
        checkedAt: '2026-11-09T00:00:00Z',
      };
    }
    if (path.endsWith('/approval')) {
      pack.curriculumApproval = {
        reference: String(body!.reference),
        approvedAt: '2026-11-09T00:00:00Z',
      };
      pack.readiness.canPublish = true;
      pack.readiness.blockers = [];
      pack.readiness.checks = [];
    }
    if (path.endsWith('/publish')) {
      pack.status = 'PUBLISHED';
      pack.frozenAt = '2026-11-09T00:00:00Z';
      pack.releaseAt = body!.releaseAt ? String(body!.releaseAt) : '2026-11-09T00:00:00Z';
      pack.availability = {
        state: body!.releaseAt ? 'SCHEDULED' : 'AVAILABLE',
        blockers: body!.releaseAt ? ['RELEASE_PENDING'] : [],
        checkedAt: '2026-11-09T00:00:00Z',
      };
    }
    return route.fulfill({ status: 201, json: { id: pack.id } });
  });
  return { ...base, fixture };
}
