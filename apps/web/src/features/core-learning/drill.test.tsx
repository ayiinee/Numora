import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultScreen, ResultSummary } from './drill';
import { LearningApiError, learningApi } from './api';
import type { DrillResult } from './types';
import { StudentAccess } from './student-session';

const { router, auth } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  auth: {
    state: {
      status: 'ready',
      profile: {
        role: 'STUDENT',
        id: 'TEST-student',
        displayName: 'Siswa Test',
        studentAffiliation: 'MANDIRI',
      },
      session: { access_token: 'TEST-token' },
    },
  },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/student/drill/attempt/result',
  useRouter: () => router,
  useParams: () => ({ attemptId: 'attempt' }),
}));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => auth, destination: () => '/' }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  router.push.mockClear();
  auth.state.session.access_token = 'TEST-token';
  auth.state.profile.id = 'TEST-student';
});

const result: DrillResult = {
  attemptId: 'attempt',
  levelId: 'level',
  levelTitle: 'Level 1',
  score: 80,
  correctCount: 8,
  questionCount: 10,
  rawPoints: 8,
  mastered: false,
  stars: null,
  unlockedLevelId: null,
  isDemo: true,
  explanationState: 'available',
  questions: [],
  recommendations: [],
};

describe('ringkasan hasil Drill', () => {
  it.each([false, true])(
    'starts a direct retry for mastered=%s using the same server level and a new server attempt',
    async (mastered) => {
      vi.spyOn(learningApi, 'result').mockResolvedValue({ ...result, mastered });
      vi.spyOn(learningApi, 'videos').mockResolvedValue({ items: [] });
      const start = vi
        .spyOn(learningApi, 'start')
        .mockResolvedValue({
          id: 'retry-attempt',
          levelId: 'level',
          levelTitle: 'Level 1',
          status: 'inProgress',
          startedAt: new Date().toISOString(),
          isDemo: true,
          questions: [],
        });
      render(
        <StudentAccess>
          <ResultScreen />
        </StudentAccess>,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Ulangi level ini' }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/student/drill/retry-attempt'));
      expect(start).toHaveBeenCalledWith('TEST-token', 'level');
    },
  );
  it('mengikuti status tuntas dan unlock dari API, bukan menghitungnya dari skor', () => {
    const view = render(<ResultSummary result={result} />);
    expect(screen.getByText('Belum tuntas')).toBeTruthy();
    expect(screen.queryByText('Level berikutnya terbuka.')).toBeNull();

    view.rerender(
      <ResultSummary result={{ ...result, score: 70, mastered: true, unlockedLevelId: 'next' }} />,
    );
    expect(screen.getByText('Tuntas')).toBeTruthy();
    expect(screen.getByText('Level berikutnya terbuka.')).toBeTruthy();
  });
  it('keeps the saved Drill score visible when the explanation has expired', async () => {
    vi.spyOn(learningApi, 'result').mockResolvedValue({
      ...result,
      score: 80,
      explanationState: 'expired',
      questions: [],
    });
    vi.spyOn(learningApi, 'videos').mockResolvedValue({ items: [] });

    render(
      <StudentAccess>
        <ResultScreen />
      </StudentAccess>,
    );

    expect(await screen.findByText('80', { exact: true })).toBeTruthy();
    expect(screen.getByText('Hasil tersimpan')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pembahasan tidak tersedia' })).toBeTruthy();
    expect(
      screen.getByText(/Nilai dan riwayat hasil tetap tersimpan/),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Matriks jawaban' })).toBeNull();
  });
  it('retries a unavailable next-level package and navigates using the server attempt ID', async () => {
    vi.spyOn(learningApi, 'result').mockResolvedValue({ ...result, unlockedLevelId: 'next' });
    vi.spyOn(learningApi, 'videos').mockResolvedValue({ items: [] });
    const start = vi
      .spyOn(learningApi, 'start')
      .mockRejectedValueOnce(new LearningApiError('Paket belum tersedia.', 409))
      .mockResolvedValue({
        id: 'new-attempt',
        levelId: 'next',
        levelTitle: 'Level 2',
        status: 'inProgress',
        startedAt: new Date().toISOString(),
        isDemo: true,
        questions: [],
      });
    render(
      <StudentAccess>
        <ResultScreen />
      </StudentAccess>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Mulai level berikutnya' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Paket belum tersedia.');
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai level berikutnya' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/student/drill/new-attempt'));
    expect(start).toHaveBeenLastCalledWith('TEST-token', 'next');
  });
  it.each([
    [401, 'Sesi berakhir'],
    [403, 'Akses ditolak'],
  ] as const)('keeps results hidden when the API rejects access (%s)', async (status, title) => {
    const fetch = vi
      .spyOn(learningApi, 'result')
      .mockRejectedValue(new LearningApiError('Login atau periksa akses.', status));
    render(
      <StudentAccess>
        <ResultScreen />
      </StudentAccess>,
    );
    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByText('80')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('drops the previous account cache when the Student identity changes', async () => {
    const fetch = vi
      .spyOn(learningApi, 'result')
      .mockResolvedValueOnce(result)
      .mockImplementation(() => new Promise(() => {}));
    vi.spyOn(learningApi, 'videos').mockResolvedValue({ items: [] });
    const view = render(
      <StudentAccess>
        <ResultScreen />
      </StudentAccess>,
    );
    await screen.findByText('80');
    auth.state.session.access_token = 'TEST-second-session';
    auth.state.profile.id = 'TEST-second-student';
    view.rerender(
      <StudentAccess>
        <ResultScreen />
      </StudentAccess>,
    );
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('TEST-second-session', 'attempt'));
    expect(screen.queryByText('80')).toBeNull();
    expect(screen.getByLabelText('Memuat data')).toBeTruthy();
  });
});
