import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackDto, FeedbackListDto } from '@/lib/generated-api-types';
import type { AssessmentRecordDto } from '@/features/core-learning/generated-types';
import { StudentAccess } from '@/features/core-learning/student-session';
import { FeedbackOverview } from '@/features/core-learning/feedback-overview';
import { LearningApiError, request } from '../core-learning/api';
import { destination } from '@/features/onboarding/destination';
import { feedbackApi } from './api';
import { StudentFeedbackScreen } from './student-inbox';
import { TeacherFeedbackScreen } from './teacher-feedback';

const context = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  pathname: '/student/feedback',
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => context.pathname,
  useRouter: () => ({ replace: context.replace, push: context.push }),
  useParams: () => ({}),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: context.state, refresh: context.refresh, logout: context.logout }),
  destination: (profile: Parameters<typeof destination>[0]) => destination(profile),
}));
vi.mock('../core-learning/api', async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
}));
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  feedbackApi: {
    send: vi.fn(),
    teacherList: vi.fn(),
    teacherHistory: vi.fn(),
    studentList: vi.fn(),
    markRead: vi.fn(),
  },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const studentProfile = {
  id: 'student-test',
  role: 'STUDENT',
  displayName: 'Siswa Fiktif',
  email: 'test@example.invalid',
  studentAffiliation: 'MANDIRI',
  status: 'ACTIVE',
  teacherVerified: null,
};
const teacherProfile = {
  ...studentProfile,
  id: 'teacher-test',
  role: 'TEACHER',
  displayName: 'Bu Fiktif',
  studentAffiliation: null,
  teacherVerified: true,
};

function note(overrides: Partial<FeedbackDto> = {}): FeedbackDto {
  return {
    id: 'note-1',
    classId: 'class-test',
    studentId: 'student-test',
    teacherName: 'Bu Fiktif',
    body: 'Nilai pecahanmu naik, pertahankan.',
    sentAt: '2026-10-01T04:30:00.000Z',
    readAt: null,
    ...overrides,
  };
}
function record(overrides: Partial<AssessmentRecordDto> = {}): AssessmentRecordDto {
  return {
    attemptId: 'attempt-1',
    activity: 'drill',
    title: 'Pecahan Level 1',
    isDemo: false,
    submittedAt: '2026-10-01T03:00:00.000Z',
    resultState: 'ready',
    score: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  context.pathname = '/student/feedback';
  context.state = {
    status: 'ready',
    profile: studentProfile,
    session: { access_token: 'test-token' },
  };
  vi.mocked(feedbackApi.studentList).mockResolvedValue({ items: [note()], nextOffset: null });
  vi.mocked(feedbackApi.teacherList).mockResolvedValue({ items: [note()], nextOffset: null });
  vi.mocked(feedbackApi.teacherHistory).mockResolvedValue({
    records: [record()],
    nextCursor: null,
  });
  vi.mocked(feedbackApi.send).mockResolvedValue({ id: 'note-1' });
  vi.mocked(feedbackApi.markRead).mockResolvedValue({
    id: 'note-1',
    readAt: '2026-10-01T06:00:00.000Z',
  });
  vi.mocked(request).mockResolvedValue({ unreadCount: 1, latest: [] });
});
afterEach(cleanup);

function renderInbox() {
  return render(
    <StudentAccess>
      <StudentFeedbackScreen />
    </StudentAccess>,
  );
}

