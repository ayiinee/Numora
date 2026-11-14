import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecommendedVideos, ReportForm } from './support';
import { learningApi } from './api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Student support', () => {
  it('restores the modal trigger on cancel and focuses confirmation after a successful report', async () => {
    const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = true;
        },
      },
      close: {
        configurable: true,
        value: function (this: HTMLDialogElement) {
          this.open = false;
        },
      },
    });
    try {
      const submit = vi.fn().mockResolvedValue({ id: 'report' });
      render(<ReportForm modal label="Laporkan soal" submit={submit} />);
      const trigger = screen.getByRole('button', { name: 'Laporkan soal' });
      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
      expect(document.activeElement).toBe(trigger);
      expect(submit).not.toHaveBeenCalled();
      fireEvent.click(trigger);
      fireEvent.change(screen.getByLabelText('Jenis masalah'), { target: { value: 'TEST' } });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
      const confirmation = await screen.findByRole('status');
      await waitFor(() => expect(document.activeElement).toBe(confirmation));
      expect(submit).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      if (show) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', show);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });
  it('keeps failed reports retryable and confirms server success', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Koneksi terputus.'))
      .mockResolvedValueOnce({ id: 'report' });
    render(<ReportForm label="Laporkan soal" submit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Laporkan soal' }));
    fireEvent.change(screen.getByLabelText('Jenis masalah'), {
      target: { value: '  Kunci salah  ' },
    });
    fireEvent.change(screen.getByLabelText('Keterangan tambahan (opsional)'), {
      target: { value: '  Mohon tinjau.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Koneksi terputus.');
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ulang laporan' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Laporan terkirim untuk ditinjau Admin.',
    );
    expect(submit).toHaveBeenLastCalledWith('Kunci salah', 'Mohon tinjau.', expect.any(String));
    expect(submit.mock.calls[0]![2]).toBe(submit.mock.calls[1]![2]);
  });
  it('blocks duplicate submit while a report is pending', async () => {
    let complete!: (result: object) => void;
    const submit = vi.fn(
      () =>
        new Promise<object>((resolve) => {
          complete = resolve;
        }),
    );
    render(<ReportForm label="Laporkan soal" submit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Laporkan soal' }));
    fireEvent.change(screen.getByLabelText('Jenis masalah'), { target: { value: 'TEST' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Laporkan soal' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Laporkan soal' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Mengirim…' })).toHaveProperty('disabled', true);
    complete({ id: 'report' });
    await screen.findByRole('status');
  });
  it('uses a new request ID when a failed report is edited, then preserves it for retry', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network'))
      .mockRejectedValueOnce(new Error('Network'))
      .mockResolvedValueOnce({ id: 'report' });
    render(<ReportForm label="Laporkan soal" submit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Laporkan soal' }));
    fireEvent.change(screen.getByLabelText('Jenis masalah'), { target: { value: 'TEST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Keterangan tambahan (opsional)'), {
      target: { value: 'Edited issue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ulang laporan' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Kirim ulang laporan' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim ulang laporan' }));
    await screen.findByRole('status');
    expect(submit.mock.calls[0]![2]).not.toBe(submit.mock.calls[1]![2]);
    expect(submit.mock.calls[1]![2]).toBe(submit.mock.calls[2]![2]);
  });
  it('renders only server-provided videos and keeps an empty response unobtrusive', async () => {
    const videos = vi.spyOn(learningApi, 'videos').mockResolvedValueOnce({ items: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <RecommendedVideos token="TEST-token" attemptId="TEST-attempt" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByText('Mengambil data belajar…')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Video untuk melanjutkan belajar' })).toBeNull();
    videos.mockResolvedValue({
      items: [
        {
          mappingId: 'TEST-map',
          title: 'Video dari server',
          url: 'https://example.test/video',
          source: 'TEST',
        },
      ],
    });
    await client.invalidateQueries({ queryKey: ['drill-videos'] });
    expect(await screen.findByRole('link', { name: /Video dari server/ })).toHaveProperty(
      'href',
      'https://example.test/video',
    );
    expect(videos).toHaveBeenCalledWith('TEST-token', 'TEST-attempt');
    view.unmount();
  });
});
