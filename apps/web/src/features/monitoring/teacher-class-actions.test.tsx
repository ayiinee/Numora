import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TeacherClassActions, TeacherTakeover } from './teacher-class-actions';
import { TeacherSchoolMemberships } from './teacher-school-memberships';
import {
  getBannedClassStudents,
  setClassStudentBan,
  takeoverClass,
  getTeacherMemberships,
  leaveTeacherSchool,
} from '@/lib/api';

const auth = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  getBannedClassStudents: vi.fn(),
  setClassStudentBan: vi.fn(),
  takeoverClass: vi.fn(),
  getTeacherMemberships: vi.fn(),
  leaveTeacherSchool: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
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
});
afterEach(cleanup);
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
function expand(label: string) {
  const details = screen.getByText(label).closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}
it('requires confirmation and preserves the ban action after failure, then exposes unban without rejoining', async () => {
  vi.mocked(getBannedClassStudents).mockResolvedValue({
    class: { id: 'class', name: 'IX A' },
    items: [{ id: 'banned', displayName: 'Bima' }],
  });
  vi.mocked(setClassStudentBan)
    .mockRejectedValueOnce(new Error('Akses ditolak'))
    .mockResolvedValue({ banned: true });
  const cache = mount(
    <TeacherClassActions
      token="teacher"
      classId="class"
      students={[{ id: 'active', displayName: 'Nisa' }]}
    />,
  );
  cache.setQueryData(['student-progress', 'class', 'active'], { private: true });
  fireEvent.click(screen.getByRole('button', { name: 'Kelola anggota' }));
  fireEvent.change(screen.getByLabelText('Siswa aktif untuk diblokir'), {
    target: { value: 'active' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Blokir siswa' }));
  expect(setClassStudentBan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi perubahan akses' }));
  await screen.findByText('Akses ditolak');
  fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi perubahan akses' }));
  await screen.findByText('Siswa diblokir dari kelas. Riwayat akun tetap tersimpan.');
  expect(setClassStudentBan).toHaveBeenLastCalledWith('teacher', 'class', 'active', true);
  expect(cache.getQueryData(['student-progress', 'class', 'active'])).toBeUndefined();
  fireEvent.click(screen.getByRole('tab', { name: 'Diblokir' }));
  await screen.findByRole('option', { name: 'Bima' });
  fireEvent.change(screen.getByLabelText('Siswa yang diblokir'), { target: { value: 'banned' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buka blokir' }));
  fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi perubahan akses' }));
  await screen.findByText(/Blokir dibuka/);
  expect(setClassStudentBan).toHaveBeenLastCalledWith('teacher', 'class', 'banned', false);
});
it('keeps takeover input after a rejection and refreshes owned classes after success', async () => {
  vi.mocked(takeoverClass)
    .mockRejectedValueOnce(new Error('Masih memiliki guru'))
    .mockResolvedValue({ id: 'class', name: 'IX A', joinCode: 'QA2345' });
  const cache = mount(<TeacherTakeover token="teacher" />);
  const invalidate = vi.spyOn(cache, 'invalidateQueries');
  expand('Ambil alih kelas tanpa guru');
  fireEvent.change(screen.getByLabelText(/Kode kelas yang diambil alih/), {
    target: { value: 'QA2345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ambil alih kelas' }));
  await screen.findByText('Masih memiliki guru');
  expect(screen.getByDisplayValue('QA2345')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ambil alih kelas' }));
  await screen.findByText('Kelas IX A sekarang Anda dampingi.');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['teacher-classes'] });
});
it('leaves only the selected school after confirmation and clears monitoring cache', async () => {
  vi.mocked(getTeacherMemberships).mockResolvedValue({
    items: [
      { id: 'school-a', name: 'Sekolah A' },
      { id: 'school-b', name: 'Sekolah B' },
    ],
  });
  vi.mocked(leaveTeacherSchool).mockResolvedValue({ left: true });
  const cache = mount(<TeacherSchoolMemberships token="teacher" />);
  cache.setQueryData(['student-progress', 'class', 'student'], { private: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Keluar dari Sekolah B' }));
  expect(leaveTeacherSchool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi keluar sekolah' }));
  await waitFor(() => expect(auth.refresh).toHaveBeenCalledOnce());
  expect(leaveTeacherSchool).toHaveBeenCalledWith('teacher', 'school-b');
  expect(cache.getQueryData(['student-progress', 'class', 'student'])).toBeUndefined();
});
