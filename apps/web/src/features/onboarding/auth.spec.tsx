import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './auth';

const mocks = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getIdentity: mocks.getIdentity,
  ApiProblem: class ApiProblem extends Error {},
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { onAuthStateChange: mocks.onAuthStateChange } }),
}));

function Status() {
  return <p>{useAuth().state.status}</p>;
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
});
