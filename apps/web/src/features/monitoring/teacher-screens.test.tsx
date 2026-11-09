import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  TeacherDashboardScreen,
  ClassStudentsScreen,
  StudentProgressScreen,
} from './teacher-screens';
import { TeacherProfileScreen } from '@/features/onboarding/teacher-profile';
import {
  createTeacherClass,
  getTeacherClasses,
  getClassStudents,
  getTeacherStudentProgress,
  ApiProblem,
  apiRequest,
} from '@/lib/api';
import { getTeacherFeedback } from './teacher-feedback-api';

const auth = vi.hoisted(() => ({
  logout: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: auth.replace, push: auth.push }),
  usePathname: () => '/teacher',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: {
      status: 'ready',
      session: { access_token: 'test-teacher' },
      profile: {
        id: 'teacher-test',
        role: 'TEACHER',
        status: 'ACTIVE',
        teacherVerified: true,
        displayName: 'Guru fixture',
        email: 'teacher@example.test',
      },
    },
    logout: auth.logout,
    refresh: auth.refresh,
  }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  createTeacherClass: vi.fn(),
  getTeacherClasses: vi.fn(),
  getClassStudents: vi.fn(),
  getTeacherStudentProgress: vi.fn(),
  apiRequest: vi.fn(),
}));
vi.mock('./teacher-feedback-api', () => ({
  getTeacherFeedback: vi.fn(),
  sendTeacherFeedback: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/teacher');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.mocked(getTeacherClasses).mockResolvedValue({ items: [] });
  vi.mocked(getClassStudents).mockImplementation(async (_token, id) => ({
    class: { id, name: id },
    items: [],
  }));
  vi.mocked(getTeacherFeedback).mockResolvedValue({ items: [], nextOffset: null });
});

it('loads history and notes only on visit and retains a draft across URL-backed tabs', async () => {
  window.history.replaceState(
    null,
    '',
    '/teacher/classes/class-test/students/student-test?q=ayu&sort=desc',
  );
  vi.mocked(getTeacherStudentProgress).mockResolvedValue({
    class: { id: 'class-test', name: 'IX A' },
    student: { id: 'student-test', displayName: 'Ayu' },
    latestDrillScore: null,
    levels: [],
  });
  vi.mocked(apiRequest).mockResolvedValue({ records: [], nextCursor: null });
  render(<StudentProgressScreen classId="class-test" studentId="student-test" />);
  await screen.findByText('Progres dan hasil latihan');
  expect(getTeacherFeedback).not.toHaveBeenCalled();
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'Riwayat' }));
  await screen.findByText('Belum ada riwayat asesmen');
  expect(apiRequest).toHaveBeenCalledOnce();
  expect(getTeacherFeedback).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'Catatan' }));
  await screen.findByText('Belum ada catatan');
  fireEvent.change(screen.getByLabelText(/Catatan untuk siswa/), {
    target: { value: 'Periksa langkah kedua.' },
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Progres' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Catatan' }));
  expect(screen.getByLabelText(/Catatan untuk siswa/)).toHaveProperty(
    'value',
    'Periksa langkah kedua.',
  );
  expect(window.location.search).toContain('tab=notes');
  expect(window.location.search).toContain('sort=desc');
  expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe(
    '/teacher/classes/class-test?q=ayu&sort=desc',
  );
});
afterEach(cleanup);

