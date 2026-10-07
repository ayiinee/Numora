import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaderboardsScreen } from './leaderboards';
import { request, learningApi } from './api';
import type { ReactNode } from 'react';
vi.mock('./student-session', () => ({ useStudentToken: () => 'TEST_ONLY_TOKEN' }));
vi.mock('./api', () => ({ request: vi.fn(), learningApi: { dashboard: vi.fn() } }));
vi.mock('./ui', () => ({
  LearningFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Status: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  DataState: () => <p>Memuat</p>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('leaderboard scopes, archives and ties', () => {
  it('shows server ties as a list, keeps decimal XP/self rank and selects authorized class archives', async () => {
    const period = {
      id: 'current',
      status: 'ACTIVE',
      startsAt: '2026-09-30T17:00:00Z',
      endsAt: '2026-10-07T17:00:00Z',
      timezone: 'Asia/Jakarta',
    };
    const entries = [
      { studentId: 'a', displayName: 'Siswa A', rank: 1, points: 12.125 },
      { studentId: 'b', displayName: 'Siswa B', rank: 1, points: 12.125 },
      { studentId: 'c', displayName: 'Siswa C', rank: 2, points: 7 },
    ];
    vi.mocked(learningApi.dashboard).mockResolvedValue({
      classes: [
        { id: 'class-a', name: 'IX A' },
        { id: 'class-b', name: 'IX B' },
      ],
    } as Awaited<ReturnType<typeof learningApi.dashboard>>);
    vi.mocked(request).mockImplementation(async <T,>(_token: string, path: string) => {
      if (path.startsWith('/leaderboards/periods'))
        return { periods: [{ ...period, id: 'archive', status: 'ARCHIVED' }] } as T;
      const archive = path.includes('periodId=archive');
      return {
        policyPending: false,
        available: true,
        unit: path.includes('/pvp') ? 'points' : 'xp',
        dataMode: path.includes('/pvp') ? 'demo' : 'activity',
        rankPolicyVersion: archive ? 'legacy-competition-v0' : 'dense-v1',
        stale: !archive,
        period: { ...period, status: archive ? 'ARCHIVED' : 'ACTIVE' },
        updatedAt: '2026-10-01T01:00:00Z',
        entries,
        ownEntry: { studentId: 'self', displayName: 'Kamu', rank: 12, points: 5.123456 },
      } as T;
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LeaderboardsScreen />
      </QueryClientProvider>,
    );
    const tied = await screen.findByRole('list', { name: 'Podium Global PvP' });
    expect(within(tied).getAllByLabelText('Peringkat 1')).toHaveLength(2);
    expect(document.querySelector('.leaderboard-podium__pedestal')).toBeNull();
    expect(screen.getByText('#12')).toBeTruthy();
    expect(screen.queryByText(/demo/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aktivitas Global' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('TEST_ONLY_TOKEN', '/leaderboards/activity?'),
    );
    expect(await screen.findByText('5,123456')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kelas' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Kelas leaderboard' }), {
      target: { value: 'class-b' },
    });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'TEST_ONLY_TOKEN',
        '/leaderboards/class?classId=class-b',
      ),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Periode leaderboard' }), {
      target: { value: 'archive' },
    });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'TEST_ONLY_TOKEN',
        '/leaderboards/class?classId=class-b&periodId=archive',
      ),
    );
    expect(await screen.findByText('Arsip kebijakan lama')).toBeTruthy();
    expect(screen.queryByText('Data belum diperbarui')).toBeNull();
  });
});
