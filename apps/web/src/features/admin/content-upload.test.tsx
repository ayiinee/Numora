'use client';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { ContentImportScreen } from './content-import';
import {
  getUpload,
  listUploads,
  receiveUpload,
  saveUpload,
  validateUpload,
} from './content-upload-api';
import { uploadExcelMedia } from './content-excel-api';
import type { UploadDetailDto } from './generated-types';
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, refresh: vi.fn(), logout: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/imports',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('./content-upload-api', () => ({
  getUpload: vi.fn(),
  listUploads: vi.fn(),
  receiveUpload: vi.fn(),
  saveUpload: vi.fn(),
  validateUpload: vi.fn(),
  uploadTemplate: vi.fn(),
}));
vi.mock('./content-excel-api', () => ({ downloadFile: vi.fn(), uploadExcelMedia: vi.fn() }));
const fresh: UploadDetailDto = {
  id: '00000000-0000-4000-8000-000000000001',
  fileName: 'TEST.xlsx',
  createdAt: '2026-10-06T00:00:00Z',
  actorName: 'TEST Admin',
  revision: 0,
  state: 'PREVIEW',
  status: 'PREVIEW',
  questionCount: 1,
  title: null,
  assessmentType: null,
  packageId: null,
  error: null,
  package: null,
  destination: null,
  selectedIds: ['AUTO-1'],
  excel: {
    envelope: {
      intakeVersion: 1,
      sourceNamespace: 'AUTO',
      questions: [
        {
          externalId: 'AUTO-1',
          type: 'SINGLE_CHOICE',
          chapterCode: 'C',
          subchapterCode: 'S',
          competencyCode: 'K',
          difficulty: 'EASY',
          stem: { text: 'TEST stem' },
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
            assetManifest: [],
          },
        },
      ],
    },
    mappingIssues: [],
    media: [],
    issues: [],
    report: null,
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiRequest).mockResolvedValue({ items: [] });
  window.history.replaceState(null, '', '/');
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST' },
    profile: {
      id: 'TEST admin',
      displayName: 'TEST',
      role: 'ADMIN',
      status: 'ACTIVE',
      capabilities: ['CONTENT_MANAGE'],
    },
  };
  vi.mocked(receiveUpload).mockResolvedValue(structuredClone(fresh));
  vi.mocked(validateUpload).mockImplementation(async (_token, _id, body) => ({
    ...structuredClone(fresh),
    revision: body.expectedRevision + 1,
    destination: body.destination ?? null,
    state: 'VALIDATED',
    status: 'VALIDATED',
    excel: {
      ...fresh.excel!,
      envelope: {
        ...fresh.excel!.envelope,
        questions: body.questions as NonNullable<UploadDetailDto['excel']>['envelope']['questions'],
      },
    },
  }));
  vi.mocked(uploadExcelMedia).mockImplementation(async (_token, envelope) => envelope);
  vi.mocked(listUploads).mockResolvedValue({ items: [fresh], total: 1 });
});
afterEach(cleanup);
async function upload() {
  render(<ContentImportScreen />);
  expect(screen.queryByLabelText('Jenis paket')).toBeNull();
  expect((screen.getByLabelText('File soal Excel') as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('File soal Excel'), {
    target: { files: [new File(['TEST'], 'TEST.xlsx')] },
  });
  await screen.findByText('TEST stem');
}
it('starts without a package, edits preview, chooses destination before mapping validation, and keeps the retry body/key', async () => {
  await upload();
  expect(receiveUpload).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Judul paket')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Judul paket'), { target: { value: 'TEST draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Edit soal AUTO-1' }));
  fireEvent.change(screen.getByLabelText('Teks soal'), { target: { value: 'TEST corrected' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan ke pemetaan' }));
  await screen.findByRole('heading', { name: '3. Pemetaan dan validasi' });
  expect(
    screen
      .getAllByRole('combobox', { name: /^Indikator$/ })
      .every((e) => (e as HTMLSelectElement).disabled),
  ).toBe(true);
  expect(screen.getByRole('button', { name: /Lewati pemetaan materi/ })).toBeTruthy();
  expect(vi.mocked(validateUpload).mock.calls[0]![2].questions[0]).toMatchObject({
    stem: { text: 'TEST corrected' },
  });

  vi.mocked(saveUpload)
    .mockRejectedValueOnce(Error('TEST network'))
    .mockResolvedValue({
      ...fresh,
      state: 'SAVED',
      status: 'DRAFT',
      revision: 3,
      title: 'TEST draft',
      assessmentType: 'TRYOUT',
      packageId: 'TEST package',
    });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
  await screen.findByText('TEST network');
  const calls = vi.mocked(validateUpload).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
  await waitFor(() => expect(saveUpload).toHaveBeenCalledTimes(2));
  expect(vi.mocked(saveUpload).mock.calls[0]!.slice(2)).toEqual(
    vi.mocked(saveUpload).mock.calls[1]!.slice(2),
  );
  expect(validateUpload).toHaveBeenCalledTimes(calls);
});
it('does not save a package when R2 fails, and preserves the preview for retry', async () => {
  await upload();
  fireEvent.change(screen.getByLabelText('Judul paket'), { target: { value: 'TEST draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan ke pemetaan' }));
  await screen.findByRole('heading', { name: '3. Pemetaan dan validasi' });
  vi.mocked(uploadExcelMedia).mockRejectedValueOnce(Error('TEST R2 failure'));
  fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
  await screen.findByText('TEST R2 failure');
  expect(saveUpload).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: '3. Pemetaan dan validasi' })).toBeTruthy();
});
it('tracks failed files, searches history and restores a stored preview after refresh', async () => {
  vi.mocked(receiveUpload).mockResolvedValue({
    ...fresh,
    state: 'INVALID',
    status: 'INVALID',
    error: 'TEST parse failed',
    excel: null,
  });
  render(<ContentImportScreen />);
  fireEvent.change(screen.getByLabelText('File soal Excel'), {
    target: { files: [new File(['bad'], 'bad.xlsx')] },
  });
  await screen.findByText('TEST parse failed');
  fireEvent.click(screen.getByRole('button', { name: 'Riwayat unggahan' }));
  await screen.findByText('TEST.xlsx');
  fireEvent.change(screen.getByLabelText('Cari file atau judul'), { target: { value: 'TEST' } });
  await waitFor(() =>
    expect(vi.mocked(listUploads).mock.calls.at(-1)![1]).toContain('search=TEST'),
  );
  vi.mocked(getUpload).mockResolvedValue(structuredClone(fresh));
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));
  await screen.findByText('TEST stem');
  cleanup();
  render(<ContentImportScreen />);
  await screen.findByText('TEST stem');
  expect(getUpload).toHaveBeenCalledTimes(2);
});
it('blocks Operations before issuing content requests', () => {
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST' },
    profile: { id: 'ops', displayName: 'TEST Ops', role: 'ADMIN', capabilities: [] },
  };
  render(<ContentImportScreen />);
  expect(screen.getByText(/Akses memerlukan Super Admin/)).toBeTruthy();
  expect(listUploads).not.toHaveBeenCalled();
  expect(receiveUpload).not.toHaveBeenCalled();
});

