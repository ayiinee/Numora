import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { learningApi } from './api';
import { TryoutAttemptScreen } from './tryout';

vi.mock('next/navigation', () => ({
  useParams: () => ({ attemptId: 'test-attempt' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  learningApi: { tryoutAttempt: vi.fn(), saveTryoutAnswer: vi.fn(), submitTryout: vi.fn() },
}));
vi.mock('./ui', async (original) => ({
  ...(await original<object>()),
  LearningFrame: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StudentGate: ({ children }: { children: (token: string) => ReactNode }) => children('TEST-token'),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('preserves an unsaved answer and the form when a background attempt fetch fails', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(learningApi.tryoutAttempt)
    .mockResolvedValueOnce({
      id: 'test-attempt',
      packageId: 'test-package',
      packageTitle: 'TEST ONLY Tryout',
      status: 'inProgress',
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      serverTime: new Date().toISOString(),
      questions: [
        {
          questionInstanceId: 'test-question',
          stem: '2 + 3?',
          options: [
            { id: 'A', text: '5' },
            { id: 'B', text: '6' },
          ],
          selectedOptionId: null,
        },
      ],
    })
    .mockRejectedValue(new Error('TEST background fetch failed'));
  vi.mocked(learningApi.saveTryoutAnswer).mockRejectedValue(new Error('TEST save failed'));
  render(
    <QueryClientProvider client={client}>
      <TryoutAttemptScreen />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('radio', { name: /^A\./ }));
  await screen.findByText('TEST save failed');
  await act(async () => {
    await client.refetchQueries({ queryKey: ['tryout-attempt', 'test-attempt'] });
  });
  await screen.findByText('Status pengerjaan belum dapat diperbarui');
  expect((screen.getByRole('radio', { name: /^A\./ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('TEST save failed')).toBeTruthy();
  expect(screen.getByRole('timer')).toBeTruthy();
  const warning = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(warning);
  expect(warning.defaultPrevented).toBe(true);
  vi.mocked(learningApi.saveTryoutAnswer).mockResolvedValue({
    questionInstanceId: 'test-question',
    selectedOptionId: 'A',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Coba simpan lagi' }));
  await waitFor(() => expect(screen.queryByText('TEST save failed')).toBeNull());
  expect(learningApi.submitTryout).not.toHaveBeenCalled();
  client.clear();
});
