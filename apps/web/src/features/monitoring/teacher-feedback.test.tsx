import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeedbackWorkspace } from './teacher-feedback';
import { getTeacherFeedback, sendTeacherFeedback } from './teacher-feedback-api';
import type { FeedbackDto } from '@/lib/generated-api-types';
import { ApiProblem } from '@/lib/api';

vi.mock('./teacher-feedback-api', () => ({
  getTeacherFeedback: vi.fn(),
  sendTeacherFeedback: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTeacherFeedback).mockResolvedValue({ items: [], nextOffset: null });
});
afterEach(cleanup);
function mount(studentId = 'student-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <FeedbackWorkspace
        token="teacher-test"
        classId="class-1"
        studentId={studentId}
        studentName="Ayu"
      />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

it('preserves a message and its idempotency UUID after a lost acknowledgement, then clears on success', async () => {
  vi.mocked(sendTeacherFeedback)
    .mockRejectedValueOnce(new Error('Koneksi terputus.'))
    .mockResolvedValueOnce({ id: 'feedback-id' });
  mount();
  fireEvent.change(screen.getByLabelText(/Pesan feedback/), {
    target: { value: '  Coba lagi\ndi level ini.  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kirim feedback' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText(/Pesan feedback/) as HTMLTextAreaElement).value).toBe(
    '  Coba lagi\ndi level ini.  ',
  );
  const request = vi.mocked(sendTeacherFeedback).mock.calls[0]![3];
  expect(request.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(request.body).toBe('Coba lagi\ndi level ini.');
  fireEvent.click(screen.getByRole('button', { name: 'Kirim feedback' }));
  await screen.findByText('Feedback berhasil dikirim kepada Ayu.');
  expect(vi.mocked(sendTeacherFeedback).mock.calls[1]![3]).toEqual(request);
  expect((screen.getByLabelText(/Pesan feedback/) as HTMLTextAreaElement).value).toBe('');
});

it('rejects blank text and prevents a second submit while delivery is pending', async () => {
  vi.mocked(sendTeacherFeedback).mockImplementation(() => new Promise(() => {}));
  mount();
  fireEvent.change(screen.getByLabelText(/Pesan feedback/), { target: { value: '   ' } });
  expect(
    (screen.getByRole('button', { name: 'Kirim feedback' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText(/Pesan feedback/), {
    target: { value: 'Terus berlatih.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kirim feedback' }));
  fireEvent.submit(screen.getByLabelText(/Pesan feedback/).closest('form')!);
  await waitFor(() => expect(sendTeacherFeedback).toHaveBeenCalledOnce());
  expect((screen.getByLabelText(/Pesan feedback/) as HTMLTextAreaElement).disabled).toBe(true);
});

it('paginates within the selected student and labels loaded counts rather than a fabricated total', async () => {
  const makeEntry = (index: number): FeedbackDto => ({
    id: `f-${index}`,
    classId: 'class-1',
    studentId: 'student-2',
    teacherName: 'Guru',
    body: `Catatan ${index}`,
    sentAt: '2026-10-04T02:00:00Z',
    readAt: index % 2 ? null : '2026-10-04T03:00:00Z',
  });
  vi.mocked(getTeacherFeedback)
    .mockResolvedValueOnce({
      items: Array.from({ length: 20 }, (_, i) => makeEntry(i)),
      nextOffset: 20,
    })
    .mockResolvedValueOnce({ items: [makeEntry(20)], nextOffset: null });
  mount('student-2');
  await screen.findByText('Catatan 0');
  expect(screen.getByText(/20 catatan dimuat/)).toBeTruthy();
  expect(screen.queryByLabelText('Status baca')).toBeNull();
  expect(screen.queryByText('Sudah dibaca')).toBeNull();
  expect(screen.queryByText('Belum dibaca')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Muat riwayat sebelumnya' }));
  await screen.findByText(/21 catatan dimuat/);
  expect(getTeacherFeedback).toHaveBeenLastCalledWith('teacher-test', 'class-1', 'student-2', 20);
  expect(screen.queryByRole('button', { name: 'Muat riwayat sebelumnya' })).toBeNull();
  expect(screen.getByText('Catatan 20')).toBeTruthy();
  expect(screen.getByText('Catatan 0')).toBeTruthy();
});

it('hides cached recipient history and composer after the session becomes unauthorized', async () => {
  vi.mocked(getTeacherFeedback).mockResolvedValueOnce({
    items: [
      {
        id: 'f-1',
        classId: 'class-1',
        studentId: 'student-1',
        teacherName: 'Guru',
        body: 'Catatan privat',
        sentAt: '2026-10-04T02:00:00Z',
        readAt: null,
      },
    ],
    nextOffset: null,
  });
  const { client } = mount();
  await screen.findByText('Catatan privat');
  vi.mocked(getTeacherFeedback).mockRejectedValue(new ApiProblem(401, 'EXPIRED', 'Sesi berakhir.'));
  void client.invalidateQueries({ queryKey: ['teacher-feedback'] });
  await screen.findByRole('heading', { name: 'Sesi berakhir' });
  expect(screen.queryByText('Catatan privat')).toBeNull();
  expect(screen.queryByLabelText(/Pesan feedback/)).toBeNull();
});
