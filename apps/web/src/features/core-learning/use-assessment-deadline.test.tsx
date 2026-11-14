import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAssessmentDeadline } from './use-assessment-deadline';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('anchors to server time and monotonic elapsed time, including device-clock changes and rehydration', () => {
  vi.useFakeTimers();
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
  const expire = vi.fn();
  const hook = renderHook(
    ({ server }) => useAssessmentDeadline('2026-10-02T00:01:00Z', expire, server),
    { initialProps: { server: '2026-10-02T00:00:00Z' } },
  );
  expect(hook.result.current.remaining).toBe(60);
  expect(expire).not.toHaveBeenCalled();
  act(() => {
    elapsed = 30_000;
    vi.advanceTimersByTime(250);
  });
  expect(hook.result.current.remaining).toBe(30);
  hook.rerender({ server: '2026-10-02T00:00:40Z' });
  expect(hook.result.current.remaining).toBe(20);
  act(() => {
    elapsed = 50_000;
    vi.advanceTimersByTime(250);
  });
  expect(hook.result.current.expired).toBe(true);
  expect(expire).toHaveBeenCalledOnce();
  act(() => {
    elapsed = 55_000;
    vi.advanceTimersByTime(1000);
  });
  expect(expire).toHaveBeenCalledOnce();
  hook.rerender({ server: '2026-10-02T00:00:59Z' });
  expect(hook.result.current.expired).toBe(true);
  hook.rerender({ server: '2026-10-02T00:01:01Z' });
  expect(expire).toHaveBeenCalledOnce();
});
it('does not auto-finalize without an authoritative clock reference', () => {
  const expire = vi.fn();
  const hook = renderHook(() => useAssessmentDeadline('2000-01-01T00:00:00Z', expire));
  expect(hook.result.current.remaining).toBeNull();
  expect(expire).not.toHaveBeenCalled();
});