describe('Student inbox', () => {
  it('shows a loading state before claiming the inbox is empty', () => {
    vi.mocked(feedbackApi.studentList).mockImplementation(
      () => new Promise<FeedbackListDto>(() => {}),
    );
    renderInbox();
    expect(screen.getAllByLabelText('Memuat data').length).toBeGreaterThan(0);
    expect(screen.queryByText('Belum ada catatan')).toBeNull();
  });

  it('lists each note with its sender and read state', async () => {
    vi.mocked(feedbackApi.studentList).mockResolvedValue({
      items: [
        note(),
        note({ id: 'note-2', body: 'Ayo perbaiki perkalian.', readAt: '2026-10-02T06:00:00.000Z' }),
      ],
      nextOffset: null,
    });
    renderInbox();
    expect(await screen.findByText('Bu Fiktif · Belum dibaca')).toBeTruthy();
    expect(screen.getByText('Ayo perbaiki perkalian.')).toBeTruthy();
    expect(screen.getAllByText(/Dibaca /).length).toBeGreaterThan(0);
  });

  it('renders a note body as text, never as markup', async () => {
    vi.mocked(feedbackApi.studentList).mockResolvedValue({
      items: [note({ body: '<script>Pesan Guru</script>' })],
      nextOffset: null,
    });
    renderInbox();
    expect(await screen.findByText('<script>Pesan Guru</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });

  it('stores the read state and refreshes the dashboard preview', async () => {
    let opened = false;
    vi.mocked(feedbackApi.markRead).mockImplementation(() => {
      opened = true;
      return Promise.resolve({ id: 'note-1', readAt: '2026-10-01T06:00:00.000Z' });
    });
    vi.mocked(feedbackApi.studentList).mockImplementation(() =>
      Promise.resolve({
        items: [opened ? note({ readAt: '2026-10-01T06:00:00.000Z' }) : note()],
        nextOffset: null,
      }),
    );
    vi.mocked(request).mockImplementation(() =>
      Promise.resolve({ unreadCount: opened ? 0 : 1, latest: [] }),
    );
    render(
      <StudentAccess>
        <StudentFeedbackScreen />
        <FeedbackOverview token="test-token" />
      </StudentAccess>,
    );

    expect(await screen.findByText('1 catatan belum dibaca.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tandai sudah dibaca' }));
    await waitFor(() => expect(feedbackApi.markRead).toHaveBeenCalledWith('test-token', 'note-1'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Tandai sudah dibaca' })).toBeNull(),
    );
    await screen.findByText('0 catatan belum dibaca.');
    expect(screen.getByText('Bu Fiktif')).toBeTruthy();
  });

  it('loads the next page from the offset the server returns', async () => {
    vi.mocked(feedbackApi.studentList)
      .mockResolvedValueOnce({ items: [note()], nextOffset: 20 })
      .mockResolvedValueOnce({
        items: [note({ id: 'note-2', body: 'Catatan lama' })],
        nextOffset: null,
      });
    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Muat catatan lain' }));
    expect(await screen.findByText('Catatan lama')).toBeTruthy();
    expect(screen.getByText('Nilai pecahanmu naik, pertahankan.')).toBeTruthy();
    expect(vi.mocked(feedbackApi.studentList).mock.calls[1]![1]).toBe(20);
  });

  it('shows an authorization failure instead of an empty inbox', async () => {
    vi.mocked(feedbackApi.studentList).mockRejectedValue(
      new LearningApiError('Akses akun aktif dan peran yang sesuai diperlukan.', 403, 'FORBIDDEN'),
    );
    renderInbox();
    expect(await screen.findByText('Akses ditolak')).toBeTruthy();
    expect(screen.queryByText('Belum ada catatan')).toBeNull();
  });

  it('reports a failed read without hiding the note', async () => {
    vi.mocked(feedbackApi.markRead).mockRejectedValue(
      new LearningApiError('Sesi berakhir. Coba masuk kembali.', 401),
    );
    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Tandai sudah dibaca' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Sesi berakhir');
    expect(screen.getByText('Nilai pecahanmu naik, pertahankan.')).toBeTruthy();
  });

  it('offers no reply control because feedback is one-way', async () => {
    renderInbox();
    await screen.findByText('Bu Fiktif · Belum dibaca');
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /balas/i })).toBeNull();
  });
});

