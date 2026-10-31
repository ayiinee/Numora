import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiProblem } from '@/lib/api';
import { CallbackScreen, LoginScreen, OnboardingScreen, TeacherVerificationScreen } from './screens';

const mocks = vi.hoisted(() => ({
  state: { status: 'signed_out' } as Record<string, unknown>,
  replace: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  oauth: vi.fn(),
  exchange: vi.fn(),
  schools: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  getSchools: mocks.schools,
  verifyTeacher: mocks.verify,
}));
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
  expect(screen.getByRole('alert').textContent).toBe('Pilih salah satu role: Siswa atau Guru.');
  expect(screen.getByRole('group').getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: /Guru/ }));
  expect(screen.queryByRole('alert')).toBeNull();
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

function unverifiedTeacher() {
  mocks.state = {
    status: 'ready',
    session: { access_token: 'fixture-access' },
    profile: {
      id: 'teacher-1',
      role: 'TEACHER',
      displayName: 'Bu Guru',
      teacherVerified: false,
    },
  };
  mocks.schools.mockResolvedValue({ items: [{ id: 'school-1', name: 'SMP 1' }] });
}

it('reports a rejected Teacher token on the token field and leaves the form usable', async () => {
  unverifiedTeacher();
  mocks.verify.mockRejectedValue(
    new ApiProblem(
      403,
      'INVALID_TEACHER_TOKEN',
      'Token tidak valid, kedaluwarsa, telah dipakai, atau dicabut.',
    ),
  );
  render(<TeacherVerificationScreen />);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Sekolah' }), {
    target: { value: 'school-1' },
  });
  fireEvent.change(screen.getByLabelText(/Token verifikasi/), { target: { value: 'Ab2345Cd' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verifikasi dan lanjutkan' }));
  const alert = await screen.findByRole('alert');
  expect(alert.id).toBe('teacher-token-error');
  expect(alert.textContent).toContain('Minta credential baru dari Admin sekolah.');
  expect(screen.getByLabelText(/Token verifikasi/).getAttribute('aria-invalid')).toBe('true');
  expect((screen.getByLabelText(/Token verifikasi/) as HTMLInputElement).value).toBe('Ab2345Cd');
  const submit = screen.getByRole('button', { name: /Verifikasi dan lanjutkan/ });
  expect((submit as HTMLButtonElement).disabled).toBe(false);
});

it('keeps a school-loading failure off the token field and recovers through retry', async () => {
  unverifiedTeacher();
  mocks.schools
    .mockRejectedValueOnce(new ApiProblem(500, 'SERVER_ERROR', 'Sekolah belum dapat dimuat.'))
    .mockResolvedValue({ items: [{ id: 'school-1', name: 'SMP 1' }] });
  render(<TeacherVerificationScreen />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Sekolah belum dapat dimuat.');
  expect(screen.getByLabelText(/Token verifikasi/).getAttribute('aria-invalid')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(mocks.schools).toHaveBeenCalledTimes(2);
});
