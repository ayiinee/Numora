import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContentPackageWorkspace } from './content-package-workspace';
import {
  getContentPackage,
  listContentPackages,
  preparePretestScoring,
} from './content-package-api';
import { createPreview, submitPreview } from './content-preview-api';
import type { ContentPackageDetailDto, PreviewSessionDto } from './generated-types';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});

vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return {
    useRouter: () => router,
    usePathname: () => '/admin/content/imports',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(async () => ({ items: [] })) }));
vi.mock('./content-package-api', () => ({
  getContentPackage: vi.fn(),
  listContentPackages: vi.fn(),
  createContentPackage: vi.fn(),
  updateContentPackage: vi.fn(),
  reviewImportedQuestion: vi.fn(),
  preparePretestScoring: vi.fn(),
}));
vi.mock('./content-preview-api', () => ({ createPreview: vi.fn(), submitPreview: vi.fn() }));
afterEach(() => {
  cleanup();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
it('allows a valid Pretest draft to publish without manual review or approval inputs', async () => {
  const pack = {
    id: 'pretest-test',
    name: 'Pretest valid',
    familyCode: 'TEST',
    packageVersion: 1,
    contentRevision: 1,
    assessmentType: 'PRETEST',
    status: 'DRAFT',
    isDemo: true,
    source: { sourceNamespace: 'TEST', sourceName: 'TEST', sourceReference: 'TEST' },
    chapterId: null,
    levelId: null,
    chapterCode: null,
    chapterName: null,
    subchapterCode: null,
    subchapterName: null,
    levelNumber: null,
    items: [],
    distribution: [],
    readiness: {
      packageId: 'pretest-test',
      contentRevision: 1,
      canSaveDraft: true,
      canPublish: true,
      actualCount: 20,
      expectedCount: 20,
      checks: [],
      blockers: [],
      removedVersionIds: [],
    },
  } as ContentPackageDetailDto;
  vi.mocked(getContentPackage).mockResolvedValue(pack);
  render(
    <ContentPackageWorkspace
      token="TEST"
      disabled={false}
      onSelect={vi.fn()}
      refreshKey={0}
      mode="detail"
      packageId={pack.id}
      initialUsage="PRETEST"
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Penerbitan' }));
  expect(screen.queryByText('Bukti persetujuan tim kurikulum')).toBeNull();
  expect(screen.queryByText('Tinjau semua soal valid')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Publikasikan paket' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(screen.getByText(/Yakin ingin menerbitkan paket/)).toBeTruthy();
  cleanup();
  vi.mocked(getContentPackage).mockResolvedValue({
    ...pack,
    items: [
      {
        questionVersionId: 'broken-version',
        questionId: 'broken-question',
        displayOrder: 7,
        usageType: 'PRETEST',
        contentStatus: 'DRAFT',
        reviewedAt: null,
        reviewedByUserId: null,
        question: null,
        validationIssues: ['Aturan penilaian belum terhubung.'],
      },
    ],
    readiness: {
      ...pack.readiness,
      canPublish: false,
      checks: [{ code: 'COUNT', passed: false, detail: '19/20 soal.' }],
    },
  });
  render(
    <ContentPackageWorkspace
      token="TEST"
      disabled={false}
      onSelect={vi.fn()}
      refreshKey={0}
      mode="detail"
      packageId={pack.id}
      initialUsage="PRETEST"
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Penerbitan' }));
  expect(screen.getAllByText('19/20 soal.').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Validasi ulang' })).toBeTruthy();
  expect(screen.getAllByText('Aturan penilaian belum terhubung.').length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /^Perbaiki$/ })[0]!.getAttribute('href')).toBe(
    '/admin/content/versions/broken-version?package=pretest-test',
  );
  expect(screen.getAllByRole('link', { name: /^Perbaiki$/ })[1]!.getAttribute('href')).toBe(
    '/admin/content/versions/broken-version?package=pretest-test',
  );
  expect(screen.queryByRole('button', { name: 'Publikasikan paket' })).toBeNull();
});
it('loads package choices five at a time and disables next on the final full page', async () => {
  const pack = {
    id: 'TEST',
    familyCode: 'TEST',
    packageVersion: 1,
    name: 'TEST',
    assessmentType: 'DRILL' as const,
    contentRevision: 1,
    status: 'DRAFT' as const,
    isDemo: true,
    source: { sourceNamespace: 'TEST', sourceName: 'TEST', sourceReference: 'TEST' },
    chapterId: null,
    levelId: null,
    chapterCode: null,
    chapterName: null,
    subchapterCode: null,
    subchapterName: null,
    levelNumber: null,
  };
  vi.mocked(listContentPackages)
    .mockResolvedValueOnce({
      total: 10,
      items: Array.from({ length: 6 }, (_, i) => ({
        ...pack,
        id: `TEST-${i}`,
        name: `Paket TEST ${i}`,
      })),
    })
    .mockResolvedValueOnce({
      total: 10,
      items: Array.from({ length: 5 }, (_, i) => ({
        ...pack,
        id: `TEST-${i + 5}`,
        name: `Paket TEST ${i + 5}`,
      })),
    });
  render(
    <ContentPackageWorkspace token="TEST" disabled={false} onSelect={vi.fn()} refreshKey={0} />,
  );
  await screen.findByLabelText('Paket tujuan');
  expect(screen.queryByRole('option', { name: /Paket TEST 5/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Paket berikutnya' }));
  await waitFor(() =>
    expect(listContentPackages).toHaveBeenLastCalledWith(
      'TEST',
      'usageType=DRILL&status=DRAFT&limit=6&offset=5',
    ),
  );
  await screen.findByRole('option', { name: /Paket TEST 5/ });
  expect(
    (screen.getByRole('button', { name: 'Paket berikutnya' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
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
  vi.mocked(listContentPackages).mockResolvedValue({ items: [pack], total: 1 });
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
      mode="detail"
      packageId={id}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /^Tinjau$/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tampilkan gambar soal' }));
  expect(await screen.findByAltText('Diagram pembahasan')).toBeTruthy();
  expect(screen.getByAltText('Diagram soal')).toBeTruthy();
  expect(submitPreview).toHaveBeenCalledWith('TEST ONLY', id, expect.any(String));
  expect(pack.items[0]!.reviewedAt).toBeNull();
  expect(pack.readiness.canPublish).toBe(false);
});

it('prepares scoring with revision, shows progress and refreshes validation', async () => {
  const pack = {
    id: 'scoring-package',
    name: 'TEST scoring',
    familyCode: 'TEST',
    packageVersion: 1,
    contentRevision: 7,
    assessmentType: 'PRETEST',
    status: 'DRAFT',
    isDemo: true,
    source: { sourceNamespace: 'TEST', sourceName: 'TEST', sourceReference: 'TEST' },
    items: [
      {
        questionVersionId: 'old',
        questionId: 'q',
        displayOrder: 1,
        question: null,
        usageType: 'PRETEST',
        contentStatus: 'DRAFT',
        reviewedAt: null,
        reviewedByUserId: null,
        scoringRepairRequired: true,
        validationIssues: ['Aturan penilaian belum sesuai.'],
      },
    ],
    distribution: [],
    readiness: { actualCount: 20, expectedCount: 20, checks: [], blockers: [], canPublish: false },
  } as unknown as ContentPackageDetailDto;
  vi.mocked(getContentPackage).mockResolvedValue(pack);
  let finish!: () => void;
  vi.mocked(preparePretestScoring).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ id: pack.id });
      }),
  );
  render(
    <ContentPackageWorkspace
      token="TEST"
      disabled={false}
      onSelect={vi.fn()}
      refreshKey={0}
      mode="detail"
      packageId={pack.id}
      initialUsage="PRETEST"
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Siapkan penilaian otomatis' }));
  expect(preparePretestScoring).toHaveBeenLastCalledWith('TEST', pack.id, 7);
  expect(screen.getByText(/Memproses paket/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Perbaiki' })).toBeNull();
  vi.mocked(getContentPackage).mockResolvedValue({ ...pack, contentRevision: 8, items: [] });
  finish();
  await screen.findByText(/Penilaian otomatis siap/);
  expect(screen.queryByText(/Memproses paket/)).toBeNull();
  expect(screen.queryByText('Aturan penilaian belum sesuai.')).toBeNull();
});
