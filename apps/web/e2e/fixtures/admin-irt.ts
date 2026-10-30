import type { Page } from '@playwright/test';
import type {
  IrtBatchHealthDto,
  IrtRequestDto,
  IrtOperationalOptionsDto,
} from '../../src/features/admin/generated-types';
import { id, setup } from './admin';

export async function setupIrt(
  page: Page,
  role: 'SUPER_ADMIN' | 'CONTENT_DATA_MODERATION' | 'OPERATIONS' | null = 'CONTENT_DATA_MODERATION',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const batches: IrtBatchHealthDto[] = Array.from({ length: 7 }, (_, index) => ({
    id: id(100 + index),
    packageId: id(200 + index),
    title: [
      'Tryout Matematika · Pekan 43',
      'Tryout Matematika · Pekan 42',
      'Tryout Matematika · Pekan 41',
      'Tryout Bab Bilangan · Pekan 40',
      'Tryout Geometri · Pekan 39',
      'Tryout Matematika · Pekan 38',
      'Tryout Matematika · Pekan 37',
    ][index]!,
    contextId: id(300 + index),
    status: index === 3 ? 'OPEN' : 'CLOSED',
    closesAt: '2026-10-25T16:59:00Z',
    dueAt: '2026-10-28T16:59:00Z',
    overdue: index === 0,
    activeAttemptCount: index === 3 ? 12 : 0,
    finalizedAttemptCount: 80 + index,
    publishedAt: index === 2 ? '2026-10-28T08:00:00Z' : null,
    publicationMode: index === 2 ? 'IRT' : null,
    publicationVersion: index === 2 ? 1 : null,
    prepareBlockers: index === 3 ? ['BATCH_NOT_CLOSED', 'ATTEMPTS_NOT_FINALIZED'] : [],
    publicationBlockers: index === 2 ? [] : ['RESPONDENT_CONTRACT_NOT_APPROVED'],
  }));
  const requests: IrtRequestDto[] = Array.from({ length: 7 }, (_, index) => ({
    id: id(400 + index),
    packageId: id(200 + index),
    contextId: id(300 + index),
    contractVersion: 3,
    status: index === 0 ? 'FAILED' : index === 2 ? 'COMPLETED' : 'RUNNING',
    inputDigest: 'TEST-input-' + 'a'.repeat(64),
    snapshotId: id(500 + index),
    snapshotDigest: 'TEST-snapshot-' + 'b'.repeat(64),
    rowCount: 2400,
    dispatchGeneration: 1,
    dueAt: '2026-10-28T16:59:00Z',
    overdue: index === 0,
    acceptedExecutionId: index === 2 ? id(600 + index) : null,
    execution: {
      id: id(600 + index),
      status: index === 0 ? 'FAILED' : 'SUCCEEDED',
      attemptNumber: 1,
      leaseExpired: false,
      failureCode: index === 0 ? 'COMPUTE_PROVIDER_UNAVAILABLE' : null,
    },
    failureCode: null,
    configurationPins: [
      { approvalId: id(700), digest: 'TEST-model' },
      { approvalId: id(701), digest: 'TEST-quality' },
    ],
    artifacts:
      index === 0
        ? []
        : [
            {
              id: id(800 + index),
              digest: 'TEST-artifact-' + 'c'.repeat(64),
              scientificDecision: 'PASS',
            },
          ],
  }));
  const options: IrtOperationalOptionsDto = {
    enabled: true,
    configurations: [
      {
        approvalId: id(700),
        code: 'MODEL_TRYOUT',
        version: 3,
        digest: 'TEST-model',
        kind: 'IRT_MODEL',
        contextId: null,
        approvedAt: '2026-10-20T08:00:00Z',
      },
      {
        approvalId: id(701),
        code: 'QUALITY_TRYOUT',
        version: 2,
        digest: 'TEST-quality',
        kind: 'QUALITY_GATE',
        contextId: null,
        approvedAt: '2026-10-20T08:00:00Z',
      },
    ],
  };
  const irt = {
    batches,
    requests,
    options,
    requestsStatus: 200,
    batchesStatus: 200,
    optionsStatus: 200,
    detailStatus: 200,
    mutationStatus: 200,
    posts: [] as { path: string; key: string | undefined; body: unknown }[],
    gets: [] as string[],
  };
  await page.route('**/api/v1/admin/irt/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1/admin/irt/', '');
    if (route.request().method() === 'POST') {
      irt.posts.push({
        path,
        key: route.request().headers()['idempotency-key'],
        body: route.request().postDataJSON(),
      });
      if (irt.mutationStatus !== 200)
        return route.fulfill({
          status: irt.mutationStatus,
          json: { code: 'TEST_MUTATION', detail: 'TEST tindakan belum dapat diselesaikan.' },
        });
      let request = requests.find((item) => item.id === path.split('/')[1]);
      if (path === 'requests') {
        const body = route.request().postDataJSON();
        request = {
          ...requests[0]!,
          id: id(499),
          contextId: body.contextId,
          configurationPins: body.configurationPins,
          status: 'PENDING',
          execution: null,
          failureCode: null,
          artifacts: [],
          overdue: false,
        };
        requests.unshift(request);
      } else if (request && path.endsWith('/retry')) {
        request.status = 'PENDING';
        request.execution = null;
        request.dispatchGeneration++;
      } else if (request && path.endsWith('/adopt')) {
        request.acceptedExecutionId = request.execution!.id;
        request.status = 'COMPLETED';
      }
      return route.fulfill({ json: request });
    }
    irt.gets.push(path + url.search);
    const status =
      path === 'options'
        ? irt.optionsStatus
        : path === 'batch-health'
          ? irt.batchesStatus
          : path === 'requests'
            ? irt.requestsStatus
            : irt.detailStatus;
    if (status !== 200)
      return route.fulfill({
        status,
        json: { code: 'TEST_READER', detail: 'TEST sumber IRT belum dapat dibaca.' },
      });
    if (path === 'options') return route.fulfill({ json: options });
    if (path === 'batch-health' || path === 'requests') {
      const offset = Number(url.searchParams.get('offset') ?? 0),
        limit = Number(url.searchParams.get('limit') ?? 6);
      return route.fulfill({
        json: { items: (path === 'requests' ? requests : batches).slice(offset, offset + limit) },
      });
    }
    return route.fulfill({ json: requests.find((item) => item.id === path.split('/')[1]) });
  });
  return { ...base, irt };
}
