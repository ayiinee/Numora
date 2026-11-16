import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { learningApi, request } from './api';
import { tryoutSummaryHref, useTryoutSummary } from './tryout-queries';
import type { StudentTryoutBatchDto } from './generated-types';

vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
  learningApi: { currentTryout: vi.fn(), assessmentHistory: vi.fn() },
}));
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.mocked(learningApi.assessmentHistory).mockResolvedValue({ records: [], nextCursor: null });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.resetAllMocks();
});
const batch: StudentTryoutBatchDto = {
  id: 'batch-test',
  title: 'Tryout aktif',
  startsAt: '2026-11-11T00:00:00Z',
  closesAt: '2026-11-18T00:00:00Z',
  resultDueAt: '2026-11-21T00:00:00Z',
  durationSeconds: 4500,
  state: 'OPEN',
  schools: [],
  mandiri: true,
  attemptId: null,
  attemptStatus: null,
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTryoutSummary('test-token'), { wrapper });
}
it('uses routed batches instead of an unavailable legacy package on summary surfaces', async () => {
  vi.mocked(request).mockResolvedValue({ routingActive: true, items: [batch] });
  const { result } = mount();
  await waitFor(() => expect(result.current.data?.state).toBe('open'));
  expect(result.current.data).toMatchObject({ title: batch.title, eligible: true });
  expect(result.current.data?.id).toBeUndefined();
  expect(learningApi.currentTryout).not.toHaveBeenCalled();
});
it('keeps the legacy reader only when the server explicitly disables batch routing', async () => {
  vi.mocked(request).mockResolvedValue({ routingActive: false, items: [] });
  vi.mocked(learningApi.currentTryout).mockResolvedValue({
    state: 'resultReady',
    attemptId: 'legacy',
  });
  const { result } = mount();
  await waitFor(() => expect(result.current.data?.state).toBe('resultReady'));
  expect(learningApi.currentTryout).toHaveBeenCalledWith('test-token');
});
it('keeps routing errors recoverable rather than showing unavailable or falling back silently', async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error('Connexion indisponible'));
  const { result } = mount();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.isPending).toBe(false);
  expect(result.current.data).toBeUndefined();
  expect(learningApi.currentTryout).not.toHaveBeenCalled();
  vi.mocked(request).mockResolvedValue({ routingActive: true, items: [batch] });
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.data?.state).toBe('open'));
});
it('prioritizes a resumable session without turning a submitted batch into a published result', async () => {
  const submitted = {
    ...batch,
    attemptId: 'submitted',
    attemptStatus: 'SUBMITTED',
    state: 'CLOSED',
    resultState: 'waiting' as const,
  };
  const working = { ...batch, attemptId: 'active', attemptStatus: 'IN_PROGRESS', canResume: true };
  vi.mocked(request).mockResolvedValue({ routingActive: true, items: [submitted, working] });
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.data).toMatchObject({ state: 'inProgress', attemptId: 'active' }),
  );
  expect(learningApi.assessmentHistory).not.toHaveBeenCalled();
  vi.mocked(request).mockResolvedValue({ routingActive: true, items: [submitted] });
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() =>
    expect(result.current.data).toMatchObject({
      state: 'waitingIrt',
      attemptId: 'submitted',
    }),
  );
  expect(tryoutSummaryHref(result.current.data!)).toBe('/student/tryout/submitted/result');
  expect(learningApi.currentTryout).not.toHaveBeenCalled();
});
it('distinguishes a scheduled batch from no batch without inventing start eligibility', async () => {
  vi.mocked(request).mockResolvedValue({
    routingActive: true,
    items: [{ ...batch, state: 'SCHEDULED' }],
  });
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.data).toMatchObject({ state: 'scheduled', eligible: false }),
  );
  vi.mocked(request).mockResolvedValue({ routingActive: true, items: [] });
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.data).toEqual({ state: 'unavailable' }));
});

it.each(['waiting', 'overdue', 'ready'] as const)(
  'uses the server publication state %s for completed batches',
  async (resultState) => {
    vi.mocked(request).mockResolvedValue({
      routingActive: true,
      items: [
        {
          ...batch,
          state: 'CLOSED',
          attemptId: 'completed',
          attemptStatus: 'GRADED',
          resultState,
        },
      ],
    });
    const { result } = mount();
    const expected = { waiting: 'waitingIrt', overdue: 'overdue', ready: 'resultReady' };
    await waitFor(() => expect(result.current.data?.state).toBe(expected[resultState]));
    expect(tryoutSummaryHref(result.current.data!)).toBe('/student/tryout/completed/result');
  },
);

it('checks an expired session instead of promising it can resume', async () => {
  vi.mocked(request).mockResolvedValue({
    routingActive: true,
    items: [
      {
        ...batch,
        state: 'CLOSED',
        attemptId: 'expired',
        attemptStatus: 'IN_PROGRESS',
        canResume: false,
      },
    ],
  });
  const { result } = mount();
  await waitFor(() => expect(result.current.data?.state).toBe('checking'));
  expect(tryoutSummaryHref(result.current.data!)).toBe('/student/tryout/expired');
});

it('rejects an invalid routing payload without falling back to legacy', async () => {
  vi.mocked(request).mockResolvedValue({ items: [] });
  const { result } = mount();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  expect(learningApi.currentTryout).not.toHaveBeenCalled();
});
