import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiProblem, getAdminSchool, listAdminSchools } from '@/lib/api';
import { AdminOperationsScreen } from './operations';
import {
  getAdminClass,
  getAdminUser,
  getAdminMemberships,
  getAdminRoster,
  listAdminClasses,
  listAdminUsers,
} from './operations-api';

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
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  getAdminSchool: vi.fn(),
  listAdminSchools: vi.fn(),
}));
vi.mock('./operations-api', () => ({
  getAdminClass: vi.fn(),
  getAdminMemberships: vi.fn(),
  getAdminRoster: vi.fn(),
  getAdminUser: vi.fn(),
  listAdminClasses: vi.fn(),
  listAdminUsers: vi.fn(),
}));

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Siswa TEST',
  email: 'student@example.test',
  affiliation: 'MANDIRI' as const,
  teacherVerified: null,
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
  teacherActive: true,
  studentCount: 3,
  createdAt: '2026-10-01T08:00:00.000Z',
  archivedAt: null,
};

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/operations');
  vi.resetAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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
  vi.mocked(getAdminSchool).mockResolvedValue({
    id: adminClass.schoolId,
    name: 'Sekolah TEST',
    code: 'SMP-TEST',
    status: 'ACTIVE',
    address: null,
  });
  vi.mocked(listAdminSchools).mockResolvedValue({
    items: [
      {
        id: adminClass.schoolId,
        name: 'Sekolah TEST',
        code: 'SMP-TEST',
        status: 'ACTIVE',
        address: null,
      },
    ],
    nextOffset: null,
  });
  context.state = {
    status: 'ready',
    profile: {
      id: 'admin-test',
      role: 'ADMIN',
      adminRole: 'OPERATIONS',
      capabilities: ['OPERATIONS_MANAGE'],
      status: 'ACTIVE',
      displayName: 'Admin TEST',
    },
    session: { access_token: 'test-token' },
  };
  vi.mocked(listAdminUsers).mockResolvedValue({ items: [user], nextOffset: 5 });
  vi.mocked(getAdminUser).mockResolvedValue(user);
  vi.mocked(getAdminMemberships).mockResolvedValue({ items: [], nextOffset: null });
  vi.mocked(getAdminRoster).mockResolvedValue({ items: [], nextOffset: null });
  vi.mocked(listAdminClasses).mockResolvedValue({ items: [adminClass], nextOffset: null });
  vi.mocked(getAdminClass).mockResolvedValue(adminClass);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Admin operations UI', () => {
  it('clears an unapplied filter draft even when the URL already has no filters', async () => {
    render(<AdminOperationsScreen />);
    await screen.findByText(user.displayName);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.change(screen.getByLabelText('Peran'), { target: { value: 'TEACHER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));
    expect(screen.getByLabelText('Peran')).toHaveProperty('value', '');
    expect(window.location.search).toBe('');
  });
  it('ignores a late user detail response after switching to the class tab', async () => {
    let finish!: (value: typeof user) => void;
    vi.mocked(getAdminUser).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<AdminOperationsScreen />);
    fireEvent.click(
      within((await screen.findByText(user.displayName)).closest('tr')!).getByRole('button', {
        name: 'Lihat detail',
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Kelas' }));
    await screen.findByText(adminClass.name);
    await act(async () => finish(user));
    expect(screen.queryByText(user.email)).toBeNull();
  });
  it.each([
    { adminRole: null, status: 'ACTIVE', capabilities: ['OPERATIONS_MANAGE'] },
    { adminRole: 'CONTENT_DATA_MODERATION', status: 'ACTIVE', capabilities: ['OPERATIONS_MANAGE'] },
    { adminRole: 'OPERATIONS', status: 'DISABLED', capabilities: ['OPERATIONS_MANAGE'] },
    { adminRole: 'OPERATIONS', status: 'ACTIVE', capabilities: [] },
  ])('does not fetch personal data for invalid assignment %j', (profile) => {
    context.state = {
      ...context.state,
      profile: { id: 'invalid', role: 'ADMIN', displayName: 'Invalid Fixture', ...profile },
    };
    render(<AdminOperationsScreen />);
    expect(listAdminUsers).not.toHaveBeenCalled();
    expect(listAdminClasses).not.toHaveBeenCalled();
  });
  it('opens class deep links without requesting users or losing the school filter', async () => {
    window.history.replaceState(
      null,
      '',
      `/admin/operations?view=classes&schoolId=${adminClass.schoolId}`,
    );
    render(<AdminOperationsScreen />);
    await screen.findByText('Kelas IX-A TEST');
    expect(listAdminUsers).not.toHaveBeenCalled();
    expect(listAdminClasses).toHaveBeenCalledExactlyOnceWith('test-token', {
      offset: 0,
      search: '',
      schoolId: adminClass.schoolId,
      teacherId: '',
      state: '',
    });
  });
  it('honours teacher deep links and restores the tab on browser history changes', async () => {
    window.history.replaceState(null, '', '/admin/operations?role=TEACHER');
    render(<AdminOperationsScreen />);
    await screen.findByText('Siswa TEST');
    expect(listAdminUsers).toHaveBeenLastCalledWith(
      'test-token',
      expect.objectContaining({ role: 'TEACHER' }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Kelas' }));
    await screen.findByText('Kelas IX-A TEST');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('classes');
    window.history.replaceState(null, '', '/admin/operations?role=TEACHER');
    fireEvent(window, new PopStateEvent('popstate'));
    await screen.findByText('Siswa TEST');
    expect(screen.queryByRole('heading', { name: 'Daftar kelas' })).toBeNull();
  });
  it.each([401, 403])(
    'clears the whole workspace when membership rejects access with %s',
    async (status) => {
      vi.mocked(getAdminMemberships).mockRejectedValueOnce(
        new ApiProblem(status, 'FORBIDDEN', 'Membership ditolak.'),
      );
      render(<AdminOperationsScreen />);
      fireEvent.click(
        within((await screen.findByText('Siswa TEST')).closest('tr')!).getByRole('button', {
          name: 'Lihat detail',
        }),
      );
      await screen.findByText('Membership ditolak.');
      expect(screen.queryByText(user.email)).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Daftar pengguna' })).toBeNull();
    },
  );
  it.each([401, 403])('clears class detail when roster rejects access with %s', async (status) => {
    vi.mocked(getAdminRoster).mockRejectedValueOnce(
      new ApiProblem(status, 'FORBIDDEN', 'Roster ditolak.'),
    );
    window.history.replaceState(null, '', '/admin/operations?view=classes');
    render(<AdminOperationsScreen />);
    fireEvent.click(
      within((await screen.findByText('Kelas IX-A TEST')).closest('tr')!).getByRole('button', {
        name: 'Lihat detail',
      }),
    );
    await screen.findByText('Roster ditolak.');
    expect(screen.queryByText(adminClass.id)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Daftar kelas' })).toBeNull();
  });
  it('filters users with the existing API contract and loads a minimal user detail', async () => {
    render(<AdminOperationsScreen />);
    await screen.findByText('Siswa TEST');

    fireEvent.change(screen.getByLabelText('Nama pengguna'), {
      target: { value: '  Guru TEST  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.change(screen.getByLabelText('Peran'), { target: { value: 'TEACHER' } });
    fireEvent.change(screen.getByLabelText('Status akun'), { target: { value: 'DISABLED' } });
    fireEvent.click(screen.getByRole('button', { name: /terapkan filter/i }));

    await waitFor(() =>
      expect(listAdminUsers).toHaveBeenLastCalledWith('test-token', {
        offset: 0,
        search: 'Guru TEST',
        role: 'TEACHER',
        status: 'DISABLED',
        affiliation: '',
        schoolId: '',
      }),
    );

    const row = screen.getByText('Siswa TEST').closest('tr');
    fireEvent.click(within(row!).getByRole('button', { name: 'Lihat detail' }));
    await screen.findByText(user.id);
    expect(getAdminUser).toHaveBeenCalledWith('test-token', user.id);
    expect(screen.getByText('student@example.test')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ban|nonaktifkan|koreksi/i })).toBeNull();
  });

  it('loads class filters, details, and paginates with the server-provided offset', async () => {
    render(<AdminOperationsScreen />);
    await screen.findByText('Siswa TEST');
    fireEvent.click(screen.getByRole('tab', { name: 'Kelas' }));
    await screen.findByText('Kelas IX-A TEST');

    fireEvent.change(screen.getByLabelText('Nama kelas'), {
      target: { value: ' IX-A ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pilih sekolah' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sekolah TEST' }));
    vi.mocked(listAdminUsers).mockResolvedValueOnce({
      items: [{ ...user, id: adminClass.teacherId, role: 'TEACHER', displayName: 'Guru TEST' }],
      nextOffset: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pilih Guru' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Guru TEST' }));
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
    const row = screen.getByText('Kelas IX-A TEST').closest('tr');
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
      .mockResolvedValueOnce({ items: [user], nextOffset: 5 });
    render(<AdminOperationsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('Siswa TEST');
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    await waitFor(() =>
      expect(listAdminUsers).toHaveBeenLastCalledWith('test-token', {
        offset: 5,
        search: '',
        role: '',
        status: '',
        affiliation: '',
        schoolId: '',
      }),
    );
  });

  it('retries the selected user detail request', async () => {
    vi.mocked(getAdminUser)
      .mockRejectedValueOnce(new Error('Detail sementara tidak tersedia.'))
      .mockResolvedValueOnce(user);
    render(<AdminOperationsScreen />);
    const row = (await screen.findByText('Siswa TEST')).closest('tr');
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
    expect(screen.getByRole('link', { name: 'Ke halaman masuk' }).getAttribute('href')).toBe(
      '/admin/login',
    );
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
