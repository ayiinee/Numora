import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiProblem } from '@/lib/api';
import { AdminOperationsScreen } from './operations';
import { getAdminClass, getAdminUser, listAdminClasses, listAdminUsers } from './operations-api';

const context = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/operations',
  useRouter: () => ({ replace: context.replace }),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: context.state, refresh: context.refresh }),
}));
vi.mock('./operations-api', () => ({
  getAdminClass: vi.fn(),
  getAdminUser: vi.fn(),
  listAdminClasses: vi.fn(),
  listAdminUsers: vi.fn(),
}));

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Siswa TEST',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
  createdAt: '2026-10-01T08:00:00.000Z',
};
const adminClass = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Kelas IX-A TEST',
  schoolId: '00000000-0000-4000-8000-000000000011',
  schoolName: 'Sekolah TEST',
  teacherId: '00000000-0000-4000-8000-000000000012',
  teacherName: 'Guru TEST',
  studentCount: 3,
  createdAt: '2026-10-01T08:00:00.000Z',
  archivedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  context.state = {
    status: 'ready',
    profile: { id: 'admin-test', role: 'ADMIN', status: 'ACTIVE', displayName: 'Admin TEST' },
    session: { access_token: 'test-token' },
  };
  vi.mocked(listAdminUsers).mockResolvedValue({ items: [user], nextOffset: 20 });
  vi.mocked(getAdminUser).mockResolvedValue(user);
  vi.mocked(listAdminClasses).mockResolvedValue({ items: [adminClass], nextOffset: null });
  vi.mocked(getAdminClass).mockResolvedValue(adminClass);
});

afterEach(cleanup);

describe('Admin operations UI', () => {
  it('filters users with the existing API contract and loads a minimal user detail', async () => {
    render(<AdminOperationsScreen />);
    await screen.findByText('Siswa TEST');

    fireEvent.change(screen.getByLabelText('Nama pengguna'), {
      target: { value: '  Guru TEST  ' },
    });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'TEACHER' } });
    fireEvent.change(screen.getByLabelText('Status akun'), { target: { value: 'DISABLED' } });
    fireEvent.click(screen.getByRole('button', { name: /terapkan filter/i }));

    await waitFor(() =>
      expect(listAdminUsers).toHaveBeenLastCalledWith('test-token', {
        offset: 0,
        search: 'Guru TEST',
        role: 'TEACHER',
        status: 'DISABLED',
      }),
    );

    const row = screen.getByText('Siswa TEST').closest('li');
    fireEvent.click(within(row!).getByRole('button', { name: 'Lihat detail' }));
    await screen.findByText(user.id);
    expect(getAdminUser).toHaveBeenCalledWith('test-token', user.id);
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByRole('button', { name: /ban|nonaktifkan|koreksi/i })).toBeNull();
  });

  it('loads class filters, details, and paginates with the server-provided offset', async () => {
    render(<AdminOperationsScreen />);
    await screen.findByText('Siswa TEST');
    fireEvent.click(screen.getByRole('button', { name: 'Kelas' }));
    await screen.findByText('Kelas IX-A TEST');

    fireEvent.change(screen.getByLabelText('Nama kelas'), {
      target: { value: ' IX-A ' },
    });
    fireEvent.change(screen.getByLabelText('ID sekolah (opsional)'), {
      target: { value: adminClass.schoolId },
    });
    fireEvent.change(screen.getByLabelText('ID Guru (opsional)'), {
      target: { value: adminClass.teacherId },
    });
    fireEvent.change(screen.getByLabelText('Status kelas'), { target: { value: 'active' } });
    fireEvent.click(screen.getByRole('button', { name: /terapkan filter/i }));

    await waitFor(() =>
      expect(listAdminClasses).toHaveBeenLastCalledWith('test-token', {
        offset: 0,
        search: 'IX-A',
        schoolId: adminClass.schoolId,
        teacherId: adminClass.teacherId,
        state: 'active',
      }),
    );
    const row = screen.getByText('Kelas IX-A TEST').closest('li');
    fireEvent.click(within(row!).getByRole('button', { name: 'Lihat detail' }));
    await screen.findByText(adminClass.teacherId);
    expect(getAdminClass).toHaveBeenCalledWith('test-token', adminClass.id);
    expect(screen.getByText('3')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Detail kelas' })).queryByText(
        /kode kelas|join code/i,
      ),
    ).toBeNull();
  });

  it('uses nextOffset for pagination and retries a failed list request', async () => {
    vi.mocked(listAdminUsers)
      .mockRejectedValueOnce(new Error('Daftar belum tersedia.'))
      .mockResolvedValueOnce({ items: [user], nextOffset: 20 });
    render(<AdminOperationsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('Siswa TEST');
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await waitFor(() =>
      expect(listAdminUsers).toHaveBeenLastCalledWith('test-token', {
        offset: 20,
        search: '',
        role: '',
        status: '',
      }),
    );
  });

  it('retries the selected user detail request', async () => {
    vi.mocked(getAdminUser)
      .mockRejectedValueOnce(new Error('Detail sementara tidak tersedia.'))
      .mockResolvedValueOnce(user);
    render(<AdminOperationsScreen />);
    const row = (await screen.findByText('Siswa TEST')).closest('li');
    fireEvent.click(within(row!).getByRole('button', { name: 'Lihat detail' }));
    await screen.findByText('Detail sementara tidak tersedia.');

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await screen.findByText(user.id);
    expect(getAdminUser).toHaveBeenCalledTimes(2);
  });

  it('hides the operational screen after an authorization rejection', async () => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(
      new ApiProblem(403, 'FORBIDDEN', 'Akses operasional ditolak.'),
    );
    render(<AdminOperationsScreen />);
    await screen.findByText('Akses operasional ditolak.');
    expect(screen.queryByRole('heading', { name: 'Daftar pengguna' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ke halaman masuk' }).getAttribute('href')).toBe('/');
  });

  it('does not request operational data for a non-Admin account', () => {
    context.state = {
      status: 'ready',
      profile: { id: 'student-test', role: 'STUDENT', status: 'ACTIVE', displayName: 'Siswa' },
      session: { access_token: 'student-token' },
    };
    render(<AdminOperationsScreen />);
    expect(listAdminUsers).not.toHaveBeenCalled();
    expect(context.replace).toHaveBeenCalledWith('/student');
  });
});
