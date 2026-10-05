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
} from '@/lib/api';

const auth = vi.hoisted(() => ({ logout: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: auth.replace }),
  usePathname: () => '/teacher',
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
  }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  createTeacherClass: vi.fn(),
  getTeacherClasses: vi.fn(),
  getClassStudents: vi.fn(),
  getTeacherStudentProgress: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTeacherClasses).mockResolvedValue({ items: [] });
});
afterEach(cleanup);

it('retries create without clearing input on failure and displays the exact server join code', async () => {
  vi.mocked(createTeacherClass)
    .mockRejectedValueOnce(new Error('Kelas belum dapat dibuat.'))
    .mockResolvedValueOnce({ id: 'class-test', name: 'IX A', joinCode: 'Ab_Cd-234' });
  render(<TeacherDashboardScreen />);
  fireEvent.click(screen.getByText('Buat kelas baru'));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: ' IX A ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buat kelas' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe(' IX A ');
  fireEvent.click(screen.getByRole('button', { name: 'Buat kelas' }));
  await screen.findByText('Ab_Cd-234');
  expect(createTeacherClass).toHaveBeenLastCalledWith('test-teacher', 'IX A');
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe('');
  await waitFor(() => expect(getTeacherClasses).toHaveBeenCalledTimes(2));
});
it('keeps a pending create disabled and prevents another submit', async () => {
  vi.mocked(createTeacherClass).mockImplementation(() => new Promise(() => {}));
  render(<TeacherDashboardScreen />);
  fireEvent.click(screen.getByText('Buat kelas baru'));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: 'IX A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buat kelas' }));
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Membuat/ }));
  expect(createTeacherClass).toHaveBeenCalledOnce();
});
it('provides a login destination after a create request reports an expired session', async () => {
  vi.mocked(createTeacherClass).mockRejectedValue(
    new ApiProblem(401, 'SESSION_EXPIRED', 'Sesi berakhir.'),
  );
  render(<TeacherDashboardScreen />);
  fireEvent.click(screen.getByText('Buat kelas baru'));
  fireEvent.change(screen.getByLabelText(/Nama kelas/), { target: { value: 'IX A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buat kelas' }));
  expect((await screen.findByRole('link', { name: 'Masuk kembali' })).getAttribute('href')).toBe(
    '/',
  );
  expect((screen.getByLabelText(/Nama kelas/) as HTMLInputElement).value).toBe('IX A');
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
  await screen.findByRole('heading', { name: '0' });
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
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith('/'));
  expect(auth.logout).toHaveBeenCalledTimes(2);
});

it('withholds total students when one class roster fails and recovers without a partial total', async () => {
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
  const label = await screen.findByText('Siswa di kelas Anda');
  await screen.findByRole('button', { name: 'Muat ulang jumlah siswa' }, { timeout: 4000 });
  expect(label.parentElement?.querySelector('strong')?.textContent).toBe('—');
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Muat ulang jumlah siswa' }));
  await waitFor(() => expect(label.parentElement?.querySelector('strong')?.textContent).toBe('2'));
});
