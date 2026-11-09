import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { getProfilePhoto } from '@/lib/api';
import { UserAvatar } from './user-avatar';

vi.mock('./auth', () => ({
  useAuth: () => ({ state: { status: 'ready', session: { access_token: 'session' } } }),
}));
vi.mock('@/lib/api', () => ({ getProfilePhoto: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('shares a signed photo across identity surfaces, renews it, and falls back when the image fails', async () => {
  vi.mocked(getProfilePhoto)
    .mockResolvedValueOnce({
      url: 'https://example.invalid/first',
      expiresAt: '2099-01-01T00:00:00Z',
    })
    .mockResolvedValue({
      url: 'https://example.invalid/renewed',
      expiresAt: '2099-01-01T00:15:00Z',
    });
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <UserAvatar userId="student" name="Nisa Baru" />
      <UserAvatar userId="student" name="Nisa Baru" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getAllByAltText('Nisa Baru')).toHaveLength(2));
  expect(getProfilePhoto).toHaveBeenCalledOnce();
  await client.invalidateQueries({ queryKey: ['profile-photo', 'student'] });
  await waitFor(() =>
    expect(screen.getAllByAltText('Nisa Baru')[0]!.getAttribute('src')).toBe(
      'https://example.invalid/renewed',
    ),
  );
  fireEvent.error(screen.getAllByAltText('Nisa Baru')[0]!);
  expect(screen.getByText('NB')).toBeTruthy();
});
