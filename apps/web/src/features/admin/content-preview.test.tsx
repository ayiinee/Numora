import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ContentPreviewScreen } from './content-preview';
import { ContentImportScreen } from './content-import';
import { ContentRichText } from './content-rich-text';
import {
  createPreview,
  getPreview,
  importContent,
  renewPreviewMedia,
  savePreview,
  submitPreview,
  validateImport,
} from './content-preview-api';
import type { PreviewSessionDto, ExcelQuestionDto } from './generated-types';
import { downloadFile, parseExcelFile, uploadExcelMedia } from './content-excel-api';
vi.mock('./content-package-workspace', () => ({
  ContentPackageWorkspace: ({ onSelect }: { onSelect: (p: unknown) => void }) => (
    <button
      onClick={() =>
        onSelect({
          id: 'TEST-package',
          assessmentType: 'DRILL',
          contentRevision: 0,
          status: 'DRAFT',
          isDemo: true,
          source: {
            sourceNamespace: 'CURRICULUM_SHEETS_SAMPLE',
            sourceName: 'TEST source',
            sourceReference: 'TEST reference',
          },
        })
      }
    >
      Pilih paket TEST
    </button>
  ),
}));
function renderImporter() {
  render(<ContentImportScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Pilih paket TEST' }));
}
vi.mock('./content-excel-api', () => ({
  parseExcelFile: vi.fn(),
  uploadExcelMedia: vi.fn(),
  downloadExcelTemplate: vi.fn(),
  downloadFile: vi.fn(),
}));

const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, logout: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/imports',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('./content-preview-api', () => ({
  createPreview: vi.fn(),
  getPreview: vi.fn(),
  importContent: vi.fn(),
  renewPreviewMedia: vi.fn(),
  savePreview: vi.fn(),
  submitPreview: vi.fn(),
  validateImport: vi.fn(),
}));
const work: PreviewSessionDto = {
  id: 'session',
  state: 'IN_PROGRESS',
  scoringStatus: 'NOT_SCORED',
  score: null,
  media: [],
  items: [
    {
      instanceId: 'instance',
      questionVersionId: 'version',
      externalId: 'TEST ONLY',
      type: 'SINGLE_CHOICE',
      stem: { text: 'TEST ONLY $1+1$' },
      options: [
        { id: 'A', content: { text: 'Dua' } },
        { id: 'B', content: { text: 'Tiga' } },
      ],
      categories: [],
      answer: null,
      revision: 0,
      serverSavedAt: '2026-10-04T00:00:00Z',
      score: null,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST ONLY TOKEN' },
    profile: {
      id: 'admin',
      displayName: 'TEST ONLY Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      capabilities: ['CONTENT_MANAGE'],
    },
  };
  vi.mocked(getPreview).mockResolvedValue(structuredClone(work));
});
afterEach(cleanup);
describe('internal content preview and importer', () => {
  it('rejects a JSON bound to another package before conversion or save', async () => {
    renderImporter();
    const file = new File(['TEST'], 'wrong-package.json');
    Object.defineProperty(file, 'text', {
      value: async () =>
        JSON.stringify({
          schemaVersion: 2,
          sourceNamespace: 'CURRICULUM_SHEETS_SAMPLE',
          target: { packageId: 'FOREIGN-package' },
          questions: [{ externalId: 'TEST' }],
        }),
    });
    fireEvent.change(screen.getByLabelText('File soal JSON'), { target: { files: [file] } });
    await screen.findByText(/Identitas paket JSON berbeda/);
    expect(importContent).not.toHaveBeenCalled();
    expect(validateImport).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Impor sebagai DRAFT' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('renders a math/image table, edits category keys, and validates/imports only selected questions', async () => {
    const first: ExcelQuestionDto = {
      externalId: 'TEST-FIRST',
      type: 'SINGLE_CHOICE',
      chapterCode: 'TEST',
      subchapterCode: 'TEST',
      competencyCode: 'TEST',
      difficulty: null,
      stem: { text: 'Soal x^2 dan \\(\\frac{1}{2}\\) [[asset:image]]' },
      options: [
        { id: 'A', content: { text: '$x^2$' } },
        { id: 'B', content: { text: 'Tiga' } },
      ],
      answer: { optionId: 'A' },
      explanation: { text: '\\[x^2 + 1\\]' },
      metadata: {
        sourceSheet: 'PG',
        sourceRowNumber: 2,
        sourceLevelNumber: 1,
        assetManifest: [
          {
            externalId: 'TEST-FIRST',
            assetId: 'image',
            textMarker: '[[asset:image]]',
            placement: 'STEM',
            itemId: null,
            assetOrder: 1,
            altText: 'Diagram pertama',
            objectKey: null,
            sha256: 'a'.repeat(64),
            byteLength: 3,
            contentType: 'image/png',
            bucket: 'TEST',
          },
        ],
      },
    };
    const second: ExcelQuestionDto = {
      ...first,
      externalId: 'TEST-SECOND',
      type: 'CATEGORY',
      stem: { text: 'Pernyataan awal' },
      explanation: { text: 'Pembahasan awal' },
      answer: { categoryByStatementId: { A: 'C1', B: 'C2' } },
      metadata: {
        ...first.metadata,
        sourceSheet: 'Kategori',
        assetManifest: [],
        categories: [
          { id: 'C1', label: 'Benar' },
          { id: 'C2', label: 'Salah' },
        ],
      },
    };
    const item = {
      externalId: second.externalId,
      canImportDraft: true,
      canPreview: true,
      blockers: [],
      outcome: 'VALIDATED' as const,
      questionVersionId: null,
    };
    const report = { id: null, sourceNamespace: 'TEST', canImportDraft: true, items: [item] };
    vi.mocked(parseExcelFile).mockResolvedValue({
      envelope: { schemaVersion: 2, sourceNamespace: 'TEST', questions: [first, second] },
      media: [{ externalId: first.externalId, assetId: 'image', base64: 'AQID' }],
      issues: [],
      report,
    });
    vi.mocked(validateImport).mockResolvedValue(report);
    vi.mocked(uploadExcelMedia).mockImplementation(async (_token, envelope) => envelope);
    vi.mocked(importContent).mockResolvedValue({
      ...report,
      id: 'import',
      items: [{ ...item, outcome: 'CREATED', questionVersionId: 'version' }],
    });
    renderImporter();
    fireEvent.change(screen.getByLabelText('File soal Excel'), {
      target: { files: [new File(['TEST'], 'test.xlsx')] },
    });
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Konversi ke paket terpilih' }));
    expect(screen.getByAltText('Diagram pertama').getAttribute('src')).toBe(
      'data:image/png;base64,AQID',
    );
    expect(document.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Tanpa gambar', { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pilih soal TEST-FIRST'));
    expect(
      (screen.getByRole('button', { name: 'Impor sebagai DRAFT' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit soal TEST-SECOND' }));
    expect(
      (screen.getByRole('button', { name: 'Validasi JSON' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Teks soal'), {
      target: { value: 'Pernyataan baru $x^2$' },
    });
    fireEvent.change(screen.getByLabelText('Label kategori C1'), { target: { value: 'Sesuai' } });
    fireEvent.change(screen.getByLabelText('Kunci B'), { target: { value: 'C1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan preview' }));
    expect(
      (screen.getByRole('button', { name: 'Impor sebagai DRAFT' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ekspor JSON' }));
    const exported = JSON.parse(await vi.mocked(downloadFile).mock.calls[0]![0].text());
    expect(exported.questions).toHaveLength(1);
    expect(exported.questions[0].stem.text).toBe('Pernyataan baru $x^2$');
    expect(exported.questions[0].answer.categoryByStatementId).toEqual({ A: 'C1', B: 'C1' });
    fireEvent.click(screen.getByRole('button', { name: 'Validasi JSON' }));
    await screen.findByText('Laporan validasi');
    expect(vi.mocked(validateImport).mock.calls[0]![1].questions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Impor sebagai DRAFT' }));
    await screen.findByText('Laporan impor');
    expect(
      vi.mocked(uploadExcelMedia).mock.calls[0]![1].questions.map((q) => q.externalId),
    ).toEqual(['TEST-SECOND']);
    expect(vi.mocked(importContent).mock.calls[0]![1].questions).toEqual(exported.questions);
    expect((screen.getByLabelText('Pilih soal TEST-FIRST') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
  it('previews Excel images before save and refuses to import when media upload fails', async () => {
    const question: ExcelQuestionDto = {
      externalId: 'TEST-EXCEL',
      type: 'SINGLE_CHOICE' as const,
      chapterCode: 'TEST',
      subchapterCode: 'TEST',
      competencyCode: 'TEST',
      difficulty: null,
      stem: { text: 'TEST Excel [[asset:image]]' },
      options: [
        { id: 'A', content: { text: 'Dua' } },
        { id: 'B', content: { text: 'Tiga' } },
      ],
      answer: { optionId: 'A' },
      explanation: { text: 'TEST explanation' },
      metadata: {
        sourceLevelNumber: 1,
        sourceSheet: 'PG',
        sourceRowNumber: 2,
        assetManifest: [
          {
            externalId: 'TEST-EXCEL',
            assetId: 'image',
            textMarker: '[[asset:image]]',
            placement: 'STEM' as const,
            itemId: null,
            assetOrder: 1,
            altText: 'TEST Excel diagram',
            objectKey: null,
            sha256: 'a'.repeat(64),
            contentType: 'image/png',
            byteLength: 3,
            bucket: 'TEST',
          },
        ],
      },
    };
    const report = {
      id: null,
      sourceNamespace: 'CURRICULUM_SHEETS_SAMPLE',
      canImportDraft: true,
      items: [
        {
          externalId: 'TEST-EXCEL',
          canImportDraft: true,
          canPreview: false,
          blockers: ['MEDIA_NOT_READY'],
          outcome: 'VALIDATED' as const,
          questionVersionId: null,
        },
      ],
    };
    vi.mocked(parseExcelFile).mockResolvedValue({
      envelope: {
        schemaVersion: 2,
        sourceNamespace: report.sourceNamespace,
        questions: [question],
      },
      media: [{ externalId: 'TEST-EXCEL', assetId: 'image', base64: 'AQID' }],
      issues: [],
      report,
    });
    vi.mocked(uploadExcelMedia).mockRejectedValue(Error('Upload failed; soal belum disimpan.'));
    vi.mocked(validateImport).mockResolvedValue(report);
    renderImporter();
    fireEvent.change(screen.getByLabelText('File soal Excel'), {
      target: { files: [new File(['TEST ONLY'], 'test.xlsx')] },
    });
    await screen.findByAltText('TEST Excel diagram');
    fireEvent.click(await screen.findByRole('button', { name: 'Konversi ke paket terpilih' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validasi JSON' }));
    await screen.findByText('Laporan validasi');
    expect(importContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Impor sebagai DRAFT' }));
    await screen.findByText('Upload failed; soal belum disimpan.');
    expect(importContent).not.toHaveBeenCalled();
    const uploaded = structuredClone(question);
    uploaded.metadata.assetManifest[0]!.objectKey = 'key';
    vi.mocked(uploadExcelMedia).mockResolvedValue({
      schemaVersion: 2,
      sourceNamespace: report.sourceNamespace,
      questions: [uploaded],
    });
    vi.mocked(validateImport).mockResolvedValue({
      ...report,
      items: [{ ...report.items[0]!, canPreview: true, blockers: [] }],
    });
    vi.mocked(importContent).mockResolvedValue({ ...report, id: 'import' });
    fireEvent.click(screen.getByRole('button', { name: 'Impor sebagai DRAFT' }));
    await screen.findByText('Laporan impor');
    expect(importContent).toHaveBeenCalledOnce();
    expect(createPreview).not.toHaveBeenCalled();
    const parsed = await vi.mocked(parseExcelFile).mock.results[0]!.value;
    vi.mocked(parseExcelFile).mockResolvedValue({
      ...parsed,
      issues: [
        {
          sheet: 'MCMA',
          row: 5,
          cell: 'H5',
          code: 'IMAGE_UNMAPPED',
          detail: 'Gambar berada di kolom teks.',
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('File soal Excel'), {
      target: { files: [new File(['TEST'], 'invalid.xlsx')] },
    });
    await screen.findByText('MCMA · H5');
    fireEvent.click(screen.getByLabelText('Pilih soal TEST-EXCEL'));
    fireEvent.click(screen.getByLabelText('Pilih soal TEST-EXCEL'));
    expect(
      (screen.getByRole('button', { name: 'Impor sebagai DRAFT' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Validasi JSON' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(importContent).toHaveBeenCalledOnce();
  });
  it('denies Operations without issuing content requests', () => {
    auth.state = {
      status: 'ready',
      session: { access_token: 'TEST ONLY TOKEN' },
      profile: {
        id: 'ops',
        displayName: 'TEST ONLY Operations',
        role: 'ADMIN',
        status: 'ACTIVE',
        capabilities: [],
      },
    };
    render(<ContentPreviewScreen id="session" />);
    expect(screen.getByText(/memerlukan Admin konten/)).toBeTruthy();
    expect(getPreview).not.toHaveBeenCalled();
  });
  it('keeps keys and explanation absent while answering; saves only after server acknowledgement', async () => {
    vi.mocked(savePreview).mockResolvedValue({
      instanceId: 'instance',
      answer: { optionId: 'A' },
      revision: 1,
      serverSavedAt: '2026-10-04T00:01:00Z',
    });
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
    expect(screen.queryByText(/Kunci:/)).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
    await screen.findByText(/revisi 1/);
    expect(savePreview).toHaveBeenCalledWith('TEST ONLY TOKEN', 'session', 'instance', {
      answer: { optionId: 'A' },
      expectedRevision: 0,
    });
  });
  it('resumes saved answers after refresh and shows null scoring review only when submitted', async () => {
    const result = {
      ...work,
      state: 'SUBMITTED' as const,
      items: [
        {
          ...work.items[0]!,
          answer: { optionId: 'B' },
          answerKey: { optionId: 'A' },
          explanation: { text: 'TEST ONLY explanation' },
        },
      ],
    };
    vi.mocked(getPreview).mockResolvedValue(result);
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Review tanpa scoring');
    expect(screen.getByText('TEST ONLY explanation')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Tiga/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/NOT_SCORED/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit & review' })).toBe(null);
  });
  it('does not submit when the final answer has a network error', async () => {
    vi.mocked(savePreview).mockRejectedValue(Error('Koneksi gagal; coba lagi.'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit & review' }));
    await screen.findByRole('alert');
    expect(submitPreview).not.toHaveBeenCalled();
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
  });
  it('handles stale revision conflicts without claiming the answer was saved', async () => {
    vi.mocked(savePreview).mockRejectedValue(Error('ANSWER_REVISION_CONFLICT'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
    await screen.findByText('ANSWER_REVISION_CONFLICT');
    expect(screen.getByText('Perubahan belum tersimpan.')).toBeTruthy();
  });
  it('supports MCMA and partial Category answers with generated DTO shapes', async () => {
    for (const type of ['MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] as const) {
      cleanup();
      const item = {
        ...work.items[0]!,
        type,
        categories:
          type === 'CATEGORY'
            ? [
                { id: 'YES', label: 'Ya' },
                { id: 'NO', label: 'Tidak' },
              ]
            : [],
      };
      vi.mocked(getPreview).mockResolvedValue({ ...work, items: [item] });
      vi.mocked(savePreview).mockResolvedValue({
        instanceId: 'instance',
        answer:
          type === 'CATEGORY' ? { categoryByStatementId: { A: 'YES' } } : { optionIds: ['A'] },
        revision: 1,
        serverSavedAt: '2026-10-04T00:01:00Z',
      });
      render(<ContentPreviewScreen id="session" />);
      await screen.findAllByText('Dua');
      fireEvent.click(
        type === 'CATEGORY'
          ? screen.getAllByRole('radio', { name: 'Ya' })[0]!
          : screen.getByRole('checkbox', { name: /Dua/ }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Simpan jawaban' }));
      await screen.findByText(/revisi 1/);
    }
  });
  it('shows load failure and can retry the same session', async () => {
    vi.mocked(getPreview).mockRejectedValueOnce(Error('Network error'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('Dua');
  });
  it('keeps storage failure bounded to media renewal', async () => {
    vi.mocked(getPreview).mockResolvedValue({
      ...work,
      media: [
        {
          instanceId: 'instance',
          assetId: 'img',
          altText: 'TEST ONLY image',
          url: 'https://example.invalid/image',
          expiresAt: '2026-10-04T00:01:00Z',
        },
      ],
      items: [{ ...work.items[0]!, stem: { text: '[[asset:img]]' } }],
    });
    vi.mocked(renewPreviewMedia).mockRejectedValue(Error('Storage unavailable'));
    render(<ContentPreviewScreen id="session" />);
    await screen.findByAltText('TEST ONLY image');
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang media' }));
    await screen.findByText('Storage unavailable');
    expect(renewPreviewMedia).toHaveBeenCalledWith('TEST ONLY TOKEN', 'session', {
      phase: 'WORK',
      instanceId: 'instance',
      assetIds: ['img'],
    });
  });
  it('renders text safely, display math, ordered images and image retry', () => {
    const retry = vi.fn();
    render(
      <ContentRichText
        text={'<script>alert(1)</script>\n$$x^2$$ [[asset:a]] [[asset:b]]'}
        media={[
          {
            instanceId: 'i',
            assetId: 'a',
            altText: 'first',
            url: 'https://example.invalid/a',
            expiresAt: 'soon',
          },
          {
            instanceId: 'i',
            assetId: 'b',
            altText: 'second',
            url: 'https://example.invalid/b',
            expiresAt: 'soon',
          },
        ]}
        retry={retry}
      />,
    );
    expect(document.querySelector('script')).toBe(null);
    expect(document.querySelector('.katex-display')).toBeTruthy();
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual([
      'first',
      'second',
    ]);
    fireEvent.error(screen.getByAltText('first'));
    fireEvent.click(screen.getByRole('button', { name: 'Coba muat gambar lagi' }));
    expect(retry).toHaveBeenCalled();
  });
  it('shows empty import, reports held media and imports DRAFT with a stable retry key', async () => {
    const report = {
      id: null,
      sourceNamespace: 'CURRICULUM_SHEETS_SAMPLE',
      canImportDraft: true,
      items: [
        {
          externalId: 'TEST ONLY',
          canImportDraft: true,
          canPreview: false,
          blockers: ['MEDIA_NOT_READY'],
          outcome: 'VALIDATED' as const,
          questionVersionId: null,
        },
      ],
    };
    vi.mocked(validateImport).mockResolvedValue(report);
    vi.mocked(importContent)
      .mockRejectedValueOnce(Error('Network error'))
      .mockResolvedValue({
        ...report,
        id: 'import',
        items: [{ ...report.items[0]!, questionVersionId: 'version', outcome: 'CREATED' }],
      });
    renderImporter();
    expect(screen.getByText(/Belum ada file/)).toBeTruthy();
    const file = new File(['[]'], 'questions.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: async () => JSON.stringify([{ externalId: 'TEST ONLY' }]),
    });
    fireEvent.change(screen.getByLabelText('File soal JSON'), { target: { files: [file] } });
    await screen.findByText('1 soal dipilih.');
    fireEvent.click(screen.getByRole('button', { name: 'Konversi ke paket terpilih' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validasi JSON' }));
    await screen.findByText('MEDIA_NOT_READY');
    fireEvent.click(screen.getByRole('button', { name: 'Impor sebagai DRAFT' }));
    await screen.findByText('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Impor sebagai DRAFT' }));
    await screen.findByText('Laporan impor');
    expect(vi.mocked(importContent).mock.calls[0]![2]).toBe(
      vi.mocked(importContent).mock.calls[1]![2],
    );
    expect(createPreview).not.toHaveBeenCalled();
  });
  it('submits after a successful save, not before it', async () => {
    let resolveSave!: (value: Awaited<ReturnType<typeof savePreview>>) => void;
    vi.mocked(savePreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    vi.mocked(submitPreview).mockResolvedValue({
      ...work,
      state: 'SUBMITTED',
      items: [
        {
          ...work.items[0]!,
          answer: { optionId: 'A' },
          answerKey: { optionId: 'A' },
          explanation: { text: 'Review' },
        },
      ],
    });
    render(<ContentPreviewScreen id="session" />);
    await screen.findByText('Dua');
    fireEvent.click(screen.getByRole('radio', { name: /Dua/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit & review' }));
    await waitFor(() => expect(savePreview).toHaveBeenCalled());
    expect(submitPreview).not.toHaveBeenCalled();
    resolveSave({
      instanceId: 'instance',
      answer: { optionId: 'A' },
      revision: 1,
      serverSavedAt: 'now',
    });
    await screen.findByText('Review tanpa scoring');
    expect(submitPreview).toHaveBeenCalledTimes(1);
  });
});
