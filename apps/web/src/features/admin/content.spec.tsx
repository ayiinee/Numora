import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiRequest, ApiProblem } from '@/lib/api';
import { AdminContentScreen } from './content';
import {
  createQuestion,
  createDrillPackage,
  updateDrillPackage,
  archiveDrillPackage,
  loadAdminWorkbench,
  publishDrillPackage,
  resolveReport,
  updateTryoutDraft,
  createTryoutDraft,
} from './content-api';

vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  apiRequest: vi.fn(),
}));

vi.mock('./assessment-policy-selector', () => ({
  AssessmentPolicySelector: ({ defaultValue = '' }: { defaultValue?: string }) => (
    <label>
      Versi kebijakan penilaian
      <input name="scoringPolicyVersionId" required defaultValue={defaultValue} />
    </label>
  ),
}));
const context = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: context.state, refresh: vi.fn() }),
}));
vi.mock('./content-api', async (original) => ({
  ...(await original<object>()),
  loadAdminWorkbench: vi.fn(),
  createQuestion: vi.fn(),
  createDrillPackage: vi.fn(),
  updateDrillPackage: vi.fn(),
  archiveDrillPackage: vi.fn(),
  publishDrillPackage: vi.fn(),
  resolveReport: vi.fn(),
  updateTryoutDraft: vi.fn(),
  createTryoutDraft: vi.fn(),
}));
// Explicitly fictional UI test fixtures; no production login bypass or Supabase write.
const data = {
  curriculum: {
    items: [
      {
        id: 'sub-test',
        kind: 'SUBCHAPTER' as const,
        parentId: 'chapter-test',
        code: 'SUB-TEST',
        name: 'Subbab demo',
        displayOrder: 0,
        status: 'READY' as const,
      },
      {
        id: 'competency-test',
        kind: 'COMPETENCY' as const,
        parentId: 'sub-test',
        code: 'TEST',
        name: 'Kompetensi fiktif',
        displayOrder: 0,
        status: 'READY' as const,
      },
    ],
  },
  versions: {
    hasNext: false,
    items: [
      {
        id: 'version-test',
        questionId: 'question-test',
        primaryCompetencyId: 'competency-test',
        variantId: 'variant-test',
        variantCode: 'DEMO-01',
        variantKind: 'ORIGINAL' as const,
        originalVariantId: null,
        versionNumber: 1,
        questionType: 'SINGLE_CHOICE',
        stem: 'Soal demo',
        options: [],
        answerOptionId: 'A',
        explanation: 'Pembahasan demo',
        difficulty: 'DEMO',
        contentStatus: 'READY' as const,
        questionStatus: 'READY' as const,
        reviewedByUserId: 'reviewer-test',
        reviewedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
  videos: {
    hasNext: false,
    items: [
      {
        id: 'video-test',
        mappingId: 'mapping-test',
        subchapterId: 'sub-test',
        title: 'Video demo',
        url: 'https://www.youtube.com/watch?v=demo',
        source: 'YouTube',
        recommendationOrder: 1,
        status: 'READY' as const,
      },
    ],
  },
  reports: {
    hasNext: false,
    nextOffset: null,
    items: [
      {
        id: 'question-report-test',
        kind: 'QUESTION' as const,
        referenceId: 'answer-reference-test',
        category: 'Kunci jawaban',
        details: 'Kunci tidak sesuai dengan pembahasan.',
        status: 'OPEN' as const,
        followUp: null,
        reportedAt: '2026-10-02T08:00:00.000Z',
      },
      {
        id: 'video-report-test',
        kind: 'VIDEO' as const,
        referenceId: 'mapping-test',
        category: 'Video tidak relevan',
        details: 'Materi video berbeda dari subbab.',
        status: 'IN_REVIEW' as const,
        followUp: 'Sedang diperiksa.',
        reportedAt: '2026-10-02T09:00:00.000Z',
      },
    ],
  },
  irt: { items: [], hasNext: false },
  irtBatches: {
    hasNext: false,
    items: [
      {
        id: 'batch-test',
        packageId: 'tryout-test',
        batchKind: 'TRYOUT',
        modelVersion: 'demo-model',
        status: 'SUCCEEDED' as const,
        startedAt: '2026-10-01T00:00:00.000Z',
        finishedAt: '2026-10-01T01:00:00.000Z',
        resultReleasedAt: null,
        failureCode: null,
      },
    ],
  },
  audit: {
    hasNext: false,
    items: [
      {
        id: 'audit-test',
        actorUserId: 'admin-test',
        action: 'drill_package_published',
        entityType: 'assessment_package',
        entityId: 'drill-package-test',
        createdAt: '2026-10-01T02:00:00.000Z',
      },
    ],
  },
  dashboard: { schools: 0, chapters: 0, questions: 0, readyVersions: 0, openReports: 0 },
  packages: {
    hasNext: false,
    items: [
      {
        id: 'package-test',
        familyCode: 'TEST',
        packageVersion: 1,
        name: 'Paket fiktif',
        status: 'DRAFT',
        questionVersionIds: ['pinned-id-outside-current-page'],
      },
    ],
  },
  drillPackages: {
    hasNext: false,
    items: [
      {
        id: 'drill-package-test',
        familyCode: 'DEMO-L1',
        packageVersion: 1,
        name: 'Paket Drill demo',
        levelId: 'level-test',
        variantIndex: 1,
        scoringPolicyVersionId: 'policy-test',
        status: 'DRAFT' as const,
        releaseAt: null,
        questionVersionIds: ['version-test'],
      },
    ],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  context.state = {
    status: 'ready',
    profile: {
      id: 'admin-test',
      role: 'ADMIN',
      status: 'ACTIVE',
      capabilities: ['CONTENT_MANAGE', 'AUDIT_READ'],
      displayName: 'Admin test',
    },
    session: { access_token: 'test-token' },
  };
  vi.mocked(loadAdminWorkbench).mockResolvedValue(data);
  vi.mocked(apiRequest).mockResolvedValue({ ...data.versions, nextOffset: null });
  vi.mocked(createTryoutDraft).mockResolvedValue({ id: 'new-package-test' });
  vi.mocked(createQuestion).mockResolvedValue({ id: 'new-version-test' });
  vi.mocked(createDrillPackage).mockResolvedValue({ id: 'new-drill-test' });
  vi.mocked(updateDrillPackage).mockResolvedValue({ id: 'drill-package-test' });
  vi.mocked(archiveDrillPackage).mockResolvedValue({ id: 'drill-package-test' });
  vi.mocked(publishDrillPackage).mockResolvedValue({ id: 'drill-package-test' });
  vi.mocked(resolveReport).mockResolvedValue({ id: 'question-report-test' });
  vi.mocked(updateTryoutDraft).mockResolvedValue({ id: 'package-test' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Admin content UI', () => {
  it('assembles all thirty Tryout questions across independent selector pages without losing selection', async () => {
    const questions = Array.from({ length: 30 }, (_, i) => ({
      ...data.versions.items[0],
      id: `ready-${i}`,
      stem: `Question ${i + 1}`,
    }));
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path.includes('offset=20')
        ? { items: questions.slice(20), nextOffset: null }
        : { items: questions.slice(0, 20), nextOffset: 20 },
    );
    render(<AdminContentScreen initialView="packages" />);
    await screen.findByLabelText(/Question 1$/);
    screen.getAllByRole('checkbox').forEach((item) => fireEvent.click(item));
    fireEvent.click(screen.getByRole('button', { name: 'Soal berikutnya' }));
    await screen.findByLabelText(/Question 30$/);
    screen.getAllByRole('checkbox').forEach((item) => fireEvent.click(item));
    expect(screen.getByText('Versi READY (30 versi dipilih)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Soal sebelumnya' }));
    expect(((await screen.findByLabelText(/Question 1$/)) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Kode keluarga paket'), {
      target: { value: 'TEST-30' },
    });
    fireEvent.change(screen.getByLabelText('Versi paket'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Nama paket'), {
      target: { value: 'Thirty questions' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await waitFor(() =>
      expect(createTryoutDraft).toHaveBeenCalledWith('test-token', {
        familyCode: 'TEST-30',
        packageVersion: 1,
        name: 'Thirty questions',
        questionVersionIds: questions.map((q) => q.id),
      }),
    );
  });
  it('restricts the level form to the five levels specified by the PRD', async () => {
    render(<AdminContentScreen initialView="curriculum" />);
    fireEvent.change(await screen.findByLabelText('Jenis materi'), { target: { value: 'LEVEL' } });
    const field = screen.getByLabelText('Nomor level') as HTMLInputElement;
    expect(field.max).toBe('5');
    fireEvent.change(field, { target: { value: '6' } });
    expect(field.validity.rangeOverflow).toBe(true);
  });
  it('shows six demo taxonomy entries in pages of five, retains real material and allows inspecting remaining fixtures', async () => {
    context.state.profile = {
      ...(context.state.profile as object),
      adminRole: 'CONTENT_DATA_MODERATION',
    };
    vi.mocked(loadAdminWorkbench).mockResolvedValue({
      ...data,
      curriculum: {
        items: Array.from({ length: 9 }, (_, i) => ({
          id: `material-${i}`,
          kind: 'CHAPTER' as const,
          parentId: null,
          code: i === 8 ? 'CURRICULUM-REAL' : `DEMO-MATERIAL-${i}`,
          name: i === 8 ? 'Materi resmi' : `Materi demo ${i + 1}`,
          displayOrder: i,
          status: 'DRAFT' as const,
        })),
      },
    });
    render(<AdminContentScreen initialView="curriculum" />);
    const list = await screen.findByRole('list', { name: 'Daftar materi' });
    const pager = screen.getByRole('navigation', { name: 'Halaman materi' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText(/7 entri materi/)).toBeTruthy();
    fireEvent.click(within(pager).getByRole('button', { name: 'Berikutnya' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Materi demo 6')).toBeTruthy();
    expect(within(list).getByText('Materi resmi')).toBeTruthy();
    expect(within(pager).getByRole('button', { name: 'Berikutnya' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Tampilkan seluruh materi demo/ }));
    expect(screen.getByText(/9 entri materi/)).toBeTruthy();
    expect(within(pager).getByText('Halaman 1')).toBeTruthy();
  });
  it('uses five-item bank pages and server nextOffset so a full final page cannot open an empty page', async () => {
    context.state.profile = {
      ...(context.state.profile as object),
      adminRole: 'CONTENT_DATA_MODERATION',
    };
    vi.mocked(loadAdminWorkbench).mockImplementation(async (_t, offset) => ({
      ...data,
      versions: {
        items: Array.from({ length: 5 }, (_, i) => ({
          ...data.versions.items[0]!,
          id: `version-${offset + i}`,
          stem: `Soal ${offset + i + 1}`,
        })),
        nextOffset: offset === 0 ? 5 : null,
        hasNext: offset === 0,
      },
    }));
    render(<AdminContentScreen />);
    await screen.findByText('Soal 1');
    const pager = screen.getByRole('navigation', { name: 'Halaman data' });
    fireEvent.click(within(pager).getByRole('button', { name: 'Berikutnya' }));
    await screen.findByText('Soal 6');
    expect(screen.queryByText('Soal 1')).toBeNull();
    const secondPager = screen.getByRole('navigation', { name: 'Halaman data' });
    expect(within(secondPager).getByText('Halaman 2')).toBeTruthy();
    expect(
      within(secondPager).getByRole('button', { name: 'Berikutnya' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(loadAdminWorkbench).toHaveBeenLastCalledWith('test-token', 5, 'questions', {}, true);
    fireEvent.click(within(secondPager).getByRole('button', { name: 'Sebelumnya' }));
    await screen.findByText('Soal 1');
  });
  it('does not fetch administrative data for a disabled Admin', () => {
    context.state = {
      status: 'ready',
      profile: {
        id: 'disabled-admin',
        role: 'ADMIN',
        status: 'DISABLED',
        displayName: 'Disabled Admin test',
      },
      session: { access_token: 'disabled-token' },
    };
    render(<AdminContentScreen />);
    expect(screen.getByText('Halaman ini hanya tersedia untuk Admin yang aktif.')).toBeTruthy();
    expect(loadAdminWorkbench).not.toHaveBeenCalled();
  });
  it('creates a Drill draft with the selected level and split pinned question version IDs', async () => {
    vi.mocked(loadAdminWorkbench).mockResolvedValue({
      ...data,
      curriculum: {
        items: [
          ...data.curriculum.items,
          {
            id: 'level-test',
            kind: 'LEVEL',
            parentId: 'sub-test',
            code: 'L1',
            name: 'Level demo',
            displayOrder: 1,
            status: 'READY',
          },
        ],
      },
    });
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paket Drill' }));
    fireEvent.change(await screen.findByLabelText('Kode keluarga'), {
      target: { value: 'DEMO-L1' },
    });
    fireEvent.change(screen.getByLabelText('Versi paket'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'level-test' } });
    expect((screen.getByLabelText(/^Indeks varian/) as HTMLInputElement).value).toBe('1');
    fireEvent.change(screen.getByLabelText('Nama paket'), { target: { value: 'Draf baru' } });
    fireEvent.change(screen.getByLabelText('Versi kebijakan penilaian'), {
      target: { value: 'policy-test' },
    });
    fireEvent.change(
      screen.getByLabelText('ID versi soal (pisahkan dengan baris baru atau koma)'),
      { target: { value: 'version-test, pinned-outside-page\nthird-version' } },
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await waitFor(() =>
      expect(createDrillPackage).toHaveBeenCalledWith('test-token', {
        familyCode: 'DEMO-L1',
        packageVersion: 2,
        name: 'Draf baru',
        levelId: 'level-test',
        variantIndex: 1,
        scoringPolicyVersionId: 'policy-test',
        questionVersionIds: ['version-test', 'pinned-outside-page', 'third-version'],
      }),
    );
  });
  it('keeps a rejected Drill edit retryable and preserves pinned versions outside the current page', async () => {
    const original = data.drillPackages.items[0];
    if (!original) throw new Error('Missing Drill package fixture');
    vi.mocked(loadAdminWorkbench).mockResolvedValue({
      ...data,
      drillPackages: {
        hasNext: false,
        items: [
          {
            ...original,
            questionVersionIds: ['version-test', 'pinned-outside-page'],
          },
        ],
      },
    });
    vi.mocked(updateDrillPackage).mockRejectedValueOnce(
      new ApiProblem(400, 'INVALID_PACKAGE', 'TEST package rejection'),
    );
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paket Drill' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit draf' }));
    fireEvent.change(screen.getByLabelText('Nama paket'), { target: { value: 'Revisi draf' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await screen.findByText('TEST package rejection');
    expect((screen.getByLabelText('Nama paket') as HTMLInputElement).value).toBe('Revisi draf');
    expect(screen.queryByText(/Perubahan tersimpan/)).toBeNull();
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await waitFor(() => expect(updateDrillPackage).toHaveBeenCalledTimes(2));
    expect(updateDrillPackage).toHaveBeenLastCalledWith('test-token', 'drill-package-test', {
      name: 'Revisi draf',
      scoringPolicyVersionId: 'policy-test',
      questionVersionIds: ['version-test', 'pinned-outside-page'],
    });
    await screen.findByText('Perubahan tersimpan. Daftar diperbarui dengan data terbaru.');
  });
  it('requires confirmation before archiving a Drill package', async () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paket Drill' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Arsipkan paket' }));
    expect(archiveDrillPackage).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Arsipkan paket' }));
    await waitFor(() =>
      expect(archiveDrillPackage).toHaveBeenCalledWith('test-token', 'drill-package-test'),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
  });
  it('does not fetch or render administrative data for Student', () => {
    context.state = {
      status: 'ready',
      profile: { id: 'student-test', role: 'STUDENT', displayName: 'Student test' },
      session: { access_token: 'student-token' },
    };
    render(<AdminContentScreen />);
    expect(screen.getByText('Halaman ini hanya tersedia untuk Admin yang aktif.')).toBeTruthy();
    expect(loadAdminWorkbench).not.toHaveBeenCalled();
  });
  it('shows a recoverable network error and retries loading', async () => {
    vi.mocked(loadAdminWorkbench).mockRejectedValueOnce(
      new ApiProblem(0, 'NETWORK_ERROR', 'TEST offline'),
    );
    render(<AdminContentScreen />);
    await screen.findByText('TEST offline');
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang data' }));
    await screen.findByLabelText('Kompetensi');
    expect(loadAdminWorkbench).toHaveBeenCalledTimes(2);
  });
  it('sends a complete PG draft through the shared authenticated API client', async () => {
    render(<AdminContentScreen />);
    fireEvent.change(await screen.findByLabelText('Kompetensi'), {
      target: { value: 'competency-test' },
    });
    fireEvent.change(screen.getByLabelText('Kode varian unik'), { target: { value: 'ORIG-TEST' } });
    fireEvent.change(screen.getByLabelText('Teks soal (LaTeX inline diperbolehkan)'), {
      target: { value: 'TEST 1 + 1' },
    });
    for (const id of ['A', 'B', 'C', 'D'])
      fireEvent.change(screen.getByLabelText(`Opsi ${id}`), { target: { value: `TEST ${id}` } });
    fireEvent.change(screen.getByLabelText('Pembahasan'), {
      target: { value: 'TEST explanation' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan versi DRAFT' }).closest('form')!);
    await waitFor(() =>
      expect(createQuestion).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          primaryCompetencyId: 'competency-test',
          variantCode: 'ORIG-TEST',
          stem: 'TEST 1 + 1',
          answerOptionId: 'A',
          options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: `TEST ${id}` })),
        }),
      ),
    );
    await screen.findByText('Perubahan tersimpan. Daftar diperbarui dengan data terbaru.');
  });
  it('preserves pinned versions outside the loaded page when editing a Tryout draft', async () => {
    render(<AdminContentScreen />);
    await screen.findByLabelText('Kompetensi');
    fireEvent.click(screen.getByRole('button', { name: 'Draf Tryout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit draf' }));
    fireEvent.change(screen.getByLabelText('Nama paket'), {
      target: { value: 'TEST revised package' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await waitFor(() =>
      expect(updateTryoutDraft).toHaveBeenCalledWith('test-token', 'package-test', {
        name: 'TEST revised package',
        questionVersionIds: ['pinned-id-outside-current-page'],
      }),
    );
  });
  it('can remove a pinned version that no longer appears among READY choices', async () => {
    render(<AdminContentScreen initialView="packages" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit draf' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Keluarkan versi pinned-id-outside-current-page' }),
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf paket' }).closest('form')!);
    await waitFor(() =>
      expect(updateTryoutDraft).toHaveBeenCalledWith('test-token', 'package-test', {
        name: 'Paket fiktif',
        questionVersionIds: [],
      }),
    );
  });
  it('shows verification metadata and read-only audit history', async () => {
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verifikasi & riwayat' }));
    expect(await screen.findByText('Reviewer: reviewer-test')).toBeTruthy();
    expect(screen.getByText('drill_package_published')).toBeTruthy();
  });
  it('publishes a Drill draft through the existing Admin endpoint', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paket Drill' }));
    fireEvent.change(await screen.findByLabelText('Referensi persetujuan Curriculum'), {
      target: { value: 'TEST_ONLY_APPROVAL' },
    });
    fireEvent.submit(
      (await screen.findByRole('button', { name: 'Publikasikan paket' })).closest('form')!,
    );
    await waitFor(() =>
      expect(publishDrillPackage).toHaveBeenCalledWith('test-token', 'drill-package-test', {
        curriculumApprovalReference: 'TEST_ONLY_APPROVAL',
      }),
    );
    expect(
      await screen.findByText('Perubahan tersimpan. Daftar diperbarui dengan data terbaru.'),
    ).toBeTruthy();
  });
  it('shows IRT batch status separately from result release state', async () => {
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'IRT' }));
    expect(await screen.findByText('TRYOUT · SUCCEEDED')).toBeTruthy();
    expect(screen.getByText(/Rilis belum tercatat/)).toBeTruthy();
  });
  it('resolves a question report with a required follow-up through the Admin API', async () => {
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Laporan' }));
    const report = await screen.findByTestId('report-question-report-test');
    fireEvent.change(within(report).getByLabelText('Status tindak lanjut'), {
      target: { value: 'RESOLVED' },
    });
    fireEvent.change(within(report).getByLabelText('Catatan tindak lanjut'), {
      target: { value: 'Kunci jawaban dikirim ke Curriculum untuk koreksi.' },
    });
    fireEvent.submit(report.querySelector('form')!);
    await waitFor(() =>
      expect(resolveReport).toHaveBeenCalledWith('test-token', 'QUESTION', 'question-report-test', {
        status: 'RESOLVED',
        followUp: 'Kunci jawaban dikirim ke Curriculum untuk koreksi.',
      }),
    );
  });
  it('filters video reports on the server and links the independent target detail', async () => {
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Laporan' }));
    fireEvent.change(await screen.findByLabelText('Jenis laporan'), { target: { value: 'VIDEO' } });
    const report = await screen.findByTestId('report-video-report-test');
    expect(
      within(report).getByRole('link', { name: 'Detail target & resolution' }).getAttribute('href'),
    ).toBe('/admin/reports/VIDEO/video-report-test');
    expect(loadAdminWorkbench).toHaveBeenLastCalledWith(
      'test-token',
      0,
      'reports',
      {
        kind: 'VIDEO',
      },
      false,
    );
    expect(screen.queryByTestId('report-question-report-test')).toBeNull();
  });
  it('retains applied report filters after reloading and when changing report kind', async () => {
    render(<AdminContentScreen initialView="reports" />);
    fireEvent.change(await screen.findByLabelText('Kategori laporan'), {
      target: { value: 'ANSWER_KEY' },
    });
    fireEvent.change(screen.getByLabelText('Dari waktu'), {
      target: { value: '2026-10-01T10:15' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'Terapkan filter server' }).closest('form')!,
    );
    expect(((await screen.findByLabelText('Kategori laporan')) as HTMLInputElement).value).toBe(
      'ANSWER_KEY',
    );
    expect((screen.getByLabelText('Dari waktu') as HTMLInputElement).value).toBe(
      '2026-10-01T10:15',
    );
    fireEvent.change(screen.getByLabelText('Jenis laporan'), { target: { value: 'VIDEO' } });
    await waitFor(() =>
      expect(loadAdminWorkbench).toHaveBeenLastCalledWith(
        'test-token',
        0,
        'reports',
        {
          category: 'ANSWER_KEY',
          from: new Date('2026-10-01T10:15').toISOString(),
          kind: 'VIDEO',
        },
        false,
      ),
    );
  });
  it('removes administrative data on logout and on an API access rejection', async () => {
    const result = render(<AdminContentScreen />);
    await screen.findByLabelText('Kompetensi');
    context.state = { status: 'signed_out' };
    result.rerender(<AdminContentScreen />);
    expect(screen.queryByLabelText('Kompetensi')).toBeNull();
    context.state = {
      status: 'ready',
      profile: {
        id: 'another-admin-test',
        role: 'ADMIN',
        status: 'ACTIVE',
        capabilities: ['CONTENT_MANAGE', 'AUDIT_READ'],
        displayName: 'Admin lain',
      },
      session: { access_token: 'expired-test' },
    };
    vi.mocked(loadAdminWorkbench).mockRejectedValueOnce(
      new ApiProblem(403, 'ACCOUNT_DISABLED', 'TEST disabled'),
    );
    result.rerender(<AdminContentScreen />);
    await screen.findByText('TEST disabled');
    expect(screen.queryByLabelText('Kompetensi')).toBeNull();
  });
  it('hides cached forms when a mutation loses Admin access', async () => {
    vi.mocked(resolveReport).mockRejectedValueOnce(
      new ApiProblem(401, 'SESSION_EXPIRED', 'TEST session expired'),
    );
    render(<AdminContentScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Laporan' }));
    const report = await screen.findByTestId('report-question-report-test');
    fireEvent.change(within(report).getByLabelText('Catatan tindak lanjut'), {
      target: { value: 'Tindak lanjut DEMO' },
    });
    fireEvent.submit(report.querySelector('form')!);
    await screen.findByText('TEST session expired');
    expect(screen.queryByTestId('report-question-report-test')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ke halaman masuk' })).toBeTruthy();
  });
  it('changes question pages without clearing the unsaved editor', async () => {
    const versions = Array.from({ length: 6 }, (_, i) => ({
      ...data.versions.items[0]!,
      id: `version-${i}`,
      stem: `Soal halaman ${i}`,
    }));
    vi.mocked(loadAdminWorkbench).mockImplementation(async (_token, offset) => ({
      ...data,
      versions: {
        items: versions.slice(offset, offset + 5),
        hasNext: offset === 0,
        nextOffset: offset === 0 ? 5 : null,
      },
    }));
    render(<AdminContentScreen />);
    await screen.findByText('Soal halaman 0');
    expect(document.querySelectorAll('.admin-content-view .monitoring-list > li')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Teks soal (LaTeX inline diperbolehkan)'), {
      target: { value: 'Draf belum disimpan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await screen.findByText('Soal halaman 5');
    expect(document.querySelectorAll('.admin-content-view .monitoring-list > li')).toHaveLength(1);
    expect(
      (screen.getByLabelText('Teks soal (LaTeX inline diperbolehkan)') as HTMLTextAreaElement)
        .value,
    ).toBe('Draf belum disimpan');
    expect(loadAdminWorkbench).toHaveBeenLastCalledWith('test-token', 5, 'questions', {}, false);
  });
});
