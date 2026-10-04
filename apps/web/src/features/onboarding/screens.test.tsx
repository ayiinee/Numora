import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CallbackScreen, LoginScreen, OnboardingScreen } from './screens';

const mocks = vi.hoisted(() => ({
  state: { status: 'signed_out' } as Record<string, unknown>,
  replace: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  oauth: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('./auth', async (original) => ({
  ...(await original<object>()),
  useAuth: () => ({
    state: mocks.state,
    refresh: mocks.refresh,
    register: mocks.register,
    logout: mocks.logout,
  }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange },
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { status: 'signed_out' };
  window.history.replaceState({}, '', '/');
});
afterEach(cleanup);
function registration() {
  mocks.state = {
    status: 'registration',
    session: {
      user: { email: 'google@example.test', user_metadata: { full_name: 'Nama Google' } },
    },
  };
}
it('keeps Google OAuth provider and origin callback; recovers from a failed launch', async () => {
  mocks.oauth
    .mockResolvedValueOnce({ error: new Error('Koneksi belum tersedia.') })
    .mockImplementationOnce(() => new Promise(() => {}));
  render(<LoginScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan dengan Google' }));
  await screen.findByRole('alert');
  expect(mocks.oauth).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan dengan Google' }));
  expect(
    (screen.getByRole('button', { name: /Menghubungkan/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(mocks.oauth).toHaveBeenCalledTimes(2);
});
it('offers retry and disables OAuth while the identity/session check has failed', () => {
  mocks.state = { status: 'error', message: 'Akun belum dapat diperiksa.' };
  render(<LoginScreen />);
  expect(
    (screen.getByRole('button', { name: 'Lanjutkan dengan Google' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Periksa lagi' }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('exchanges the callback code only once under StrictMode and returns to the destination resolver', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=fixture-code');
  mocks.exchange.mockResolvedValue({ error: null });
  render(
    <StrictMode>
      <CallbackScreen />
    </StrictMode>,
  );
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('fixture-code');
});
it('shows a cancelled callback without rendering provider error details or exchanging a code', async () => {
  window.history.replaceState(
    {},
    '',
    '/auth/callback?error=access_denied&error_description=untrusted-secret',
  );
  render(<CallbackScreen />);
  await screen.findByText('Login belum berhasil');
  expect(screen.queryByText(/untrusted-secret/)).toBeNull();
  expect(mocks.exchange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
  expect(mocks.replace).toHaveBeenCalledWith('/');
});
it('retains role choice after registration failure and submits only the selected role', async () => {
  registration();
  mocks.register
    .mockRejectedValueOnce(new Error('Profil belum tersimpan.'))
    .mockImplementationOnce(() => new Promise(() => {}));
  render(<OnboardingScreen />);
  expect(screen.getByText('Nama Google')).toBeTruthy();
  expect(screen.getByText('google@example.test')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan' }));
  expect(mocks.register).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: /Guru/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan' }));
  await screen.findByText('Profil belum tersimpan.');
  expect((screen.getByRole('radio', { name: /Guru/ }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Simpan dan lanjutkan' }));
  expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true);
  expect(mocks.register.mock.calls).toEqual([['TEACHER'], ['TEACHER']]);
  fireEvent.submit(screen.getByRole('button', { name: /Menyimpan/ }).closest('form')!);
  expect(mocks.register).toHaveBeenCalledTimes(2);
});
it('keeps the disabled-account exit retryable without presenting registration or OAuth', async () => {
  mocks.state = { status: 'disabled' };
  mocks.logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  render(<LoginScreen />);
  expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
  await screen.findByText('Belum dapat keluar. Coba lagi.');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keluar' })));
  expect(mocks.replace).toHaveBeenCalledWith('/');
});