it('retains rejected input, then opens the created class invitation without changing its identity', async () => {
  vi.mocked(createTeacherClass)
    .mockRejectedValueOnce(new ApiProblem(400, 'INVALID_CLASS', 'Kelas belum dapat dibuat.'))
    .mockResolvedValueOnce({ id: 'class-test', name: 'IX A', joinCode: 'Ab_Cd-234' });
  render(<TeacherDashboardScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buat kelas' }));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: ' IX A ' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe(' IX A ');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }));
  await waitFor(() => expect(auth.push).toHaveBeenCalledWith('/teacher/classes/class-test/invite'));
  expect(createTeacherClass).toHaveBeenLastCalledWith('test-teacher', 'IX A');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(getTeacherClasses).toHaveBeenCalledTimes(2));
});
it('keeps a pending create disabled and prevents another submit', async () => {
  vi.mocked(createTeacherClass).mockImplementation(() => new Promise(() => {}));
  render(<TeacherDashboardScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buat kelas' }));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: 'IX A' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }));
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Membuat/ }));
  expect(createTeacherClass).toHaveBeenCalledOnce();
});
it('provides a login destination after a create request reports an expired session', async () => {
  vi.mocked(createTeacherClass).mockRejectedValue(
    new ApiProblem(401, 'SESSION_EXPIRED', 'Sesi berakhir.'),
  );
  render(<TeacherDashboardScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buat kelas' }));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: 'IX A' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }));
  expect((await screen.findByRole('link', { name: 'Masuk kembali' })).getAttribute('href')).toBe(
    '/login',
  );
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe('IX A');
});
it.each([
  new ApiProblem(0, 'NETWORK_ERROR', 'Koneksi ke server gagal.'),
  new ApiProblem(408, 'REQUEST_TIMEOUT', 'Permintaan berakhir.'),
  new ApiProblem(500, 'SERVER_ERROR', 'Respons gagal setelah commit.'),
  new ApiProblem(503, 'UNAVAILABLE', 'Layanan belum tersedia.'),
  new Error('Respons tidak dapat dibaca.'),
])('reconciles an indeterminate create without inviting a blind retry: %s', async (failure) => {
  vi.mocked(createTeacherClass).mockRejectedValue(failure);
  render(<TeacherDashboardScreen />);
  await screen.findByRole('heading', { name: 'Kelas saya' });
  fireEvent.click(await screen.findByRole('button', { name: 'Buat kelas' }));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: 'IX Terputus' } });
  const initialCalls = vi.mocked(getTeacherClasses).mock.calls.length;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }));

  await screen.findByText(/Pengiriman tidak dapat dipastikan/);
  // The class may exist server-side, so the form must not offer the same name again.
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe('');
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat kelas' }),
  ).toHaveProperty('disabled', true);
  expect(createTeacherClass).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(vi.mocked(getTeacherClasses).mock.calls.length).toBeGreaterThan(initialCalls),
  );
});

