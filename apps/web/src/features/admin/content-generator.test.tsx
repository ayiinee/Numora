import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { apiRequest, ApiProblem } from '@/lib/api';
import { ContentGeneratorScreen } from './content-generator';
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, logout: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/generator',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(),
}));
const request = {
  id: 'r',
  label: 'Original soal',
  status: 'RUNNING',
  dispatchGeneration: 1,
  executionStatus: 'SUCCEEDED',
  failureCode: null,
  leaseExpired: false,
  accepted: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST' },
    profile: {
      id: 'admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRole: 'CONTENT_DATA_MODERATION',
      displayName: 'TEST',
      capabilities: ['CONTENT_MANAGE'],
    },
  };
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.endsWith('/catalog')) return { items: [{ id: 'mapping', label: 'Original soal' }] };
    if (path.endsWith('/preview'))
      return {
        id: 'candidate',
        scoringStatus: 'NOT_SCORED',
        score: null,
        type: 'SINGLE_CHOICE',
        stem: { text: 'Berapa $2+2$?' },
        options: [
          { id: 'A', content: { text: '4' } },
          { id: 'B', content: { text: '5' } },
        ],
        categories: [],
        answerKey: { optionId: 'A' },
        explanation: { text: 'Penjumlahan' },
      };
    if (path.endsWith('/draft')) return { id: 'draft' };
    if (path.endsWith('/requests')) return { items: [request] };
    return request;
  });
});
afterEach(cleanup);
it('preview stays unscored and only explicit save imports a draft', async () => {
  render(<ContentGeneratorScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Original soal — SUCCEEDED' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lihat kandidat' }));
  await screen.findByRole('heading', { name: 'Preview kandidat' });
  expect(vi.mocked(apiRequest).mock.calls.some(([p]) => p.endsWith('/draft'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
  await screen.findByText('Varian tersimpan sebagai DRAFT.');
  expect(vi.mocked(apiRequest).mock.calls.find(([p]) => p.endsWith('/draft'))?.[2]?.method).toBe(
    'POST',
  );
});
it('shows disabled status without asking for a UUID/hash', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new ApiProblem(503, 'GENERATOR_DISABLED', 'Disabled'));
  render(<ContentGeneratorScreen />);
  await screen.findByText('Generator belum diaktifkan.');
  expect(screen.queryByLabelText(/UUID|hash/i)).toBeNull();
});
it.each(['FAILED', 'EXPIRED'])(
  'offers retry for terminal compute %s even before request status changes',
  async (executionStatus) => {
    const fallback = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation(async (path, token, options) =>
      path.endsWith('/requests')
        ? { items: [{ ...request, executionStatus }] }
        : fallback(path, token, options),
    );
    render(<ContentGeneratorScreen />);
    fireEvent.click(
      await screen.findByRole('button', { name: `Original soal — ${executionStatus}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Coba generate lagi' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(apiRequest)
          .mock.calls.some(
            ([path, , options]) => path.endsWith('/retry') && options?.method === 'POST',
          ),
      ).toBe(true),
    );
  },
);
it('unauthorized role never fetches protected data', async () => {
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST' },
    profile: {
      id: 'ops',
      displayName: 'TEST ops',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRole: 'OPERATIONS',
      capabilities: [],
    },
  };
  render(<ContentGeneratorScreen />);
  await waitFor(() => expect(screen.getByText(/Akses Content Admin diperlukan/)).toBeTruthy());
  expect(apiRequest).not.toHaveBeenCalled();
});
