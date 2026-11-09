import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useUnsavedWarning } from './use-unsaved-warning';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps teacher tab navigation available but confirms leaving an unsent note', () => {
  window.history.replaceState(null, '', '/teacher/classes/c/students/s?tab=notes');
  function Notes() {
    useUnsavedWarning(true, false, undefined, {
      message: 'Catatan belum dikirim.',
      ignoreSearchChanges: true,
    });
    return (
      <>
        <a href="?tab=progress">Progres</a>
        <a href="/teacher/classes/c">Kembali ke kelas</a>
      </>
    );
  }
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Notes />);
  fireEvent.click(screen.getByRole('link', { name: 'Progres' }));
  expect(confirm).not.toHaveBeenCalled();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByRole('link', { name: 'Kembali ke kelas' }).dispatchEvent(event);
  expect(confirm).toHaveBeenCalledWith('Catatan belum dikirim.');
  expect(event.defaultPrevented).toBe(true);
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
it('confirms an unfinished Drill exit even with every answer saved', () => {
  function Session() {
    useUnsavedWarning(false, true);
    return <a href="/student/learn">Keluar</a>;
  }
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Session />);
  const exit = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByRole('link', { name: 'Keluar' }).dispatchEvent(exit);
  expect(exit.defaultPrevented).toBe(true);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Timer tetap berjalan'));
});
it('warns about unsaved changes in the same confirmation and removes guards after completion', () => {
  function Session({ active }: { active: boolean }) {
    useUnsavedWarning(active, active);
    return <a href="/student/learn">Keluar</a>;
  }
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(<Session active />);
  fireEvent.click(screen.getByRole('link', { name: 'Keluar' }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('belum tersimpan'));
  view.rerender(<Session active={false} />);
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
});
it('cancels browser back navigation and restores the attempt URL', () => {
  window.history.replaceState({ fixture: true }, '', '/student/drill/attempt');
  function Session() {
    useUnsavedWarning(false, true);
    return null;
  }
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Session />);
  window.history.replaceState({}, '', '/student/learn');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(window.location.pathname).toBe('/student/drill/attempt');
});
