import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminPretestScreen } from './pretest';
const mock = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: {
      status: 'ready',
      profile: {
        id: 'TEST',
        role: 'ADMIN',
        status: 'ACTIVE',
        adminRole: 'CONTENT_DATA_MODERATION',
        capabilities: ['CONTENT_MANAGE'],
      },
      session: { access_token: 'TEST ONLY' },
    },
    refresh: mock.refresh,
  }),
}));
vi.mock('@/lib/api', async (load) => ({ ...(await load<object>()), apiRequest: mock.api }));
vi.mock('./admin-presentation', async (load) => ({
  ...(await load<object>()),
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
const draft = {
  id: 'draft',
  familyCode: 'TEST',
  packageVersion: 1,
  name: 'TEST Pretest',
  chapterId: 'chapter',
  blueprintVersionId: null,
  state: 'DRAFT',
  questionVersionIds: [],
  reviewBlockers: ['PRETEST_REQUIRES_20_ITEMS'],
  publicationBlockers: ['PRETEST_STUDENT_CONSUMER_REQUIRED'],
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.api.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    if (init?.method) return { id: 'saved' };
    if (path.endsWith('/blueprints')) return { items: [] };
    if (path.endsWith('/curriculum'))
      return { items: [{ id: 'chapter', kind: 'CHAPTER', name: 'TEST Chapter' }] };
    return { items: [draft] };
  });
});
afterEach(cleanup);
function submitNew() {
  fireEvent.change(screen.getByLabelText('Kode keluarga'), { target: { value: 'TEAM' } });
  fireEvent.change(screen.getByLabelText('Nama paket'), { target: { value: 'TEAM Pretest' } });
  fireEvent.change(screen.getByLabelText('Bab'), { target: { value: 'chapter' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf' }).closest('form')!);
}
it('returns to POST creation after cancelling an edit', async () => {
  render(<AdminPretestScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit draf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Batal revisi' }));
  submitNew();
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith(
      'admin/content/pretest-packages',
      'TEST ONLY',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
});
it('returns to POST creation after a successful PUT edit', async () => {
  render(<AdminPretestScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit draf' }));
  fireEvent.submit(screen.getByRole('button', { name: 'Simpan draf' }).closest('form')!);
  await screen.findByLabelText('Kode keluarga');
  expect(mock.api).toHaveBeenCalledWith(
    'admin/content/pretest-packages/draft',
    'TEST ONLY',
    expect.objectContaining({ method: 'PUT' }),
  );
  submitNew();
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith(
      'admin/content/pretest-packages',
      'TEST ONLY',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
});
it('retries the blueprint loader instead of only reloading the package list', async () => {
  let failed = true;
  mock.api.mockImplementation(async (path: string) => {
    if (path.endsWith('/blueprints')) {
      if (failed) throw Error('TEST outage');
      return { items: [] };
    }
    if (path.endsWith('/curriculum')) return { items: [] };
    return { items: [draft] };
  });
  render(<AdminPretestScreen />);
  await screen.findByText(/Blueprint belum bisa dimuat/);
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
  await waitFor(() => expect(screen.queryByText(/Blueprint belum bisa dimuat/)).toBeNull());
  expect(mock.api.mock.calls.filter(([path]) => path.endsWith('/blueprints'))).toHaveLength(2);
});
