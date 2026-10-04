import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityService } from './identity.service';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const selectRows: unknown[][] = [];
  let insertedRows: unknown[] = [{ id: 'new-profile' }];
  let insertError: unknown;
  const db = {
    select: () => ({
      from: () => {
        const query = {
          innerJoin: () => query,
          where: () => ({ limit: async () => selectRows.shift() ?? [] }),
        };
        return query;
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (insertError) throw insertError;
            return insertedRows;
          },
        }),
      }),
    }),
  };
  return {
    getUser,
    selectRows,
    db,
    setInsertedRows: (rows: unknown[]) => (insertedRows = rows),
    setInsertError: (error: unknown) => (insertError = error),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@tka/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tka/database')>()),
  getDatabase: () => ({ db: mocks.db }),
}));

const authUser = {
  id: '00000000-0000-4000-8000-000000000099',
  email: 'student@example.com',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Demo Student' },
};
const profile = {
  id: '00000000-0000-4000-8000-000000000100',
  authUserId: authUser.id,
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
  displayName: 'Demo Student',
  email: authUser.email,
};

describe('IdentityService', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.selectRows.length = 0;
    mocks.setInsertedRows([{ id: profile.id }]);
    mocks.setInsertError(undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects missing and invalid bearer tokens', async () => {
    const service = new IdentityService();
    await expect(service.getProfile()).rejects.toBeInstanceOf(UnauthorizedException);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') });
    await expect(service.getProfile('Bearer invalid')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('creates one Google Student profile with Mandiri affiliation', async () => {
    mocks.selectRows.push([profile], []);
    const result = await new IdentityService().registerProfile('Bearer valid', { role: 'STUDENT' });
    expect(result).toMatchObject({ role: 'STUDENT', studentAffiliation: 'MANDIRI' });
    expect(mocks.getUser).toHaveBeenCalledWith('valid');
  });

  it('rejects a second role selection even under a duplicate insert race', async () => {
    mocks.setInsertedRows([]);
    await expect(
      new IdentityService().registerProfile('Bearer valid', { role: 'TEACHER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not register a non-Google account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { ...authUser, app_metadata: { provider: 'email' } } },
      error: null,
    });
    await expect(
      new IdentityService().registerProfile('Bearer valid', { role: 'STUDENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports an unverified Teacher and rejects disabled accounts', async () => {
    const service = new IdentityService();
    mocks.selectRows.push([{ ...profile, role: 'TEACHER' }], []);
    await expect(service.getProfile('Bearer valid')).resolves.toMatchObject({
      role: 'TEACHER',
      teacherVerified: false,
    });
    mocks.selectRows.push([{ ...profile, status: 'DISABLED' }]);
    await expect(service.getProfile('Bearer valid')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps registration diagnostics free of credentials, profile data and raw database errors', async () => {
    const token = 'fixture-private-bearer-token';
    mocks.selectRows.push([profile], []);
    await new IdentityService().registerProfile(`Bearer ${token}`, { role: 'STUDENT' });
    const failure = Object.assign(new Error(`insert rejected for ${authUser.email}: ${token}`), {
      code: 'XX000',
      detail: profile.displayName,
    });
    mocks.setInsertError(failure);
    await expect(
      new IdentityService().registerProfile(`Bearer ${token}`, { role: 'STUDENT' }),
    ).rejects.toBe(failure);
    expect(Logger.prototype.debug).toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Profile registration insert failed');
    const logs = JSON.stringify([
      ...vi.mocked(Logger.prototype.debug).mock.calls,
      ...vi.mocked(Logger.prototype.warn).mock.calls,
      ...vi.mocked(Logger.prototype.error).mock.calls,
    ]);
    for (const value of [
      token,
      authUser.id,
      authUser.email,
      profile.id,
      profile.displayName,
      failure.message,
      failure.stack,
    ]) {
      if (value) expect(logs).not.toContain(value);
    }
  });
});