it('filters and sorts names without mutating or replacing server identities', async () => {
  vi.mocked(getClassStudents).mockResolvedValue({
    class: { id: 'class-test', name: 'IX A' },
    items: [
      { id: 'z', displayName: 'Zara' },
      { id: 'a', displayName: 'Ayu' },
    ],
  });
  render(<ClassStudentsScreen classId="class-test" />);
  await screen.findByRole('link', { name: /Ayu/ });
  expect(screen.getAllByRole('link', { name: /Lihat progres/ })[0]?.getAttribute('href')).toContain(
    '/students/a',
  );
  fireEvent.change(screen.getByLabelText('Urutkan'), { target: { value: 'desc' } });
  expect(screen.getAllByRole('link', { name: /Lihat progres/ })[0]?.getAttribute('href')).toContain(
    '/students/z',
  );
  fireEvent.change(screen.getByLabelText('Cari siswa'), { target: { value: 'AYU' } });
  expect(screen.getAllByRole('link', { name: /Lihat progres/ })).toHaveLength(1);
  expect(getClassStudents).toHaveBeenCalledWith('test-teacher', 'class-test');
});
it('keeps the class search result and its no-match notice on the same rule', async () => {
  vi.mocked(getTeacherClasses).mockResolvedValue({
    items: [
      { id: 'c1', name: 'Kelas IX A', joinCode: 'AAAAAA' },
      { id: 'c2', name: 'Kelas Pendampingan', joinCode: 'BBBBBB' },
    ],
  });
  render(<TeacherDashboardScreen />);
  expect(await screen.findAllByRole('link', { name: /^Buka Kelas/ })).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Cari kelas'), { target: { value: 'pendampingan' } });
  expect(screen.getByText('Kelas Pendampingan')).toBeTruthy();
  expect(screen.queryByText('Kelas IX A')).toBeNull();
  expect(screen.queryByText('Kelas tidak ditemukan')).toBeNull();

  fireEvent.change(screen.getByLabelText('Cari kelas'), { target: { value: 'tidak-ada' } });
  expect(screen.getByText('Kelas tidak ditemukan')).toBeTruthy();
  expect(screen.queryAllByRole('link', { name: /^Buka Kelas/ })).toHaveLength(0);
});
it('preserves zero, distinct best/latest, null and authoritative access state as read-only values', async () => {
  vi.mocked(getTeacherStudentProgress).mockResolvedValue({
    class: { id: 'class-test', name: 'IX A' },
    student: { id: 'student-test', displayName: 'Ayu' },
    latestDrillScore: 0,
    levels: [
      {
        levelId: 'l1',
        chapterLabel: 'Aljabar',
        subchapterLabel: 'Persamaan',
        levelLabel: 'Level 1',
        accessStatus: 'UNLOCKED',
        inProgress: false,
        latestDrillScore: 0,
        bestDrillScore: 90,
      },
      {
        levelId: 'l2',
        chapterLabel: 'Aljabar',
        subchapterLabel: 'Persamaan',
        levelLabel: 'Level 2',
        accessStatus: 'LOCKED',
        inProgress: false,
        latestDrillScore: null,
        bestDrillScore: null,
      },
    ],
  });
  const { container } = render(
    <StudentProgressScreen classId="class-test" studentId="student-test" />,
  );
  await screen.findByText('Dari latihan terakhir yang dikumpulkan.');
  const levels = container.querySelectorAll('.teacher-level-card');
  expect(within(levels[0] as HTMLElement).getByText('0')).toBeTruthy();
  expect(within(levels[0] as HTMLElement).getByText('90')).toBeTruthy();
  expect(within(levels[1] as HTMLElement).getAllByText('—')).toHaveLength(2);
  expect(screen.getByText('Terkunci')).toBeTruthy();
  expect(container.querySelectorAll('input,select,textarea')).toHaveLength(0);
  expect(getTeacherStudentProgress).toHaveBeenCalledWith(
    'test-teacher',
    'class-test',
    'student-test',
  );
});
it('keeps the account available after logout failure and retries the existing logout handler', async () => {
  auth.logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  render(<TeacherProfileScreen />);
  fireEvent.click(screen.getByRole('button', { name: 'Keluar dari akun' }));
  await screen.findByRole('alert');
  expect(auth.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keluar dari akun' }));
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith('/login'));
  expect(auth.logout).toHaveBeenCalledTimes(2);
});

it('keeps independent class counts retryable without presenting memberships as unique students', async () => {
  vi.mocked(getTeacherClasses).mockResolvedValue({
    items: [
      { id: 'class-a', name: 'IX A' },
      { id: 'class-b', name: 'IX B' },
    ],
  });
  let failed = true;
  vi.mocked(getClassStudents).mockImplementation(async (_, classId) => {
    if (classId === 'class-b' && failed) throw new ApiProblem(503, 'UNAVAILABLE', 'Roster gagal.');
    return {
      class: { id: classId, name: classId },
      items: [{ id: classId + '-student', displayName: classId }],
    };
  });
  render(<TeacherDashboardScreen />);
  await screen.findByRole('button', { name: 'Muat ulang anggota IX B' }, { timeout: 4000 });
  expect(screen.queryByText('Siswa di kelas Anda')).toBeNull();
  expect(screen.getByText('1 siswa bergabung')).toBeTruthy();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Muat ulang anggota IX B' }));
  await waitFor(() => expect(screen.getAllByText('1 siswa bergabung')).toHaveLength(2));
});

it('re-checks identity instead of offering a retry that can never succeed once access is revoked', async () => {
  vi.mocked(getTeacherClasses).mockRejectedValue(
    new ApiProblem(403, 'SCHOOL_FORBIDDEN', 'Akses sekolah ditolak.'),
  );
  render(<TeacherDashboardScreen />);
  // LearningProvider retries a failed query once with a ~1s backoff, so the settled
  // error state appears after that window rather than on the first tick.
  await screen.findByText('Akses kelas Anda berakhir', {}, { timeout: 5000 });
  expect(screen.queryByRole('button', { name: 'Coba lagi' })).toBeNull();

  vi.mocked(getTeacherClasses).mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Periksa ulang akses' }));
  await waitFor(() => expect(auth.refresh).toHaveBeenCalledOnce());
  expect(getTeacherClasses).not.toHaveBeenCalled();
});
