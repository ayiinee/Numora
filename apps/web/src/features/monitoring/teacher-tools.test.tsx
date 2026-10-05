import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { apiRequest } from '@/lib/api';
import { TeacherAssessmentHistory } from './teacher-assessment-history';
import { TeacherInviteContent } from './teacher-class-tools';

vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), apiRequest: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('withholds a pending IRT score, preserves zero and follows the server history cursor', async () => {
  const record = {
    activity: 'drill',
    title: 'Latihan Aljabar',
    isDemo: false,
    submittedAt: '2026-10-04T02:00:00Z',
    resultState: 'ready',
    score: 0,
  };
  vi.mocked(apiRequest)
    .mockResolvedValueOnce({
      records: [
        { ...record, attemptId: 'r-1' },
        {
          ...record,
          attemptId: 'r-2',
          activity: 'tryout',
          title: 'Tryout Mingguan',
          resultState: 'waitingIrt',
          score: 97,
        },
      ],
      nextCursor: 'r-2',
    })
    .mockResolvedValueOnce({
      records: [{ ...record, attemptId: 'r-3', title: 'Latihan berikutnya' }],
      nextCursor: null,
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TeacherAssessmentHistory token="teacher-test" classId="class-1" studentId="student-1" />
    </QueryClientProvider>,
  );
  await screen.findByText('Menunggu IRT');
  expect(screen.queryByText('97')).toBeNull();
  expect(screen.getByText('0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Muat asesmen sebelumnya' }));
  await screen.findByText('Latihan berikutnya');
  expect(apiRequest).toHaveBeenLastCalledWith(
    'classes/class-1/students/student-1/assessment-results?cursor=r-2',
    'teacher-test',
  );
});

it('generates and copies QR from the exact class code and exposes the generated PNG download', async () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  vi.mocked(QRCode.toDataURL).mockImplementation(async () => image);
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  render(<TeacherInviteContent name="IX A" code="Ab_cd-234" />);
  await screen.findByRole('img', { name: 'QR kode kelas IX A' });
  expect(QRCode.toDataURL).toHaveBeenCalledWith(
    'Ab_cd-234',
    expect.objectContaining({ margin: 4 }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Salin kode' }));
  await screen.findByText('Kode kelas disalin.');
  expect(copy).toHaveBeenCalledWith('Ab_cd-234');
  expect(screen.getByRole('link', { name: 'Unduh PNG QR' }).getAttribute('href')).toBe(image);
});
