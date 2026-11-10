import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PretestAttemptScreen } from '@/features/core-learning/pretest-screens';

const mock = vi.hoisted(() => ({ media: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ attemptId: 'attempt' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/features/core-learning/student-session', () => ({ useStudentToken: () => 'TEST ONLY' }));
vi.mock('@/features/core-learning/ui', () => ({
  LearningFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  DataState: () => <p>Memuat</p>,
  Status: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('@/features/core-learning/api', async (original) => ({
  ...(await original<object>()),
  learningApi: {
    pretestAttempt: async () => ({
      id: 'attempt',
      chapterId: 'chapter',
      chapterTitle: 'Bilangan',
      status: 'inProgress',
      questions: [
        {
          questionInstanceId: 'question',
          stem: 'Lihat [[asset:diagram]]',
          revision: 0,
          options: [
            { id: 'A', text: 'A' },
            { id: 'B', text: 'B' },
          ],
          selectedOptionId: null,
        },
      ],
    }),
    media: mock.media,
  },
}));
afterEach(cleanup);
it('loads authorized image media when student opens a Pretest question', async () => {
  mock.media.mockResolvedValue({
    media: [
      {
        assetId: 'diagram',
        altText: 'Diagram Pretest',
        url: 'https://example.invalid/signed-test.png',
      },
    ],
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PretestAttemptScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('Sesi Pretest Bab');
  expect(await screen.findByAltText('Diagram Pretest')).toBeTruthy();
  expect(mock.media).toHaveBeenCalledWith('TEST ONLY', 'attempt', 'question', 'WORK', ['diagram']);
  client.clear();
});