describe('Teacher feedback', () => {
  beforeEach(() => {
    context.pathname = '/teacher/classes/class-test/students/student-test';
    context.state = {
      status: 'ready',
      profile: teacherProfile,
      session: { access_token: 'teacher-token' },
    };
  });

  function renderPanel() {
    return render(
      <TeacherFeedbackScreen
        classId="class-test"
        studentId="student-test"
        studentName="Siswa Fiktif"
      />,
    );
  }

  it('sends one note under a single client request identity', async () => {
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Catatan untuk siswa'), {
      target: { value: 'Kerja bagus.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim catatan' }));

    await waitFor(() => expect(feedbackApi.send).toHaveBeenCalledTimes(1));
    const body = vi.mocked(feedbackApi.send).mock.calls[0]![3];
    expect(body).toEqual({ clientRequestId: expect.stringMatching(UUID), body: 'Kerja bagus.' });
    expect(await screen.findByText('Catatan terkirim.')).toBeTruthy();
    await waitFor(() => expect(feedbackApi.teacherList).toHaveBeenCalledTimes(2));
  });

  it('reuses the same identity when an unchanged send is retried', async () => {
    vi.mocked(feedbackApi.send)
      .mockRejectedValueOnce(new LearningApiError('Layanan menolak permintaan.', 400))
      .mockResolvedValue({ id: 'note-1' });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Catatan untuk siswa'), {
      target: { value: 'Tetap semangat.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim catatan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kirim ulang catatan' }));

    await waitFor(() => expect(feedbackApi.send).toHaveBeenCalledTimes(2));
    expect(vi.mocked(feedbackApi.send).mock.calls[1]![3]).toEqual(
      vi.mocked(feedbackApi.send).mock.calls[0]![3],
    );
  });

  it('uses a new identity once the teacher edits the note', async () => {
    vi.mocked(feedbackApi.send).mockRejectedValue(new LearningApiError('Layanan menolak.', 400));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Catatan untuk siswa'), {
      target: { value: 'Tetap semangat.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim catatan' }));
    await screen.findByRole('button', { name: 'Kirim ulang catatan' });

    fireEvent.change(screen.getByLabelText('Catatan untuk siswa'), {
      target: { value: 'Tetap semangat dan ulangi bab dua.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim catatan' }));
    await waitFor(() => expect(feedbackApi.send).toHaveBeenCalledTimes(2));

    const first = vi.mocked(feedbackApi.send).mock.calls[0]![3];
    const second = vi.mocked(feedbackApi.send).mock.calls[1]![3];
    expect(second.clientRequestId).not.toBe(first.clientRequestId);
    expect(second.body).toBe('Tetap semangat dan ulangi bab dua.');
  });

  it('refuses to send a blank note', async () => {
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Catatan untuk siswa'), {
      target: { value: '    ' },
    });
    expect(
      (screen.getByRole('button', { name: 'Kirim catatan' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(feedbackApi.send).not.toHaveBeenCalled();
  });

  it('shows the server conflict for a reused send identity', async () => {
    vi.mocked(feedbackApi.send).mockRejectedValue(
      new LearningApiError('ID pengiriman sudah digunakan untuk feedback lain.', 409),
    );
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Catatan untuk siswa'), {
      target: { value: 'Kerja bagus.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim catatan' }));
    expect(
      await screen.findByText('ID pengiriman sudah digunakan untuk feedback lain.'),
    ).toBeTruthy();
  });

  it('lists sent notes with their read state', async () => {
    vi.mocked(feedbackApi.teacherList).mockResolvedValue({
      items: [note(), note({ id: 'note-2', readAt: '2026-10-02T06:00:00.000Z' })],
      nextOffset: null,
    });
    renderPanel();
    expect((await screen.findAllByText(/Belum dibaca/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dibaca /).length).toBeGreaterThan(0);
  });

  it('shows an empty note list and an empty history without hiding either', async () => {
    vi.mocked(feedbackApi.teacherList).mockResolvedValue({ items: [], nextOffset: null });
    vi.mocked(feedbackApi.teacherHistory).mockResolvedValue({ records: [], nextCursor: null });
    renderPanel();
    expect(await screen.findByText('Belum ada catatan terkirim')).toBeTruthy();
    expect(screen.getByText('Belum ada hasil asesmen')).toBeTruthy();
  });

  it('keeps a real score of zero and labels a pending IRT result', async () => {
    vi.mocked(feedbackApi.teacherHistory).mockResolvedValue({
      records: [
        record(),
        record({
          attemptId: 'attempt-2',
          activity: 'tryout',
          title: 'Paket Tryout minggu ini',
          resultState: 'waitingIrt',
          score: null,
        }),
      ],
      nextCursor: null,
    });
    renderPanel();
    expect(await screen.findByText('0')).toBeTruthy();
    expect(screen.getByText('Menunggu hasil')).toBeTruthy();
    expect(screen.getByText('Pecahan Level 1')).toBeTruthy();
  });

  it('loads the next history page through the cursor the server returns', async () => {
    vi.mocked(feedbackApi.teacherHistory)
      .mockResolvedValueOnce({ records: [record()], nextCursor: 'attempt-1' })
      .mockResolvedValueOnce({
        records: [record({ attemptId: 'attempt-2', title: 'Bilangan Bulat Level 3' })],
        nextCursor: null,
      });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Muat riwayat lain' }));
    expect(await screen.findByText('Bilangan Bulat Level 3')).toBeTruthy();
    expect(screen.getByText('Pecahan Level 1')).toBeTruthy();
    expect(vi.mocked(feedbackApi.teacherHistory).mock.calls[1]![3]).toBe('attempt-1');
  });

  it('stops at the class the teacher opened when the server denies access', async () => {
    vi.mocked(feedbackApi.teacherList).mockRejectedValue(
      new LearningApiError(
        'Siswa kelas yang berhak tidak ditemukan.',
        404,
        'FEEDBACK_RECIPIENT_NOT_FOUND',
      ),
    );
    renderPanel();
    expect(await screen.findByText('Tidak ditemukan')).toBeTruthy();
    expect(vi.mocked(feedbackApi.teacherList).mock.calls[0]![1]).toBe('class-test');
  });

  it('does not load teacher feedback data for a student account', async () => {
    context.state = {
      status: 'ready',
      profile: studentProfile,
      session: { access_token: 'test-token' },
    };
    render(<TeacherFeedbackScreen classId="class-test" studentId="student-test" />);
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/student'));
    expect(feedbackApi.teacherList).not.toHaveBeenCalled();
    expect(feedbackApi.send).not.toHaveBeenCalled();
  });
});
