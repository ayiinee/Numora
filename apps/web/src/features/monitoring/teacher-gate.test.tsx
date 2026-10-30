import { act, cleanup, render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TeacherGate } from './teacher-gate';

/**
 * AW-03 asks whether a previous Teacher's data can survive an account switch. The Teacher
 * screens are keyed on the signed-in profile id inside LearningProvider, which builds a
 * QueryClient per mount and clears it on unmount. These tests pin that chain so the cache
 * identity follows the Teacher, not the URL or the query key.
 */
const auth = vi.hoisted(() => ({ state: { status: 'loading' } as Record<string, unknown> }));
const counters = vi.hoisted(() => ({ mounted: 0, unmounted: 0 }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/teacher',
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, logout: vi.fn() }),
}));

function teacher(id: string) {
  auth.state = {
    status: 'ready',
    session: { access_token: `token-${id}` },
    profile: { id, role: 'TEACHER', status: 'ACTIVE', teacherVerified: true, displayName: 'Guru' },
  };
}

/** Reads the cache before writing, so a carried-over entry would be visible in the output. */
function CacheProbe({ marker }: { marker: string }) {
  const client = useQueryClient();
  const cached = client.getQueryCache().find({ queryKey: ['teacher-classes'] })?.state.data;
  const seenBefore = cached === undefined ? 'kosong' : String(cached);
  useEffect(() => {
    counters.mounted += 1;
    client.setQueryData(['teacher-classes'], marker);
    return () => {
      counters.unmounted += 1;
    };
  }, [client, marker]);
  return <p data-testid="seen">{seenBefore}</p>;
}

function Gate() {
  return (
    <TeacherGate>
      {(token) => (
        <div data-testid="gate-child">
          <CacheProbe marker={`kelas-${token}`} />
        </div>
      )}
    </TeacherGate>
  );
}

beforeEach(() => {
  counters.mounted = 0;
  counters.unmounted = 0;
});
afterEach(cleanup);

it('gives the next Teacher an empty query cache instead of the previous one', () => {
  teacher('teacher-a');
  const view = render(<Gate />);
  expect(screen.getByTestId('seen').textContent).toBe('kosong');

  act(() => {
    teacher('teacher-b');
    view.rerender(<Gate />);
  });

  // The first provider has to unmount and release its cache before the second reports.
  expect(counters.unmounted).toBe(1);
  expect(counters.mounted).toBe(2);
  expect(screen.getByTestId('seen').textContent).toBe('kosong');
});

it('releases the Teacher cache when the session ends', () => {
  teacher('teacher-a');
  const view = render(<Gate />);
  act(() => {
    auth.state = { status: 'signed_out' };
    view.rerender(<Gate />);
  });
  expect(counters.unmounted).toBe(1);
  expect(screen.queryByTestId('gate-child')).toBeNull();
});
