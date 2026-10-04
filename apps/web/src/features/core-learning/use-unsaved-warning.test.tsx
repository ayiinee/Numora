import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useUnsavedWarning } from './use-unsaved-warning';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('lets the question navigator move within the document while protecting route changes', () => {
  function Session() {
    useUnsavedWarning(true);
    return (
      <>
        <a href="#practice-navigator">Semua Soal</a>
        <a href="/student/learn">Keluar</a>
      </>
    );
  }
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Session />);
  fireEvent.click(screen.getByRole('link', { name: 'Semua Soal' }));
  expect(confirm).not.toHaveBeenCalled();
  const exit = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByRole('link', { name: 'Keluar' }).dispatchEvent(exit);
  expect(confirm).toHaveBeenCalledOnce();
  expect(exit.defaultPrevented).toBe(true);
});