it('saves unfinished mapping progress and resumes it without creating a package', async () => {
  const incomplete = structuredClone(fresh);
  incomplete.excel!.envelope.questions[0]!.competencyCode = null;
  incomplete.excel!.mappingIssues = [
    {
      externalId: 'AUTO-1',
      sheet: 'PG',
      row: 2,
      cell: '',
      field: 'competencyId',
      code: 'MAPPING_REQUIRED',
      detail: 'Pilih indikator.',
      category: 'MAPPING',
    },
  ];
  vi.mocked(receiveUpload).mockResolvedValue(incomplete);
  vi.mocked(validateUpload).mockImplementation(async (_token, _id, body) => ({
    ...incomplete,
    revision: body.expectedRevision + 1,
    destination: body.destination ?? null,
  }));
  await upload();
  fireEvent.change(screen.getByLabelText('Judul paket'), {
    target: { value: 'TEST mapping progress' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan ke pemetaan' }));
  await screen.findByRole('heading', { name: '3. Pemetaan dan validasi' });
  expect((screen.getByRole('button', { name: 'Simpan draft' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Simpan progres preview / Validasi' }));
  await waitFor(() => expect(validateUpload).toHaveBeenCalledTimes(2));
  expect(saveUpload).not.toHaveBeenCalled();
  vi.mocked(getUpload).mockResolvedValue({
    ...incomplete,
    revision: 2,
    destination: {
      assessmentType: 'TRYOUT',
      title: 'TEST mapping progress',
      chapterId: null,
      subchapterId: null,
      levelId: null,
    },
  });
  cleanup();
  render(<ContentImportScreen />);
  await screen.findByText('TEST stem');
  expect((screen.getByLabelText('Judul paket') as HTMLInputElement).value).toBe(
    'TEST mapping progress',
  );
  expect(saveUpload).not.toHaveBeenCalled();
});
