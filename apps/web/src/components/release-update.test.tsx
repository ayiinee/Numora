import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReleaseUpdateProvider, useBlockReleaseReload } from './release-update';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('detects the next release and waits for protected activity to finish', async () => {
  vi.useFakeTimers();
  const fetchVersion = vi.fn().mockResolvedValueOnce(Response.json({ release: 'current' }));
  fetchVersion.mockRejectedValueOnce(new Error('Web restart'));
  fetchVersion.mockResolvedValue(Response.json({ release: 'next' }));
  vi.stubGlobal('fetch', fetchVersion);

  function Assessment({ pending }: { pending: boolean }) {
    useBlockReleaseReload(pending);
    return null;
  }
  const screenFor = (pending: boolean) => (
    <ReleaseUpdateProvider release="current">
      <Assessment pending={pending} />
    </ReleaseUpdateProvider>
  );

  const view = render(screenFor(true));
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Muat ulang' })).toBeNull();

  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(screen.queryByRole('button', { name: 'Muat ulang' })).toBeNull();

  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  const reload = screen.getByRole<HTMLButtonElement>('button', { name: 'Muat ulang' });
  expect(reload.disabled).toBe(true);
  expect(fetchVersion).toHaveBeenLastCalledWith(
    '/release-version',
    expect.objectContaining({ cache: 'no-store' }),
  );

  view.rerender(screenFor(false));
  expect(reload.disabled).toBe(false);
});
