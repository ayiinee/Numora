import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminSchoolsScreen } from './schools';
import {
  ApiProblem,
  createSchool,
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
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.state = {
    status: 'ready',
    profile: { id: 'admin-one', role: 'ADMIN', status: 'ACTIVE', displayName: 'Admin TEST' },
    session: { access_token: 'test-admin' },
  };
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school] });
  vi.mocked(listTeacherTokens).mockResolvedValue({ items: [] });
});
afterEach(cleanup);
it('shows five schools and tokens per page, and resets token pagination when changing schools', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({
    items: Array.from({ length: 6 }, (_, i) => ({
      ...school,
      id: `school-${i}`,
      name: `Sekolah ${i}`,
    })),
  });
  vi.mocked(listTeacherTokens).mockResolvedValue({
    items: Array.from({ length: 6 }, (_, i) => ({
      id: `token-${i}`,
      usedAt: null,
      revokedAt: null,
      expiresAt: '2099-01-01T00:00:00Z',
    })),
  });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah 0/ }));
  await screen.findByText('token-0');
  expect(document.querySelectorAll('.admin-school-rows > li')).toHaveLength(5);
  expect(document.querySelectorAll('.admin-token-list > li')).toHaveLength(5);
  const tokenNav = screen.getByRole('navigation', { name: 'Halaman token Guru' });
  fireEvent.click(within(tokenNav).getByRole('button', { name: 'Berikutnya' }));
  expect(screen.getByText('token-5')).toBeTruthy();
  expect(screen.queryByText('token-0')).toBeNull();

  const schoolNav = screen.getByRole('navigation', { name: 'Halaman sekolah' });
  fireEvent.click(within(schoolNav).getByRole('button', { name: 'Berikutnya' }));
  expect(document.querySelectorAll('.admin-school-rows > li')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Sekolah 5/ }));
  await screen.findByText('token-0');
  expect(screen.queryByText('token-5')).toBeNull();
  expect(
    (within(schoolNav).getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('preserves code case and failed creation input, then selects the server-created school', async () => {
  vi.mocked(createSchool)
    .mockRejectedValueOnce(new Error('Kode sudah digunakan.'))
    .mockResolvedValueOnce(school);
  render(<AdminSchoolsScreen />);
  fireEvent.change(screen.getByLabelText(/Kode sekolah/), { target: { value: 'Test-Ab' } });
  fireEvent.change(screen.getByLabelText(/Nama sekolah/), { target: { value: ' Sekolah TEST ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByText('Kode sudah digunakan.');
  expect((screen.getByLabelText(/Nama sekolah/) as HTMLInputElement).value).toBe(' Sekolah TEST ');
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByLabelText(/Ubah nama/);
  expect(createSchool).toHaveBeenLastCalledWith('test-admin', 'Test-Ab', 'Sekolah TEST');
  expect((screen.getByLabelText(/Ubah nama/) as HTMLInputElement).value).toBe('Sekolah TEST');
});
it('disables editing and selection during pending token issuance and removes its one-time value on school change', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({
    items: [school, { ...school, id: 'school-two', name: 'Sekolah lain' }],
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
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  expect(
    (screen.getByLabelText(/Ubah nama/).closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  expect((screen.getByRole('button', { name: /Sekolah lain/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  finish({ id: 'token-test', token: 'SYNTHETIC-ONLY', expiresAt: '2099-01-01T00:00:00Z' });
  await screen.findByText('SYNTHETIC-ONLY');
  fireEvent.click(screen.getByRole('button', { name: /Sekolah lain/ }));
  expect(screen.queryByText('SYNTHETIC-ONLY')).toBeNull();
});
it('keeps token failure retryable and hides revoked/used actions', async () => {
  vi.mocked(listTeacherTokens)
    .mockRejectedValueOnce(new Error('Token belum dapat dimuat.'))
    .mockResolvedValueOnce({
      items: [
        {
          id: 'used-token',
          usedAt: '2026-01-01T00:00:00Z',
          revokedAt: null,
          expiresAt: '2099-01-01T00:00:00Z',
        },
        {
          id: 'revoked-token',
          usedAt: null,
          revokedAt: '2026-01-01T00:00:00Z',
          expiresAt: '2099-01-01T00:00:00Z',
        },
      ],
    });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  const alert = await screen.findByRole('alert');
  fireEvent.click(within(alert).getByRole('button', { name: 'Coba lagi' }));
  await screen.findByText('Terpakai');
  await screen.findByText('Dicabut');
  expect(screen.queryByRole('button', { name: 'Cabut' })).toBeNull();
  expect(revokeTeacherToken).not.toHaveBeenCalled();
});
it('disables issuance for an inactive school and preserves the status update endpoint', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [{ ...school, status: 'INACTIVE' }] });
  vi.mocked(updateSchool).mockResolvedValue(school);
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  expect(
    (screen.getByRole('button', { name: 'Terbitkan token' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Aktifkan sekolah' }));
  await waitFor(() =>
    expect(updateSchool).toHaveBeenCalledWith('test-admin', 'school-one', { status: 'ACTIVE' }),
  );
});
it('offers list retry after a load error and conceals cached administrative detail after access rejection', async () => {
  vi.mocked(listAdminSchools)
    .mockRejectedValueOnce(new Error('Sekolah belum tersedia.'))
    .mockResolvedValueOnce({ items: [school] });
  render(<AdminSchoolsScreen />);
  fireEvent.click(
    within(await screen.findByRole('alert')).getByRole('button', { name: 'Coba lagi' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: /Sekolah TEST/ }));
  vi.mocked(issueTeacherToken).mockRejectedValueOnce(
    new ApiProblem(403, 'FORBIDDEN', 'Akses ditolak.'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('Akses ditolak.');
  expect(screen.queryByLabelText(/Ubah nama/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Ke halaman masuk' }).getAttribute('href')).toBe(
    '/admin/login',
  );
});
