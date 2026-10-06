import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PretestCard } from './pretest';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function enableDialogs() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    },
  });
}

describe('Pretest chapter card', () => {
  it('allows Start after Skip and explains that Skip retains the completion opportunity', async () => {
    enableDialogs();
    const start = vi.fn().mockResolvedValue(undefined);
    render(<PretestCard chapterTitle="Bilangan" state="skipped" onStart={start} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lihat informasi' }));
    expect(screen.getByText(/Skip tidak menghabiskan kesempatan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Pretest' }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
  });
  it('allows Skip while an attempt remains resumable', async () => {
    const skip = vi.fn().mockResolvedValue(undefined);
    render(<PretestCard chapterTitle="Bilangan" state="inProgress" onResume={vi.fn()} onSkip={skip} />);
    expect(screen.getByRole('button', { name: 'Lanjutkan' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip untuk sekarang' }));
    await waitFor(() => expect(skip).toHaveBeenCalledOnce());
  });
  it('shows unavailable without simulating eligibility or allowing a start', () => {
    render(<PretestCard chapterTitle="Bilangan" state="unavailable" />);

    expect(screen.getByText('Belum tersedia')).toBeTruthy();
    expect(screen.getByText(/tetap bisa belajar dari materi/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mulai|skip/i })).toBeNull();
  });

  it('explains the one-time choice and invokes only the selected server action', async () => {
    enableDialogs();
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onSkip = vi.fn().mockResolvedValue(undefined);
    render(
      <PretestCard chapterTitle="Bilangan" state="available" onStart={onStart} onSkip={onSkip} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lihat informasi' }));
    expect(await screen.findByRole('dialog', { name: 'Pretest Bilangan' })).toBeTruthy();
    expect(screen.getByText(/tidak dapat diulang/i)).toBeTruthy();
    expect(screen.getByText(/Level 1 pada semua subbab/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mulai Pretest' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('shows action failures instead of reporting success', async () => {
    enableDialogs();
    render(
      <PretestCard
        chapterTitle="Bilangan"
        state="available"
        onStart={() => Promise.reject(new Error('Paket belum tersedia'))}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lihat informasi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mulai Pretest' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Paket belum tersedia');
  });

  it('routes Skip through its supplied action', async () => {
    enableDialogs();
    const onSkip = vi.fn().mockResolvedValue(undefined);
    render(
      <PretestCard chapterTitle="Bilangan" state="available" onStart={vi.fn()} onSkip={onSkip} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lihat informasi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip Pretest' }));

    await waitFor(() => expect(onSkip).toHaveBeenCalledOnce());
  });

  it('does not expose reattempt for a completed Pretest', () => {
    render(<PretestCard chapterTitle="Bilangan" state="completed" />);

    expect(screen.getByText('Pretest bab ini sudah selesai dan tidak dapat diulang.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mulai|skip/i })).toBeNull();
  });

  it('keeps existing progress explicit when score mapping is unavailable', () => {
    render(<PretestCard chapterTitle="Bilangan" state="mappingUnavailable" />);

    expect(screen.getByText(/Pemetaan hasil ke level belum tersedia/i)).toBeTruthy();
    expect(screen.getByText(/Level yang sudah terbuka tetap dipertahankan/i)).toBeTruthy();
  });
});
