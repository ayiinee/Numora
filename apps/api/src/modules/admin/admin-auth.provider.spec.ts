import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthProvider } from './admin-auth.provider';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  invite: vi.fn(),
  reset: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    mocks.create(...args);
    return {
      auth: {
        admin: { listUsers: mocks.list, inviteUserByEmail: mocks.invite },
        resetPasswordForEmail: mocks.reset,
      },
    };
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_ACCOUNT_INVITES_ENABLED', 'true');
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'TEST ONLY');
  vi.stubEnv('ADMIN_AUTH_REDIRECT_ORIGIN', 'https://numora.example.test');
  mocks.list.mockResolvedValue({ data: { users: [] }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('admin Auth provider boundaries', () => {
  it('fails closed before sending when account provisioning is disabled', async () => {
    vi.stubEnv('ADMIN_ACCOUNT_INVITES_ENABLED', 'false');
    await expect(
      new AdminAuthProvider().invite('a@example.test', 'operation'),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not invite or adopt an existing foreign Auth identity', async () => {
    mocks.list.mockResolvedValue({
      data: {
        users: [
          {
            email: 'a@example.test',
            invited_at: 'now',
            user_metadata: { numoraInvitationId: 'other' },
          },
        ],
      },
      error: null,
    });
    await expect(
      new AdminAuthProvider().invite('a@example.test', 'operation'),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it('reconciles its reserved operation without sending a second invite', async () => {
    const user = {
      id: 'same',
      email: 'a@example.test',
      invited_at: 'now',
      user_metadata: { numoraInvitationId: 'operation' },
    };
    mocks.list.mockResolvedValue({ data: { users: [user] }, error: null });
    expect(await new AdminAuthProvider().invite('a@example.test', 'operation')).toEqual(user);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it('uses dedicated callback and only an operation marker in provider metadata', async () => {
    mocks.invite.mockResolvedValue({
      data: { user: { id: 'new', email: 'a@example.test' } },
      error: null,
    });
    await new AdminAuthProvider().invite('a@example.test', 'operation');
    expect(mocks.invite).toHaveBeenCalledWith('a@example.test', {
      redirectTo: 'https://numora.example.test/admin/auth/confirm',
      data: { numoraInvitationId: 'operation' },
    });
  });
  it('sanitizes provider errors and never returns Auth links', async () => {
    mocks.invite.mockResolvedValue({ data: {}, error: { message: 'SECRET provider details' } });
    const error = await new AdminAuthProvider()
      .invite('a@example.test', 'operation')
      .catch((error) => error);
    expect(JSON.stringify(error.getResponse())).not.toContain('SECRET');
    mocks.reset.mockResolvedValue({ error: null });
    expect(await new AdminAuthProvider().recover('a@example.test')).toBeUndefined();
    expect(mocks.reset).toHaveBeenCalledWith('a@example.test', {
      redirectTo: 'https://numora.example.test/admin/auth/confirm?type=recovery',
    });
  });
});
