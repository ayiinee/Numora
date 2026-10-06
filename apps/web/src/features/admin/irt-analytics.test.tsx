import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest, ApiProblem } from '@/lib/api';
import { AdminIrtScreen } from './irt-requests';
import { AdminAnalyticsScreen } from './analytics';
const mocks = vi.hoisted(() => ({
  state: {
    status: 'ready',
    profile: {
      id: 'TEST',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRole: 'CONTENT_DATA_MODERATION',
      capabilities: ['CONTENT_MANAGE', 'ANALYTICS_CONTENT'],
    },
    session: { access_token: 'TEST ONLY' },
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => ({ state: mocks.state }) }));
vi.mock('@/lib/api', async (load) => ({ ...(await load<object>()), apiRequest: vi.fn() }));
vi.mock('./admin-presentation', () => ({
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminLoading: ({ message }: { message: string }) => <p role="status">{message}</p>,
  AdminMessage: ({ message, retry }: { message: string; retry?: () => void }) => (
    <div role="alert">
      {message}
      {retry && <button onClick={retry}>Coba lagi</button>}
    </div>
  ),
}));
const request = {
  id: 'request',
  status: 'FAILED',
  dispatchGeneration: 1,
  dueAt: '2026-10-09T00:00:00Z',
  overdue: false,
  acceptedExecutionId: null,
  rowCount: 30,
  inputDigest: 'TEST-digest',
  snapshotDigest: 'TEST-snapshot',
  configurationPins: [{ approvalId: 'model', digest: 'TEST' }],
  execution: {
    status: 'FAILED',
    attemptNumber: 1,
    leaseExpired: false,
    failureCode: 'TEST_FAILURE',
  },
  failureCode: null,
  artifacts: [],
};
const batch = {
  id: 'batch',
  title: 'TEST weekly package',
  contextId: 'context',
  closesAt: '2026-10-04T17:00:00Z',
  dueAt: '2026-10-07T17:00:00Z',
  status: 'CLOSED',
  overdue: true,
  finalizedAttemptCount: 3,
  activeAttemptCount: 0,
  publishedAt: null,
  prepareBlockers: [],
  publicationBlockers: ['RESPONDENT_CONTRACT_NOT_APPROVED'],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.profile.capabilities = ['CONTENT_MANAGE', 'ANALYTICS_CONTENT'];
  mocks.state.profile.adminRole = 'CONTENT_DATA_MODERATION';
});
afterEach(cleanup);
it('clears selected request and every queue after server access is revoked', async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === 'admin/irt/options') return { enabled: true, configurations: [], contexts: [] };
    if (path.startsWith('admin/irt/batch-health')) return { items: [batch] };
    if (path === 'admin/irt/requests/request') return request;
    if (path.endsWith('/retry')) throw new ApiProblem(403, 'FORBIDDEN', 'IRT access revoked');
    return { items: [request] };
  });
  render(<AdminIrtScreen />);
  fireEvent.click(await screen.findByText('Detail request request'));
  await screen.findByRole('button', { name: 'Retry request' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry request' }));
  await screen.findByText('Akses IRT telah berubah. Periksa kembali akun.');
  expect(screen.queryByRole('button', { name: 'Retry request' })).toBeNull();
  expect(screen.queryByText('TEST weekly package')).toBeNull();
});
it('keeps request/detail and batch health usable when the independent configuration loader fails', async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === 'admin/irt/options') throw new Error('TEST config outage');
    if (path.startsWith('admin/irt/batch-health')) return { items: [batch] };
    if (path === 'admin/irt/requests/request') return request;
    return { items: [request] };
  });
  render(<AdminIrtScreen />);
  await screen.findByText('TEST config outage');
  fireEvent.click(await screen.findByText('Detail request request'));
  await screen.findByText(/Adoption: belum diterima/);
  expect(screen.getByText(/SLA 72 jam terlewati/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry request' }).hasAttribute('disabled')).toBe(
    false,
  );
});
it('retains the retry operation key after failure and refreshes durable request state on success', async () => {
  let attempts = 0;
  vi.mocked(apiRequest).mockImplementation(async (path, _token, options) => {
    if (path.endsWith('/retry')) {
      if (++attempts === 1) throw new Error('TEST provider outage');
      return { ...request, status: 'PENDING', dispatchGeneration: 2 };
    }
    if (path === 'admin/irt/options') return { enabled: true, configurations: [] };
    if (path.startsWith('admin/irt/batch-health')) return { items: [batch] };
    if (options?.method === 'POST') return request;
    if (path === 'admin/irt/requests/request') return request;
    return { items: [request] };
  });
  render(<AdminIrtScreen />);
  fireEvent.click(await screen.findByText('Detail request request'));
  fireEvent.click(await screen.findByText('Retry request'));
  await screen.findByText('TEST provider outage');
  fireEvent.click(screen.getByText('Retry request'));
  await waitFor(() => expect(attempts).toBe(2));
  const calls = vi.mocked(apiRequest).mock.calls.filter(([path]) => path.endsWith('/retry'));
  expect(calls[0]?.[2]?.headers).toEqual(calls[1]?.[2]?.headers);
});
it('clears analytics on access revocation and renders unavailable distinctly from a valid zero', async () => {
  mocks.state.profile.adminRole = 'OPERATIONS';
  mocks.state.profile.capabilities = ['ANALYTICS_OPERATIONS'];
  vi.mocked(apiRequest).mockResolvedValue({
    generatedAt: '2026-10-06T00:00:00Z',
    source: 'POSTGRESQL',
    metrics: [
      { key: 'zero', label: 'TEST real zero', value: 0, unavailableReason: null },
      {
        key: 'missing',
        label: 'TEST missing',
        value: null,
        unavailableReason: 'QUERY_UNAVAILABLE',
      },
    ],
  });
  const view = render(<AdminAnalyticsScreen />);
  await screen.findByText('TEST real zero');
  expect(screen.getByText('0')).toBeTruthy();
  expect(screen.getByText('Tidak tersedia')).toBeTruthy();
  mocks.state.profile.capabilities = [];
  view.rerender(<AdminAnalyticsScreen />);
  expect(screen.queryByText('TEST real zero')).toBeNull();
  expect(screen.getByText('Akses analytics Admin diperlukan.')).toBeTruthy();
});
