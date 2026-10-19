import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminSchoolsScreen } from './schools';
import {
  ApiProblem,
  createSchool,
  getAdminSchool,
  listAdminSchools,
  listTeacherTokens,
  issueTeacherToken,
  revokeTeacherToken,
  updateSchool,
} from '@/lib/api';
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown>, refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/schools',
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, refresh: auth.refresh }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  createSchool: vi.fn(),
  getAdminSchool: vi.fn(),
  listAdminSchools: vi.fn(),
  listTeacherTokens: vi.fn(),
  issueTeacherToken: vi.fn(),
  revokeTeacherToken: vi.fn(),
  updateSchool: vi.fn(),
}));
const school = {
  id: 'school-one',
  code: 'Test-Ab',
  name: 'Sekolah TEST',
  status: 'ACTIVE' as const,
  address: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.state = {
    status: 'ready',
    profile: {
      id: 'admin-one',
      role: 'ADMIN',
      adminRole: 'OPERATIONS',
      capabilities: ['OPERATIONS_MANAGE'],
      status: 'ACTIVE',
      displayName: 'Admin TEST',
    },
    session: { access_token: 'test-admin' },
  };
  vi.mocked(getAdminSchool).mockResolvedValue(school);
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school], nextOffset: null });
  vi.mocked(listTeacherTokens).mockResolvedValue({ items: [], nextOffset: null });
});
afterEach(cleanup);
it('shows five schools and tokens per page, and resets token pagination when changing schools', async () => {
  const schools = Array.from({ length: 6 }, (_, i) => ({
    ...school,
    id: `school-${i}`,
    name: `Sekolah ${i}`,
  }));
  const tokens = Array.from({ length: 6 }, (_, i) => ({
    id: `token-${i}`,
    usedAt: null,
    revokedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    usedByUserId: null,
    usedByName: null,
    status: 'AVAILABLE' as const,
    expiresAt: '2099-01-01T00:00:00Z',
  }));
  vi.mocked(listAdminSchools).mockImplementation(async (_token, filters) => ({
    items: schools.slice(filters!.offset, filters!.offset + 5),
    nextOffset: filters!.offset === 0 ? 5 : null,
  }));
  vi.mocked(getAdminSchool).mockImplementation(async (_token, id) =>
    schools.find((s) => s.id === id)!,
  );
  vi.mocked(listTeacherTokens).mockImplementation(async (_token, _school, offset = 0) => ({
    items: tokens.slice(offset, offset + 5),
    nextOffset: offset === 0 ? 5 : null,
  }));
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah 0/ }));
  await screen.findByText('token-0');
  expect(document.querySelectorAll('.admin-school-rows > li')).toHaveLength(5);
  expect(document.querySelectorAll('.admin-token-list > li')).toHaveLength(5);
  const tokenNav = screen.getByRole('navigation', { name: 'Halaman token Guru' });
  fireEvent.click(within(tokenNav).getByRole('button', { name: 'Token berikutnya' }));
  expect(await screen.findByText('token-5')).toBeTruthy();
  expect(screen.queryByText('token-0')).toBeNull();

  const schoolNav = screen.getByRole('navigation', { name: 'Halaman sekolah' });
  fireEvent.click(within(schoolNav).getByRole('button', { name: 'Sekolah berikutnya' }));
  await waitFor(() => expect(document.querySelectorAll('.admin-school-rows > li')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: /Sekolah 5/ }));
  await screen.findByText('token-0');
  expect(screen.queryByText('token-5')).toBeNull();
  expect(
    (within(schoolNav).getByRole('button', { name: 'Sekolah berikutnya' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it('preserves code case and failed creation input, then selects the server-created school', async () => {
  vi.mocked(createSchool)
    .mockRejectedValueOnce(new Error('Kode sudah digunakan.'))
    .mockResolvedValueOnce(school);
  render(<AdminSchoolsScreen />);
  fireEvent.click(screen.getByText('Tambah sekolah', { selector: 'summary' }));
  fireEvent.change(screen.getByLabelText(/Kode sekolah/), { target: { value: 'Test-Ab' } });
  fireEvent.change(screen.getByLabelText(/Nama sekolah/), { target: { value: ' Sekolah TEST ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByText('Kode sudah digunakan.');
  expect((screen.getByLabelText(/Nama sekolah/) as HTMLInputElement).value).toBe(' Sekolah TEST ');
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByLabelText(/Ubah nama/);
  expect(createSchool).toHaveBeenLastCalledWith('test-admin', 'Test-Ab', 'Sekolah TEST', '');
  expect((screen.getByLabelText(/Ubah nama/) as HTMLInputElement).value).toBe('Sekolah TEST');
});
it('disables editing and selection during pending token issuance and removes its one-time value on school change', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({
    items: [school, { ...school, id: 'school-two', name: 'Sekolah lain' }],
    nextOffset: null,
  });
  let finish!: (value: { id: string; token: string; expiresAt: string }) => void;
  vi.mocked(issueTeacherToken).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Terbitkan token' }));
  expect(
    (screen.getByLabelText(/Ubah nama/).closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  expect((screen.getByRole('button', { name: /Sekolah lain/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  finish({ id: 'token-test', token: 'SYNTHETIC-ONLY', expiresAt: '2099-01-01T00:00:00Z' });
  await screen.findByText('SYNTHETIC-ONLY');
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: /Sekolah lain/ }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah lain/ }));
  expect(screen.queryByText('SYNTHETIC-ONLY')).toBeNull();
});
it('keeps token failure retryable and hides revoked/used actions', async () => {
  vi.mocked(listTeacherTokens)
    .mockRejectedValueOnce(new Error('Token belum dapat dimuat.'))
    .mockResolvedValueOnce({
      nextOffset: null,
      items: [
        {
          createdAt: '2026-01-01T00:00:00Z',
          usedByUserId: 'teacher',
          usedByName: 'Guru TEST',
          status: 'USED',
          id: 'used-token',
          usedAt: '2026-01-01T00:00:00Z',
          revokedAt: null,
          expiresAt: '2099-01-01T00:00:00Z',
        },
        {
          createdAt: '2026-01-01T00:00:00Z',
          usedByUserId: null,
          usedByName: null,
          status: 'REVOKED',
          id: 'revoked-token',
          usedAt: null,
          revokedAt: '2026-01-01T00:00:00Z',
          expiresAt: '2099-01-01T00:00:00Z',
        },
      ],
    });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  await screen.findByRole('button', { name: 'Terbitkan token' });
  const alert = await screen.findByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Coba lagi' }));
  await screen.findByText('Terpakai');
  await screen.findByText('Dicabut');
  expect(screen.queryByRole('button', { name: 'Cabut' })).toBeNull();
  expect(revokeTeacherToken).not.toHaveBeenCalled();
});
it('disables issuance for an inactive school and preserves the status update endpoint', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({
    items: [{ ...school, status: 'INACTIVE' }],
    nextOffset: null,
  });
  vi.mocked(getAdminSchool).mockResolvedValue({ ...school, status: 'INACTIVE' });
  vi.mocked(updateSchool).mockResolvedValue(school);
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  expect(
    ((await screen.findByRole('button', { name: 'Terbitkan token' })) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Aktifkan sekolah' }));
  await waitFor(() =>
    expect(updateSchool).toHaveBeenCalledWith('test-admin', 'school-one', { status: 'ACTIVE' }),
  );
});
it('keeps the loaded credential list when the selected school is clicked again', async () => {
  render(<AdminSchoolsScreen />);
  const row = await screen.findByRole('button', { name: /Sekolah TEST/ });
  fireEvent.click(row);
  await screen.findByText('Belum ada token.');
  fireEvent.click(row);
  expect(screen.getByText('Belum ada token.')).toBeTruthy();
  expect(listTeacherTokens).toHaveBeenCalledTimes(1);
});
it('pages school results using the server offset and resets pagination when searching', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school], nextOffset: 5 });
  render(<AdminSchoolsScreen />);
  await screen.findByRole('button', { name: /Sekolah TEST/ });
  fireEvent.click(screen.getByRole('button', { name: 'Sekolah berikutnya' }));
  await waitFor(() =>
    expect(listAdminSchools).toHaveBeenLastCalledWith('test-admin', { offset: 5, search: '' }),
  );
  fireEvent.change(screen.getByLabelText('Cari sekolah'), { target: { value: ' TEST ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cari sekolah' }));
  await waitFor(() =>
    expect(listAdminSchools).toHaveBeenLastCalledWith('test-admin', { offset: 0, search: 'TEST' }),
  );
});
it('pages credentials without losing the selected school or unsaved edits', async () => {
  vi.mocked(listTeacherTokens).mockResolvedValue({ items: [], nextOffset: 5 });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  fireEvent.change(await screen.findByLabelText(/Ubah nama/), {
    target: { value: 'Edit belum disimpan' },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Token berikutnya' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Token berikutnya' }));
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', school.id, 5),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Token sebelumnya' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Token sebelumnya' }));
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', school.id, 0),
  );
  expect((screen.getByLabelText(/Ubah nama/) as HTMLInputElement).value).toBe(
    'Edit belum disimpan',
  );
});
it('uses fresh detail for editing and makes a failed detail read retryable without offering mutations', async () => {
  vi.mocked(getAdminSchool)
    .mockRejectedValueOnce(new Error('Detail sekolah gagal.'))
    .mockResolvedValueOnce({ ...school, name: 'Nama terbaru', address: 'Alamat terbaru' });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  const error = await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Terbitkan token' })).toBeNull();
  fireEvent.click(within(error).getByRole('button', { name: 'Coba lagi' }));
  expect(((await screen.findByLabelText(/Ubah nama/)) as HTMLInputElement).value).toBe(
    'Nama terbaru',
  );
  expect((screen.getByLabelText(/Ubah alamat/) as HTMLInputElement).value).toBe('Alamat terbaru');
});
it.each([401, 403])(
  'clears schools and credentials when detail denies access with %s',
  async (status) => {
    vi.mocked(getAdminSchool).mockRejectedValueOnce(
      new ApiProblem(status, 'FORBIDDEN', 'Detail ditolak.'),
    );
    render(<AdminSchoolsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
    await screen.findByText('Detail ditolak.');
    expect(screen.queryByRole('button', { name: /Sekolah TEST/ })).toBeNull();
    expect(screen.queryByLabelText(/Ubah nama/)).toBeNull();
  },
);
it('discards one-time credential data after capability revocation even if the same account regains access', async () => {
  vi.mocked(issueTeacherToken).mockResolvedValue({
    id: 'new-token',
    token: 'SYNTHETIC-SECRET',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  const view = render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('SYNTHETIC-SECRET');
  const profile = auth.state.profile as Record<string, unknown>;
  profile.capabilities = [];
  view.rerender(<AdminSchoolsScreen />);
  expect(screen.queryByText('SYNTHETIC-SECRET')).toBeNull();
  profile.capabilities = ['OPERATIONS_MANAGE'];
  view.rerender(<AdminSchoolsScreen />);
  await screen.findByRole('button', { name: /Sekolah TEST/ });
  expect(screen.queryByText('SYNTHETIC-SECRET')).toBeNull();
  expect(screen.queryByLabelText(/Ubah nama/)).toBeNull();
});
it('preserves unsaved school edits during token issuance and uses the server credential status', async () => {
  vi.mocked(issueTeacherToken).mockResolvedValue({
    id: 'new-token',
    token: 'SYNTHETIC-SECRET',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  vi.mocked(listTeacherTokens).mockResolvedValue({
    nextOffset: null,
    items: [
      {
        id: 'expired',
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z',
        status: 'EXPIRED',
        usedAt: null,
        revokedAt: null,
        usedByUserId: null,
        usedByName: null,
      },
    ],
  });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  await screen.findByText('Kedaluwarsa');
  fireEvent.change(screen.getByLabelText(/Ubah nama/), { target: { value: 'Belum disimpan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('SYNTHETIC-SECRET');
  expect(((await screen.findByLabelText(/Ubah nama/)) as HTMLInputElement).value).toBe(
    'Belum disimpan',
  );
});
it('blocks new/reissued credentials for an inactive school while allowing revocation', async () => {
  vi.mocked(getAdminSchool).mockResolvedValue({ ...school, status: 'INACTIVE' });
  vi.mocked(listTeacherTokens).mockResolvedValue({
    nextOffset: null,
    items: [
      {
        id: 'available',
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z',
        status: 'AVAILABLE',
        usedAt: null,
        revokedAt: null,
        usedByUserId: null,
        usedByName: null,
      },
    ],
  });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  expect(
    ((await screen.findByRole('button', { name: 'Terbit ulang' })) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole('button', { name: 'Cabut' }) as HTMLButtonElement).disabled).toBe(false);
});
it('offers list retry after a load error and conceals cached administrative detail after access rejection', async () => {
  vi.mocked(listAdminSchools)
    .mockRejectedValueOnce(new Error('Sekolah belum tersedia.'))
    .mockResolvedValueOnce({ items: [school], nextOffset: null });
  render(<AdminSchoolsScreen />);
  fireEvent.click(
    within(await screen.findByRole('alert')).getByRole('button', { name: 'Coba lagi' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  vi.mocked(issueTeacherToken).mockRejectedValueOnce(
    new ApiProblem(403, 'FORBIDDEN', 'Akses ditolak.'),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('Akses ditolak.');
  expect(screen.queryByLabelText(/Ubah nama/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Ke halaman masuk' }).getAttribute('href')).toBe(
    '/admin/login',
  );
});
