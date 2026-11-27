import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionEditorScreen } from './question-editor';

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: {
      status: 'ready',
      profile: { role: 'ADMIN', status: 'ACTIVE', capabilities: ['CONTENT_MANAGE'] },
      session: { access_token: 'TEST_ONLY' },
    },
  }),
}));
vi.mock('@/lib/api', () => ({ apiRequest: mock.api }));
vi.mock('./admin-presentation', () => ({
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminLoading: ({ message }: { message: string }) => <p>{message}</p>,
  AdminMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('keeps edits across tabs, updates preview and saves a pinned draft revision without review', async () => {
  mock.api.mockImplementation(async (path: string) => {
    if (path.endsWith('/media-links')) return { items: [] };
    if (path === 'admin/content/packages/p')
      return {
        id: 'p',
        status: 'DRAFT',
        assessmentType: 'TRYOUT',
        contentRevision: 7,
        items: [{ questionVersionId: 'v', displayOrder: 5 }],
      };
    if (path === 'admin/content/import-validations') return { canImportDraft: true, items: [] };
    if (path === 'admin/content/imports') return { items: [{ questionVersionId: 'v' }] };
    return {
      id: 'v',
      questionId: 'q',
      status: 'DRAFT',
      sourceNamespace: 'TEST',
      versionNumber: 1,
      payload: {
        externalId: 'TEST_ONLY',
        type: 'SINGLE_CHOICE',
        stem: { text: 'Soal awal' },
        explanation: { text: 'Penjelasan' },
        options: [{ id: 'A', content: { text: 'Empat' } }],
        answer: { optionId: 'A' },
        metadata: { assetManifest: [] },
      },
    };
  });
  render(<QuestionEditorScreen id="v" packageId="p" />);
  const stem = await screen.findByLabelText('Teks soal');
  fireEvent.change(stem, { target: { value: 'Soal diperbarui' } });
  expect(screen.getByText('Soal diperbarui', { selector: 'span' })).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Metadata' }));
  fireEvent.change(screen.getByLabelText('Kode bab'), { target: { value: 'BIL' } });
  fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
  expect(screen.getByText('Soal ini belum memiliki media.')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Isi soal' }));
  expect((screen.getByLabelText('Teks soal') as HTMLTextAreaElement).value).toBe('Soal diperbarui');
  expect(screen.queryByText('Catat keputusan review')).toBeNull();
  expect(screen.getByRole('link', { name: /Kembali ke paket/ }).getAttribute('href')).toBe(
    '/admin/assessments/tryout/p',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
  await waitFor(() =>
    expect(mock.api.mock.calls.some(([path]) => path === 'admin/content/imports')).toBe(true),
  );
  const request = mock.api.mock.calls.find(([path]) => path === 'admin/content/imports')!;
  const body = JSON.parse(request[2].body);
  expect(body.target).toEqual({ packageId: 'p', expectedRevision: 7 });
  expect(body.expectedSourceVersionId).toBe('v');
  expect(body.questions[0].chapterCode).toBe('BIL');
  expect(body.questions[0].metadata.sourceOrder).toBe(5);
});
