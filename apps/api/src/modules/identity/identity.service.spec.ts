import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticationRequestMiddleware } from './authentication-request';
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
const session = (method: string) =>
  `Bearer fixture.${Buffer.from(JSON.stringify({ amr: [{ method }] })).toString('base64url')}.signature`;
const provisionedStudent = {
  ...authUser,
  email_confirmed_at: '2026-11-09T00:00:00Z',
  app_metadata: { provider: 'email', numora_role: 'STUDENT' },
};

describe('IdentityService', () => {
  function request<T>(run: (response: EventEmitter) => Promise<T>) {
    const response = new EventEmitter();
    return new Promise<T>((resolve, reject) =>
      authenticationRequestMiddleware({} as IncomingMessage, response as ServerResponse, () => {
        void run(response).then(resolve, reject);
      }),
    );
  }
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

  it('shares sequential and concurrent verified identity only inside one HTTP request', async () => {
    const service = new IdentityService();
    await request(async () => {
      const users = await Promise.all(
        Array.from({ length: 20 }, () => service.authenticate('Bearer valid')),
      );
      expect(users.every((user) => user.id === authUser.id)).toBe(true);
      await service.authenticate('Bearer valid');
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
    });
    await request(() => service.authenticate('Bearer valid'));
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it('keeps account status, role and affiliation fresh after identity was verified', async () => {
    const service = new IdentityService();
    await request(async () => {
      mocks.selectRows.push([profile], []);
      expect((await service.me('Bearer valid')).studentAffiliation).toBe('MANDIRI');
      mocks.selectRows.push([profile], [{ id: 'new-membership' }]);
      expect((await service.me('Bearer valid')).studentAffiliation).toBe('SCHOOL');
      mocks.selectRows.push([{ ...profile, role: 'ADMIN', adminRole: 'OPERATIONS' }]);
      expect((await service.me('Bearer valid')).adminRole).toBe('OPERATIONS');
      mocks.selectRows.push([{ ...profile, status: 'DISABLED' }]);
      await expect(service.me('Bearer valid')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
    });
  });

  it('isolates tokens and IdentityService providers even in the same request', async () => {
    const first = new IdentityService(),
      second = new IdentityService();
    await request(async () => {
      await Promise.all([
        first.authenticate('Bearer one'),
        first.authenticate('Bearer two'),
        second.authenticate('Bearer one'),
      ]);
      expect(mocks.getUser).toHaveBeenCalledTimes(3);
    });
  });

  it('revalidates outside HTTP and after finish/close rather than retaining identities', async () => {
    const service = new IdentityService();
    await service.authenticate('Bearer valid');
    await service.authenticate('Bearer valid');
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    for (const event of ['finish', 'close'])
      await request(async (response) => {
        await service.authenticate('Bearer valid');
        const before = mocks.getUser.mock.calls.length;
        response.emit(event);
        await service.authenticate('Bearer valid');
        await service.authenticate('Bearer valid');
        expect(mocks.getUser).toHaveBeenCalledTimes(before + 2);
      });
  });

  it('shares a verification failure in flight but lets a later explicit retry revalidate', async () => {
    const service = new IdentityService();
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid JWT') });
    await request(async () => {
      const result = await Promise.allSettled([
        service.authenticate('Bearer valid'),
        service.authenticate('Bearer valid'),
      ]);
      expect(result.every((row) => row.status === 'rejected')).toBe(true);
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
      await expect(service.authenticate('Bearer valid')).resolves.toMatchObject({
        id: authUser.id,
      });
      expect(mocks.getUser).toHaveBeenCalledTimes(2);
    });
  });

  it('does not reuse a successful identity in a later request after token revocation', async () => {
    const service = new IdentityService();
    await request(() => service.authenticate('Bearer valid'));
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('revoked') });
    await expect(request(() => service.authenticate('Bearer valid'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
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

  it('creates a Mandiri Student profile for a confirmed, provisioned password account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: provisionedStudent }, error: null });
    mocks.selectRows.push([profile], []);
    await expect(
      new IdentityService().registerProfile(session('password'), { role: 'STUDENT' }),
    ).resolves.toMatchObject({ role: 'STUDENT', studentAffiliation: 'MANDIRI' });
  });

  it.each([
    ['public email signup', 'password', { app_metadata: { provider: 'email' } }, 'STUDENT'],
    ['unconfirmed email', 'password', { email_confirmed_at: undefined }, 'STUDENT'],
    ['email OTP', 'otp', {}, 'STUDENT'],
    ['Teacher role', 'password', {}, 'TEACHER'],
  ] as const)('rejects password provisioning with %s', async (_case, method, overrides, role) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { ...provisionedStudent, ...overrides } },
      error: null,
    });
    await expect(
      new IdentityService().registerProfile(session(method), { role }),
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
