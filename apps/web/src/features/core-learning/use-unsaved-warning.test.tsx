import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUnsavedWarning } from './use-unsaved-warning';
import { AssessmentExitDialog } from './assessment-presentation';

beforeEach(() => {
  window.history.replaceState({ fixture: true }, '', '/student/drill/attempt');
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function Session({
  active = true,
  unsaved = false,
  onExit = vi.fn(),
  onNavigate = vi.fn(),
}: {
  active?: boolean;
  unsaved?: boolean;
  onExit?: () => void;
  onNavigate?: () => void;
}) {
  const exit = useUnsavedWarning(unsaved, active, onExit, { customDialog: true });
  return (
    <>
      <a href="#practice-navigator">Semua Soal</a>
      <a
        href="/student/learn"
        onClick={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        Keluar
      </a>
      <AssessmentExitDialog {...exit} />
    </>
  );
}

it('lets the question navigator move within the document and opens a custom dialog for exit', () => {
  const confirm = vi.spyOn(window, 'confirm');
  render(<Session />);
  fireEvent.click(screen.getByRole('link', { name: 'Semua Soal' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Keluar' }));
  expect(screen.getByRole('dialog', { name: 'Jeda latihan dulu?' })).toBeTruthy();
  expect(screen.getByText(/Timer akan dijeda/)).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
});

it('pauses and follows the original link only after confirmation', () => {
  const onExit = vi.fn();
  const onNavigate = vi.fn();
  render(<Session onExit={onExit} onNavigate={onNavigate} />);
  fireEvent.click(screen.getByRole('link', { name: 'Keluar' }));
  expect(onExit).not.toHaveBeenCalled();
  expect(onNavigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ya, keluar dulu' }));
  expect(onExit).toHaveBeenCalledOnce();
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('continues the attempt on cancellation or Escape and preserves unsaved warnings', () => {
  const onExit = vi.fn();
  render(<Session unsaved onExit={onExit} />);
  fireEvent.click(screen.getByRole('link', { name: 'Keluar' }));
  expect(screen.getByText(/Perubahan terakhir belum tersimpan/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lanjut mengerjakan' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Keluar' }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onExit).not.toHaveBeenCalled();
});

it('protects browser unload until the attempt completes', () => {
  const view = render(<Session />);
  const protectedUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(protectedUnload);
  expect(protectedUnload.defaultPrevented).toBe(true);
  view.rerender(<Session active={false} />);
  const completedUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(completedUnload);
  expect(completedUnload.defaultPrevented).toBe(false);
});

it('restores the attempt on browser back and only leaves after approval', () => {
  const onExit = vi.fn();
  render(<Session onExit={onExit} />);
  window.history.replaceState({}, '', '/student/learn');
  fireEvent.popState(window);
  expect(window.location.pathname).toBe('/student/drill/attempt');
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Lanjut mengerjakan' }));
  expect(window.location.pathname).toBe('/student/drill/attempt');
  window.history.replaceState({}, '', '/student/learn');
  fireEvent.popState(window);
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Ya, keluar dulu' }));
  expect(back).toHaveBeenCalledOnce();
  expect(onExit).toHaveBeenCalledOnce();
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
  window.history.replaceState({}, '', '/teacher/classes/c/students/s?tab=progress');
  fireEvent.popState(window);
  expect(confirm).not.toHaveBeenCalled();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByRole('link', { name: 'Kembali ke kelas' }).dispatchEvent(event);
  expect(confirm).toHaveBeenCalledWith('Catatan belum dikirim.');
  expect(event.defaultPrevented).toBe(true);
  window.history.replaceState({}, '', '/teacher/classes/c');
  fireEvent.popState(window);
  expect(window.location.pathname).toBe('/teacher/classes/c/students/s');
  expect(window.location.search).toBe('?tab=progress');
  confirm.mockReturnValue(true);
  window.history.replaceState({}, '', '/teacher/classes/c');
  fireEvent.popState(window);
  expect(window.location.pathname).toBe('/teacher/classes/c');
});
