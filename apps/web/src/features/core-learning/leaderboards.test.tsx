import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaderboardsScreen } from './leaderboards';
import { request, learningApi } from './api';
import type { ReactNode } from 'react';
vi.mock('@/features/onboarding/user-avatar', async () => ({
  UserAvatar: (await import('@tka/ui')).Avatar,
}));
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
  it('offers class membership recovery without requesting an unauthorized class ranking, and keeps pending data distinct from empty', async () => {
    vi.mocked(learningApi.dashboard).mockResolvedValue({
      displayName: 'Siswa uji',
      totalXp: 0,
      affiliation: 'MANDIRI',
      classes: [],
      class: null,
      completedLevels: 0,
      availableLevels: 0,
      latestDrillScore: null,
      bestDrillScore: null,
      activities: [],
      activeDrill: null,
      features: {
        drill: true,
        tryout: true,
        pretest: true,
        pvp: true,
        classLeaderboard: true,
        pendingPolicies: [],
      },
    });
    vi.mocked(request).mockImplementation(
      async <T,>(_token: string, path: string) =>
        (path.startsWith('/leaderboards/periods')
          ? { periods: [] }
          : {
              available: false,
              policyPending: false,
              entries: [],
              ownEntry: null,
            }) as T,
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LeaderboardsScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Peringkat sedang diperbarui')).toBeTruthy();
    expect(screen.queryByText('Belum ada rekor pada periode ini.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Kembali ke beranda' }).getAttribute('href')).toBe(
      '/student',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kelas' }));
    const join = await screen.findByRole('link', { name: 'Gabung kelas' });
    expect(join.getAttribute('href')).toBe('/student/profile#gabung-kelas');
    expect(
      vi.mocked(request).mock.calls.some(([, path]) => path.startsWith('/leaderboards/class')),
    ).toBe(false);
  });
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
      { studentId: 'b', displayName: 'Siswa B', rank: 2, points: 8.123456 },
      { studentId: 'c', displayName: 'Siswa C', rank: 3, points: 7 },
      { studentId: 'd', displayName: 'Siswa D', rank: 3, points: 7 },
      { studentId: 'e', displayName: 'Siswa E', rank: 4, points: 5.5 },
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
        entries: archive
          ? []
          : path.includes('/class')
            ? entries.slice(0, 1)
            : path.includes('/activity')
              ? entries.slice(0, 2)
              : entries,
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
    expect(within(tied).getAllByLabelText('Peringkat 3')).toHaveLength(2);
    expect(within(tied).getAllByRole('listitem')).toHaveLength(5);
    expect(within(tied).queryByRole('img', { name: /^Peringkat/ })).toBeNull();
    expect(screen.getByText('#12')).toBeTruthy();
    expect(screen.queryByText(/demo/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aktivitas Global' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('TEST_ONLY_TOKEN', '/leaderboards/activity?'),
    );
    expect(await screen.findByText('5,123456')).toBeTruthy();
    const activityPodium = screen.getByRole('list', { name: 'Peringkat Aktivitas Global' });
    expect(within(activityPodium).getAllByRole('listitem')).toHaveLength(2);
    expect(within(activityPodium).getByText('8,123456')).toBeTruthy();
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
    const classPodium = await screen.findByRole('list', { name: 'Podium teratas kelas' });
    expect(within(classPodium).getAllByRole('listitem')).toHaveLength(1);
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
    expect(screen.getByText('Belum ada rekor pada periode ini.')).toBeTruthy();
    expect(screen.queryByText('Data belum diperbarui')).toBeNull();
  });
});
