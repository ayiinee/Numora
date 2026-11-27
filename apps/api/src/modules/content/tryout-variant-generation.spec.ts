import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { TryoutVariantGenerationService } from './tryout-variant-generation.service';
import type { GeneratorService } from './generator.service';

const mocks = vi.hoisted(() => ({ client: vi.fn(), prepare: vi.fn() }));
vi.mock('@tka/database', () => ({ getDatabase: () => ({ client: mocks.client }) }));
vi.mock('@tka/irt-orchestration', () => ({
  prepareGenerationWithin: mocks.prepare,
  generationDetail: vi.fn(),
  saveGenerationDraftWithin: vi.fn(),
}));

const packageId = randomUUID();
const actor = randomUUID();
const versions = Array.from({ length: 30 }, () => randomUUID());
const rows = versions.map((id, index) => ({
  id: packageId,
  name: 'Tryout TEST',
  package_version: 1,
  content_revision: 3,
  status: 'PUBLISHED',
  assessment_type: 'TRYOUT',
  purpose: 'REGULAR',
  is_demo: false,
  display_order: index + 1,
  question_version_id: id,
  external_id: `TEST-${index + 1}`,
  question_kind: 'ORIGINAL',
  usage_type: 'TRYOUT',
  content_status: 'READY',
  validation_state: 'VALID',
}));
const mappings = versions.map((id) => ({
  id: randomUUID(),
  config_id: randomUUID(),
  approved_digest: 'a'.repeat(64),
  label: 'Generator TEST',
  service_contract: 'generator-service-v1',
  mode: 'NUMERIC',
  original_hash: 'b'.repeat(64),
  original_version: 1,
  config_version: 1,
  original_question_version_id: id,
}));
const body = {
  operationKey: 'test-operation',
  expectedRevision: 3,
  anchorQuestionVersionIds: versions.slice(0, 5),
};
let lookups = 0;
let raced = false;
let inserted: unknown[] = [];
let lockedRevision = 3;

beforeEach(() => {
  lookups = 0;
  raced = false;
  inserted = [];
  lockedRevision = 3;
  vi.clearAllMocks();
  mocks.prepare.mockImplementation(async () => randomUUID());
  mocks.client.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('FROM assessment_packages p')) return rows;
    if (sql.includes('FROM configuration_approvals')) return mappings;
    if (sql.includes('WHERE actor_user_id=')) {
      lookups++;
      return raced && lookups === 2
        ? [{ id: randomUUID(), operation_fingerprint: 'different' }]
        : [];
    }
    if (sql.includes('FROM assessment_packages WHERE'))
      return [
        {
          package_version: 1,
          content_revision: lockedRevision,
          status: 'PUBLISHED',
          assessment_type: 'TRYOUT',
          purpose: 'REGULAR',
        },
      ];
    if (sql.includes('INSERT INTO tryout_variant_generation_processes')) inserted = values;
    return [];
  });
  Object.assign(mocks.client, {
    begin: async (callback: (tx: unknown) => Promise<unknown>) => callback(mocks.client),
  });
});
function service() {
  const value = new TryoutVariantGenerationService({
    catalog: async () => ({
      items: mappings.map((row) => ({
        id: row.id,
        originalQuestionVersionId: row.original_question_version_id,
        label: row.label,
      })),
    }),
  } as unknown as GeneratorService);
  vi.spyOn(value, 'detail').mockImplementation(
    async (id) => ({ id }) as Awaited<ReturnType<typeof value.detail>>,
  );
  return value;
}
it('uses approved_digest returned by SQL and pins 25 approved requests without generating anchors', async () => {
  const result = await service().prepare(actor, packageId, body);
  expect(result.id).toBeTruthy();
  expect(mocks.prepare).toHaveBeenCalledTimes(25);
  expect(mocks.prepare.mock.calls.map((call) => call[3])).toEqual(
    mappings.slice(5).map((row) => row.id),
  );
  expect(inserted).toContain(JSON.stringify(Array(25).fill('a'.repeat(64))));
});
it('rejects conflicting operation keys after acquiring transaction lock', async () => {
  raced = true;
  await expect(service().prepare(actor, packageId, body)).rejects.toMatchObject({
    response: { code: 'IDEMPOTENCY_CONFLICT' },
  });
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it('rejects stale source revisions without dispatching generation', async () => {
  lockedRevision = 4;
  await expect(service().prepare(actor, packageId, body)).rejects.toMatchObject({
    response: { code: 'PACKAGE_REVISION_CONFLICT' },
  });
  expect(mocks.prepare).not.toHaveBeenCalled();
});
