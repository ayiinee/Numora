import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './auth';

const mocks = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getIdentity: mocks.getIdentity,
  ApiProblem: class ApiProblem extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { onAuthStateChange: mocks.onAuthStateChange, signOut: mocks.signOut },
  }),
}));

function Status() {
  const { state } = useAuth();
  return (
    <>
      <p>{state.status}</p>
      {state.status !== 'ready' && state.message && <p>{state.message}</p>}
      {state.status === 'ready' && <span>{state.profile.email}</span>}
    </>
  );
}

function mount() {
  render(
    <AuthProvider>
      <Status />
    </AuthProvider>,
  );
}

const session = { access_token: 'test-token' } as Session;
const profile = {
  id: 'student-id',
  role: 'STUDENT',
  displayName: 'Student',
  email: 'student@example.test',
  status: 'ACTIVE',
  teacherVerified: null,
  studentAffiliation: 'MANDIRI',
};

describe('session initialization', () => {
  beforeEach(() => {
    mocks.getIdentity.mockReset();
    mocks.onAuthStateChange.mockReset();
    mocks.signOut.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads the profile once when Supabase repeats the same session', async () => {
    let emit: ((event: string, value: Session | null) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity.mockResolvedValue(profile);
    mount();

    await act(async () => {
      emit?.('INITIAL_SESSION', session);
      emit?.('SIGNED_IN', session);
    });

    expect(await screen.findByText('ready')).toBeTruthy();
    expect(mocks.getIdentity).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error when session initialization never returns', async () => {
    vi.useFakeTimers();
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mount();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText('error')).toBeTruthy();
  });

  it('stops waiting when the profile request never returns', async () => {
    vi.useFakeTimers();
    mocks.onAuthStateChange.mockImplementation((callback) => {
      callback('INITIAL_SESSION', session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity.mockReturnValue(new Promise(() => {}));
    mount();

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(10_000);
    });

    expect(mocks.getIdentity).toHaveBeenCalledTimes(1);
    expect(screen.getByText('error')).toBeTruthy();
  });

  it('clears the persisted session when the API rejects its token', async () => {
    let emit: ((event: string, value: Session | null) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { ApiProblem } = await import('@/lib/api');
    mocks.getIdentity.mockRejectedValue(new ApiProblem(401, 'UNAUTHORIZED', 'Token expired'));
    mocks.signOut.mockImplementation(async () => {
      emit?.('SIGNED_OUT', null);
      return { error: null };
    });
    mount();

    await act(async () => emit?.('INITIAL_SESSION', session));

    expect(screen.getByText('signed_out')).toBeTruthy();
    expect(screen.getByText('Sesi berakhir. Login kembali.')).toBeTruthy();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('recovers automatically after a temporary network failure without clearing the session', async () => {
    vi.useFakeTimers();
    const { ApiProblem } = await import('@/lib/api');
    mocks.onAuthStateChange.mockImplementation((callback) => {
      callback('INITIAL_SESSION', session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity
      .mockRejectedValueOnce(new ApiProblem(0, 'NETWORK_ERROR', 'Koneksi ke server gagal.'))
      .mockResolvedValue(profile);
    mount();
    await act(async () => {});
    expect(screen.getByText('error')).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText('ready')).toBeTruthy();
    expect(mocks.getIdentity).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('bounds automatic retries when the API remains unavailable', async () => {
    vi.useFakeTimers();
    const { ApiProblem } = await import('@/lib/api');
    mocks.onAuthStateChange.mockImplementation((callback) => {
      callback('INITIAL_SESSION', session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity.mockRejectedValue(new ApiProblem(503, 'UNAVAILABLE', 'Coba lagi.'));
    mount();
    await act(async () => {});
    for (let attempt = 0; attempt < 8; attempt++) {
      await act(async () => vi.advanceTimersByTimeAsync(Math.min(2000 * 2 ** attempt, 30_000)));
    }
    expect(mocks.getIdentity).toHaveBeenCalledTimes(9);
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(mocks.getIdentity).toHaveBeenCalledTimes(9);
    expect(screen.getByText('error')).toBeTruthy();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('does not retry an authorization denial or retry after unmount', async () => {
    vi.useFakeTimers();
    const { ApiProblem } = await import('@/lib/api');
    mocks.onAuthStateChange.mockImplementation((callback) => {
      callback('INITIAL_SESSION', session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity.mockRejectedValue(new ApiProblem(403, 'ACCOUNT_DISABLED', 'Disabled'));
    mount();
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText('disabled')).toBeTruthy();
    expect(mocks.getIdentity).toHaveBeenCalledTimes(1);
    cleanup();

    mocks.getIdentity.mockRejectedValue(new ApiProblem(0, 'NETWORK_ERROR', 'Network'));
    mount();
    await act(async () => {});
    cleanup();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.getIdentity).toHaveBeenCalledTimes(2);
  });

  it('does not show the previous account when sessions change before identity loads', async () => {
    let emit: ((event: string, value: Session | null) => void) | undefined;
    let finishPrevious: ((value: typeof profile) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.getIdentity.mockImplementation((token: string) =>
      token === 'old-token'
        ? new Promise((resolve) => {
            finishPrevious = resolve;
          })
        : Promise.resolve({
            ...profile,
            id: 'teacher-id',
            role: 'TEACHER',
            email: 'teacher@example.test',
          }),
    );
    mount();

    await act(async () => emit?.('INITIAL_SESSION', { access_token: 'old-token' } as Session));
    await act(async () => emit?.('SIGNED_IN', { access_token: 'new-token' } as Session));
    expect(await screen.findByText('teacher@example.test')).toBeTruthy();

    await act(async () => finishPrevious?.(profile));
    expect(screen.queryByText('student@example.test')).toBeNull();
    expect(screen.getByText('teacher@example.test')).toBeTruthy();
  });
});
