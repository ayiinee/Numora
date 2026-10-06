import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContentPackageWorkspace } from './content-package-workspace';
import { getContentPackage, listContentPackages } from './content-package-api';
import { createPreview, submitPreview } from './content-preview-api';
import type { ContentPackageDetailDto, PreviewSessionDto } from './generated-types';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(async () => ({ items: [] })) }));
vi.mock('./content-package-api', () => ({
  getContentPackage: vi.fn(),
  listContentPackages: vi.fn(),
  createContentPackage: vi.fn(),
  updateContentPackage: vi.fn(),
  reviewImportedQuestion: vi.fn(),
}));
vi.mock('./content-preview-api', () => ({ createPreview: vi.fn(), submitPreview: vi.fn() }));
afterEach(cleanup);
it('uses unscored REVIEW media so imported explanation pictures are visible to the reviewer', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const assets = ['stem', 'explanation'].map((assetId, index) => ({
    externalId: 'TEST',
    assetId,
    textMarker: `[[asset:${assetId}]]`,
    placement: index ? ('EXPLANATION' as const) : ('STEM' as const),
    itemId: null,
    assetOrder: 1,
    altText: index ? 'Diagram pembahasan' : 'Diagram soal',
    objectKey: `TEST/${assetId}`,
    sha256: 'a'.repeat(64),
    contentType: 'image/png',
    byteLength: 3,
    bucket: 'TEST',
  }));
  const media = assets.map((a) => ({
    instanceId: id,
    assetId: a.assetId,
    altText: a.altText,
    url: `https://example.invalid/${a.assetId}.png`,
    expiresAt: '2099-01-01T00:00:00Z',
  }));
  const pack: ContentPackageDetailDto = {
    id,
    familyCode: 'TEST',
    packageVersion: 1,
    name: 'TEST ONLY',
    assessmentType: 'DRILL',
    contentRevision: 1,
    status: 'DRAFT',
    isDemo: true,
    source: { sourceNamespace: 'TEST', sourceName: 'TEST ONLY', sourceReference: 'TEST ONLY' },
    chapterId: null,
    levelId: null,
    chapterCode: null,
    chapterName: null,
    subchapterCode: null,
    subchapterName: null,
    levelNumber: null,
    distribution: [],
    readiness: {
      packageId: id,
      contentRevision: 1,
      canSaveDraft: true,
      canPublish: false,
      expectedCount: 10,
      actualCount: 1,
      blockers: ['PUBLICATION'],
      removedVersionIds: [],
      checks: [],
    },
    items: [
      {
        questionVersionId: id,
        questionId: id,
        displayOrder: 1,
        usageType: 'DRILL',
        contentStatus: 'DRAFT',
        reviewedAt: null,
        reviewedByUserId: null,
        question: {
          externalId: 'TEST',
          type: 'SINGLE_CHOICE',
          chapterCode: 'TEST',
          subchapterCode: 'TEST',
          competencyCode: 'TEST',
          difficulty: null,
          stem: { text: 'TEST [[asset:stem]]' },
          options: [
            { id: 'A', content: { text: '2' } },
            { id: 'B', content: { text: '3' } },
          ],
          answer: { optionId: 'A' },
          explanation: { text: 'TEST [[asset:explanation]]' },
          metadata: {
            sourceLevelNumber: 1,
            sourceSheet: 'PG',
            sourceRowNumber: 2,
            assetManifest: assets,
          },
        },
      },
    ],
  };
  vi.mocked(listContentPackages).mockResolvedValue({ items: [pack] });
  vi.mocked(getContentPackage).mockResolvedValue(pack);
  const preview: PreviewSessionDto = {
    id,
    state: 'IN_PROGRESS',
    scoringStatus: 'NOT_SCORED',
    score: null,
    items: [],
    media: [media[0]!],
  };
  vi.mocked(createPreview).mockResolvedValue(preview);
  vi.mocked(submitPreview).mockResolvedValue({ ...preview, state: 'SUBMITTED', media });
  render(
    <ContentPackageWorkspace
      token="TEST ONLY"
      disabled={false}
      onSelect={vi.fn()}
      refreshKey={0}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Paket tujuan'), { target: { value: id } });
  fireEvent.click(await screen.findByRole('button', { name: 'Muat gambar untuk review' }));
  expect(await screen.findByAltText('Diagram pembahasan')).toBeTruthy();
  expect(screen.getByAltText('Diagram soal')).toBeTruthy();
  expect(submitPreview).toHaveBeenCalledWith('TEST ONLY', id, expect.any(String));
  expect(pack.items[0]!.reviewedAt).toBeNull();
  expect(pack.readiness.canPublish).toBe(false);
});
