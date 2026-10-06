import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomeScreen } from './home';
import { AdminLoginScreen } from './login';
import { AppShell } from '@/components/shell';

const mocks = vi.hoisted(() => ({
  state: { status: 'signed_out' } as Record<string, unknown>,
  pathname: '/admin',
  replace: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: mocks.state, refresh: mocks.refresh, logout: mocks.logout }),
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithPassword: mocks.signIn } }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { status: 'signed_out' };
  mocks.pathname = '/admin';
});
afterEach(cleanup);
function ready(adminRole: string | null, capabilities: string[] = []) {
  mocks.state = {
    status: 'ready',
    profile: {
      id: 'test-admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      displayName: 'Admin TEST',
      adminRole,
      capabilities,
    },
    session: { access_token: 'TEST ONLY' },
  };
}

describe('Admin portal navigation', () => {
  it('returns Admin logout to internal login', async () => {
    ready('SUPER_ADMIN', ['CONTENT_MANAGE']);
    render(<AppShell area="admin">Konten</AppShell>);
    fireEvent.click(screen.getByRole('button', { name: /^Keluar$/ }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/login'));
  });
  it.each([
    ['SUPER_ADMIN', ['CONTENT_MANAGE'], true, true],
    ['OPERATIONS', [], true, false],
    ['CONTENT_DATA_MODERATION', ['CONTENT_MANAGE'], false, true],
    [null, [], false, false],
  ] as const)('shows assigned modules for %s', (role, capabilities, operations, content) => {
    ready(role, [...capabilities]);
    render(<AdminHomeScreen />);
    const main = within(screen.getByRole('main'));
    expect(!!main.queryByRole('link', { name: 'Sekolah & credential' })).toBe(operations);
    expect(!!main.queryByRole('link', { name: 'Impor soal' })).toBe(content);
    if (role === null) expect(main.getByText(/Belum ada modul/)).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('selects only the most specific nested navigation item and drops links after access changes', () => {
    ready('SUPER_ADMIN', ['CONTENT_MANAGE']);
    mocks.pathname = '/admin/content/imports';
    const view = render(<AppShell area="admin">Konten</AppShell>);
    const navigation = within(screen.getByRole('navigation', { name: 'Navigasi Ruang admin' }));
    expect(navigation.getByRole('link', { name: 'Impor soal' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      navigation.getByRole('link', { name: 'Konten & assessment' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(
      navigation.getByRole('link', { name: 'Ringkasan' }).getAttribute('aria-current'),
    ).toBeNull();
    ready('OPERATIONS');
    view.rerender(<AppShell area="admin">Konten</AppShell>);
    expect(navigation.queryByRole('link', { name: 'Impor soal' })).toBeNull();
  });
  it('sends signed-out users to internal login and Teachers to their own area', async () => {
    const view = render(<AdminHomeScreen />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/login'));
    mocks.state = {
      status: 'ready',
      profile: {
        id: 'test-teacher',
        displayName: 'Guru TEST',
        role: 'TEACHER',
        teacherVerified: true,
        status: 'ACTIVE',
      },
    };
    view.rerender(<AdminHomeScreen />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/teacher'));
    expect(screen.queryByText(/Selamat datang/)).toBeNull();
  });
});

describe('internal Admin login', () => {
  it('uses provider authentication, recovers from failure, and never submits an Admin assignment', async () => {
    mocks.signIn
      .mockResolvedValueOnce({ error: new Error('PROVIDER PRIVATE ERROR') })
      .mockResolvedValueOnce({ error: null });
    render(<AdminLoginScreen />);
    fireEvent.change(screen.getByLabelText('Email Admin'), {
      target: { value: 'admin@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'TEST ONLY PASSWORD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Masuk ke portal Admin' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('PROVIDER PRIVATE ERROR')).toBeNull();
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: 'admin@example.invalid',
      password: 'TEST ONLY PASSWORD',
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Masuk ke portal Admin' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(''),
    );
  });
  it('waits for identity and handles a non-Admin account without offering signup', async () => {
    mocks.state = {
      status: 'ready',
      profile: { role: 'STUDENT', teacherVerified: null, status: 'ACTIVE' },
    };
    render(<AdminLoginScreen />);
    expect(screen.getByRole('alert').textContent).toContain('bukan akun Admin');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Kembali ke halaman akun' }).getAttribute('href')).toBe(
      '/student',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ganti akun' }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('routes an authenticated Admin to the portal and offers recovery for identity errors', async () => {
    ready('CONTENT_DATA_MODERATION', ['CONTENT_MANAGE']);
    const view = render(<AdminLoginScreen />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin'));
    mocks.state = { status: 'error' };
    view.rerender(<AdminLoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Periksa lagi' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
