import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccountsScreen } from './accounts';
import { AdminAuthConfirmScreen } from './auth-confirm';
const mocks = vi.hoisted(() => ({
  state: { status: 'signed_out' } as Record<string, unknown>,
  api: vi.fn(),
  verify: vi.fn(),
  update: vi.fn(),
  identity: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: mocks.state, refresh: mocks.refresh }),
}));
vi.mock('./admin-presentation', () => ({
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminLoading: ({ message }: { message: string }) => <p role="status">{message}</p>,
  AdminMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { verifyOtp: mocks.verify, updateUser: mocks.update } }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: mocks.api,
  getIdentity: mocks.identity,
}));
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/admin/accounts');
  mocks.state = {
    status: 'ready',
    profile: {
      id: 'one',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRole: 'SUPER_ADMIN',
      capabilities: ['ADMIN_ACCOUNTS_MANAGE'],
    },
    session: { access_token: 'TEST ONLY' },
  };
});
afterEach(cleanup);
describe('Admin accounts and dedicated acceptance', () => {
  it('does not load privileged data for Content or Operations', () => {
    mocks.state = { status: 'ready', profile: { role: 'ADMIN', capabilities: ['CONTENT_MANAGE'] } };
    render(<AdminAccountsScreen />);
    expect(screen.getByText(/Hanya Super/)).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it('keeps the account panel available when invitation loading fails', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.startsWith('admin/invitations')) throw new Error('Invite unavailable');
      return { items: [], nextOffset: null };
    });
    render(<AdminAccountsScreen />);
    await screen.findByText('Belum ada akun sesuai filter.');
    await screen.findByText('Invite unavailable');
  });
  it('clears loaded account data when access changes', async () => {
    mocks.api.mockResolvedValue({
      items: [
        {
          id: 'admin',
          email: 'private@example.test',
          displayName: 'Private',
          status: 'ACTIVE',
          adminRole: 'OPERATIONS',
        },
      ],
      nextOffset: null,
    });
    const view = render(<AdminAccountsScreen />);
    await screen.findAllByText(/private@example.test/);
    mocks.state = { status: 'ready', profile: { role: 'ADMIN', capabilities: [] } };
    view.rerender(<AdminAccountsScreen />);
    expect(screen.queryByText(/private@example.test/)).toBeNull();
  });
  it('removes the invite secret from URL and sets password before server acceptance', async () => {
    window.history.replaceState(null, '', '/admin/auth/confirm?token_hash=TEST_SECRET&type=invite');
    mocks.verify.mockResolvedValue({
      data: { session: { access_token: 'TEST ONLY' } },
      error: null,
    });
    mocks.update.mockResolvedValue({ error: null });
    mocks.api.mockResolvedValue({});
    render(<AdminAuthConfirmScreen />);
    await screen.findByLabelText('Password baru');
    expect(window.location.search).toBe('');
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'TEST_SECRET', type: 'invite' });
    fireEvent.change(screen.getByLabelText('Password baru'), {
      target: { value: 'TEST ONLY PASSWORD' },
    });
    fireEvent.change(screen.getByLabelText('Ulangi password'), {
      target: { value: 'TEST ONLY PASSWORD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan password dan lanjutkan' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('admin/invitation/accept', 'TEST ONLY', {
        method: 'POST',
      }),
    );
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.api.mock.invocationCallOrder[0]!,
    );
  });
  it('shows an expired-link failure without a password form or acceptance', async () => {
    window.history.replaceState(null, '', '/admin/auth/confirm?token_hash=EXPIRED&type=invite');
    mocks.verify.mockResolvedValue({ error: new Error('expired'), data: {} });
    render(<AdminAuthConfirmScreen />);
    await screen.findByText(/Tautan telah dipakai/);
    expect(screen.queryByLabelText('Password baru')).toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
