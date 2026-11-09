import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { getProfilePhoto } from '@/lib/api';
import { LeaderboardPodium, LeaderboardRankingList } from './leaderboard-podium';

vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: { status: 'ready', session: { access_token: 'TEST_ONLY_TOKEN' } } }),
}));
vi.mock('@/lib/api', () => ({ getProfilePhoto: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('loads account photos in both ranking presentations and drops a removed photo after refresh', async () => {
  vi.mocked(getProfilePhoto).mockImplementation(async (_token, userId) => ({
    url: `https://example.invalid/${userId}.png`,
    expiresAt: '2099-01-01T00:00:00Z',
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LeaderboardPodium
        entries={[{ studentId: 'student-a', displayName: 'Nisa Putri', rank: 1, points: 12.125 }]}
        ownEntry={null}
        unit="xp"
      />
      <LeaderboardRankingList
        entries={[{ studentId: 'student-b', displayName: 'Budi Siswa', rank: 4, points: 5.5 }]}
        ownEntry={null}
        unit="xp"
        label="Peringkat berikutnya"
      />
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByAltText('Nisa Putri').getAttribute('src')).toBe(
      'https://example.invalid/student-a.png',
    );
    expect(screen.getByAltText('Budi Siswa').getAttribute('src')).toBe(
      'https://example.invalid/student-b.png',
    );
  });
  expect(getProfilePhoto).toHaveBeenCalledWith('TEST_ONLY_TOKEN', 'student-a');
  expect(getProfilePhoto).toHaveBeenCalledWith('TEST_ONLY_TOKEN', 'student-b');
  vi.mocked(getProfilePhoto).mockResolvedValue({ url: null, expiresAt: null });
  await client.invalidateQueries({ queryKey: ['profile-photo', 'student-a'] });
  await waitFor(() => expect(screen.queryByAltText('Nisa Putri')).toBeNull());
  expect(screen.getByText('NP')).toBeTruthy();
  expect(screen.getByAltText('Budi Siswa')).toBeTruthy();
});
