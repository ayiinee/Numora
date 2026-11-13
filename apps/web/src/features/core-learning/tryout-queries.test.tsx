import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { learningApi, request } from './api';
import { batchTryoutSummary, useTryoutSummary } from './tryout-queries';
import type { StudentTryoutBatchDto } from './generated-types';

vi.mock('./api', () => ({ request: vi.fn(), learningApi: { currentTryout: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const batch: StudentTryoutBatchDto = {
  id: 'batch-test',
  title: 'Tryout aktif',
  startsAt: '2026-11-11T00:00:00Z',
  closesAt: '2026-11-18T00:00:00Z',
  resultDueAt: '2026-11-21T00:00:00Z',
  state: 'OPEN',
  schools: [],
  mandiri: true,
  attemptId: null,
  attemptStatus: null,
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
it('prioritizes an existing session without turning a submitted batch into a published result', () => {
  const submitted = {
    ...batch,
    attemptId: 'submitted',
    attemptStatus: 'COMPLETED',
    state: 'CLOSED',
  };
  const working = { ...batch, attemptId: 'active', attemptStatus: 'IN_PROGRESS' };
  expect(batchTryoutSummary({ routingActive: true, items: [submitted, working] })).toMatchObject({
    state: 'inProgress',
    attemptId: 'active',
    batchSubmission: false,
  });
  expect(batchTryoutSummary({ routingActive: true, items: [submitted] })).toMatchObject({
    state: 'waitingIrt',
    batchSubmission: true,
    eligible: false,
  });
});
it('distinguishes a scheduled batch from no batch without inventing start eligibility', () => {
  expect(
    batchTryoutSummary({ routingActive: true, items: [{ ...batch, state: 'SCHEDULED' }] }),
  ).toMatchObject({ state: 'unavailable', batchState: 'SCHEDULED', eligible: false });
  expect(batchTryoutSummary({ routingActive: true, items: [] })).toEqual({ state: 'unavailable' });
});
