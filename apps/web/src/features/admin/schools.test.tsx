import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  type TeacherTokenSummary,
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
  reissueTeacherToken: vi.fn(),
  revokeTeacherToken: vi.fn(),
  updateSchool: vi.fn(),
}));
const school = {
  id: 'school-one',
  code: 'TEST-AB',
  name: 'Sekolah TEST',
  status: 'ACTIVE' as const,
  address: null,
};
const credential = (
  index: number,
  status: TeacherTokenSummary['status'] = 'AVAILABLE',
): TeacherTokenSummary => ({
  id: `token-${index}`,
  createdAt: '2026-10-01T00:00:00Z',
  expiresAt: '2099-01-01T00:00:00Z',
  usedAt: null,
  revokedAt: null,
  usedByUserId: null,
  usedByName: null,
  status,
});
beforeEach(() => {
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
  vi.resetAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', '/admin/schools');
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function selectSchool(name = 'Sekolah TEST') {
  fireEvent.click(await screen.findByRole('button', { name: `Kelola ${name}` }));
  await screen.findByRole('button', { name: 'Edit sekolah' });
}
async function edit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit sekolah' }));
  return screen.getByRole('dialog', { name: 'Edit sekolah' });
}
function confirm() {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Konfirmasi' }));
}

it('starts with the directory and opens creation only when requested', async () => {
  render(<AdminSchoolsScreen />);
  await screen.findByRole('button', { name: 'Kelola Sekolah TEST' });
  expect(screen.queryByLabelText('Kode sekolah')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tambah sekolah' }));
  expect(screen.getByLabelText('Kode sekolah')).toBeTruthy();
});

it('loads a school deep link with an uppercase identifier using its canonical identity', async () => {
  window.history.replaceState(null, '', '/admin/schools?schoolId=SCHOOL-ONE');
  render(<AdminSchoolsScreen />);
  await screen.findByRole('button', { name: 'Edit sekolah' });
  expect(getAdminSchool).toHaveBeenCalledWith('test-admin', school.id);
});
it('preserves creation failure input and selects the canonical server-created school', async () => {
  vi.mocked(createSchool)
    .mockRejectedValueOnce(new Error('Kode sudah digunakan.'))
    .mockResolvedValueOnce(school);
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tambah sekolah' }));
  fireEvent.change(screen.getByLabelText('Kode sekolah'), { target: { value: 'Test-Ab' } });
  fireEvent.change(screen.getByLabelText('Nama sekolah'), { target: { value: ' Sekolah TEST ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByText('Kode sudah digunakan.');
  expect(screen.getByLabelText('Nama sekolah')).toHaveProperty('value', ' Sekolah TEST ');
  fireEvent.click(screen.getByRole('button', { name: 'Simpan sekolah' }));
  await screen.findByRole('button', { name: 'Edit sekolah' });
  expect(createSchool).toHaveBeenLastCalledWith('test-admin', 'Test-Ab', 'Sekolah TEST', '');
  expect(screen.getByText('TEST-AB')).toBeTruthy();
  expect(window.location.search).toContain('schoolId=school-one');
});
it('uses server offsets for school pages and resets them when searching', async () => {
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school], nextOffset: 5 });
  render(<AdminSchoolsScreen />);
  await screen.findByRole('button', { name: 'Kelola Sekolah TEST' });
  fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
  await waitFor(() =>
    expect(listAdminSchools).toHaveBeenLastCalledWith('test-admin', { offset: 5, search: '' }),
  );
  fireEvent.change(screen.getByLabelText('Cari sekolah'), { target: { value: ' TEST ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cari sekolah' }));
  await waitFor(() =>
    expect(listAdminSchools).toHaveBeenLastCalledWith('test-admin', { offset: 0, search: 'TEST' }),
  );
});
it('pages credential history without losing the selected school or unsaved edit draft', async () => {
  vi.mocked(listTeacherTokens).mockImplementation(async (_token, _school, offset = 0) => ({
    items: [credential(offset)],
    nextOffset: offset === 0 ? 5 : null,
  }));
  render(<AdminSchoolsScreen />);
  await selectSchool();
  let dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText('Ubah nama'), {
    target: { value: 'Belum disimpan' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Berikutnya' }));
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', school.id, 5),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sebelumnya' }));
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', school.id, 0),
  );
  dialog = await edit();
  expect(within(dialog).getByLabelText('Ubah nama')).toHaveProperty('value', 'Belum disimpan');
});
it('resets token pagination when returning to the directory and selecting another school', async () => {
  const other = { ...school, id: 'school-two', name: 'Sekolah lain' };
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school, other], nextOffset: null });
  vi.mocked(getAdminSchool).mockImplementation(async (_token, id) =>
    id === school.id ? school : other,
  );
  vi.mocked(listTeacherTokens).mockResolvedValue({ items: [credential(0)], nextOffset: 5 });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  fireEvent.click(await screen.findByRole('button', { name: 'Berikutnya' }));
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', school.id, 5),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Kembali ke daftar sekolah' }));
  await selectSchool('Sekolah lain');
  await waitFor(() =>
    expect(listTeacherTokens).toHaveBeenLastCalledWith('test-admin', other.id, 0),
  );
});
it('requires explicit save, preserves failed edits and normalizes an empty address', async () => {
  vi.mocked(updateSchool)
    .mockRejectedValueOnce(new Error('Simpan belum berhasil.'))
    .mockResolvedValueOnce(school);
  render(<AdminSchoolsScreen />);
  await selectSchool();
  const dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText('Ubah nama'), { target: { value: 'Nama baru' } });
  expect(updateSchool).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan perubahan' }));
  await screen.findByText('Simpan belum berhasil.');
  expect(within(dialog).getByLabelText('Ubah nama')).toHaveProperty('value', 'Nama baru');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan perubahan' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(updateSchool).toHaveBeenLastCalledWith('test-admin', school.id, {
    name: 'Nama baru',
    address: null,
  });
});
it('uses fresh detail after a failed read and offers no mutations before recovery', async () => {
  vi.mocked(getAdminSchool)
    .mockRejectedValueOnce(new Error('Detail sekolah gagal.'))
    .mockResolvedValueOnce({ ...school, name: 'Nama terbaru', address: 'Alamat terbaru' });
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Kelola Sekolah TEST' }));
  const alert = await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Terbitkan token' })).toBeNull();
  fireEvent.click(within(alert).getByRole('button', { name: 'Coba lagi' }));
  const dialog = await edit();
  expect(within(dialog).getByLabelText('Ubah nama')).toHaveProperty('value', 'Nama terbaru');
  expect(within(dialog).getByLabelText(/Ubah alamat/)).toHaveProperty('value', 'Alamat terbaru');
});
it('recovers token reads independently and trusts server USED/REVOKED status even without timestamps', async () => {
  vi.mocked(listTeacherTokens)
    .mockRejectedValueOnce(new Error('Token belum dapat dimuat.'))
    .mockResolvedValueOnce({
      items: [credential(1, 'USED'), credential(2, 'REVOKED')],
      nextOffset: null,
    });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  fireEvent.click(
    within(await screen.findByRole('alert')).getByRole('button', { name: 'Coba lagi' }),
  );
  await screen.findByText('Terpakai');
  await screen.findByText('Dicabut');
  expect(screen.queryByRole('button', { name: 'Cabut' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Terbit ulang' })).toBeNull();
});
it('blocks issue/reissue for inactive schools while allowing revocation after confirmation', async () => {
  vi.mocked(getAdminSchool).mockResolvedValue({ ...school, status: 'INACTIVE' });
  vi.mocked(listTeacherTokens).mockResolvedValue({ items: [credential(1)], nextOffset: null });
  vi.mocked(revokeTeacherToken).mockResolvedValue({ revoked: true });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  expect(
    (await screen.findByRole('button', { name: 'Terbitkan token' })).hasAttribute('disabled'),
  ).toBe(true);
  expect(
    (await screen.findByRole('button', { name: 'Terbit ulang' })).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cabut' }));
  expect(revokeTeacherToken).not.toHaveBeenCalled();
  confirm();
  await waitFor(() =>
    expect(revokeTeacherToken).toHaveBeenCalledWith('test-admin', school.id, 'token-1'),
  );
});
it('confirms status changes and leaves a failed confirmation open with its error', async () => {
  vi.mocked(updateSchool)
    .mockRejectedValueOnce(new Error('Status belum tersimpan.'))
    .mockResolvedValueOnce({ ...school, status: 'INACTIVE' });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  fireEvent.click(screen.getByRole('button', { name: 'Nonaktifkan sekolah' }));
  expect(updateSchool).not.toHaveBeenCalled();
  confirm();
  await screen.findByText('Status belum tersimpan.');
  expect(screen.getByRole('dialog')).toBeTruthy();
  confirm();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(updateSchool).toHaveBeenLastCalledWith('test-admin', school.id, { status: 'INACTIVE' });
});
it('guards duplicate issuance and navigation while a mutation is pending', async () => {
  let finish!: (value: { id: string; token: string; expiresAt: string }) => void;
  vi.mocked(issueTeacherToken).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AdminSchoolsScreen />);
  await selectSchool();
  const issue = screen.getByRole('button', { name: 'Terbitkan token' });
  fireEvent.click(issue);
  fireEvent.click(issue);
  expect(issueTeacherToken).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Kembali ke daftar sekolah' }).hasAttribute('disabled'),
  ).toBe(true);
  await act(async () =>
    finish({ id: 'new', token: 'SYNTHETIC-SECRET', expiresAt: '2099-01-01T00:00:00Z' }),
  );
  await screen.findByText('SYNTHETIC-SECRET');
});
it('preserves edit drafts across token operations and hides raw tokens when leaving the school', async () => {
  vi.mocked(issueTeacherToken).mockResolvedValue({
    id: 'new',
    token: 'SYNTHETIC-SECRET',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  let dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText('Ubah nama'), {
    target: { value: 'Belum disimpan' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('SYNTHETIC-SECRET');
  dialog = await edit();
  expect(within(dialog).getByLabelText('Ubah nama')).toHaveProperty('value', 'Belum disimpan');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kembali ke daftar sekolah' }));
  expect(screen.queryByText('SYNTHETIC-SECRET')).toBeNull();
  expect(window.location.href).not.toContain('SYNTHETIC');
});
it('keeps EXPIRED status from the server even if the browser clock suggests availability', async () => {
  vi.mocked(listTeacherTokens).mockResolvedValue({
    items: [credential(1, 'EXPIRED')],
    nextOffset: null,
  });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  await screen.findByText('Kedaluwarsa');
});
it.each([401, 403])(
  'discards the entire workspace when detail denies access with %s',
  async (status) => {
    vi.mocked(getAdminSchool).mockRejectedValueOnce(
      new ApiProblem(status, 'FORBIDDEN', 'Detail ditolak.'),
    );
    render(<AdminSchoolsScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kelola Sekolah TEST' }));
    await screen.findByText('Detail ditolak.');
    expect(screen.queryByRole('button', { name: 'Edit sekolah' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  },
);
it('discards secrets and drafts after a capability change even when the same account regains access', async () => {
  vi.mocked(issueTeacherToken).mockResolvedValue({
    id: 'new',
    token: 'SYNTHETIC-SECRET',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  const view = render(<AdminSchoolsScreen />);
  await selectSchool();
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('SYNTHETIC-SECRET');
  const dialog = await edit();
  fireEvent.change(within(dialog).getByLabelText('Ubah nama'), {
    target: { value: 'Private draft' },
  });
  const profile = auth.state.profile as Record<string, unknown>;
  profile.capabilities = [];
  view.rerender(<AdminSchoolsScreen />);
  expect(screen.queryByText('SYNTHETIC-SECRET')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  profile.capabilities = ['OPERATIONS_MANAGE'];
  view.rerender(<AdminSchoolsScreen />);
  const fresh = await edit();
  expect(within(fresh).getByLabelText('Ubah nama')).toHaveProperty('value', school.name);
  expect(screen.queryByText('SYNTHETIC-SECRET')).toBeNull();
});
it('keeps list failures retryable and closes data after a mutation access denial', async () => {
  vi.mocked(listAdminSchools)
    .mockRejectedValueOnce(new Error('Sekolah belum tersedia.'))
    .mockResolvedValueOnce({ items: [school], nextOffset: null });
  vi.mocked(issueTeacherToken).mockRejectedValueOnce(
    new ApiProblem(403, 'FORBIDDEN', 'Akses ditolak.'),
  );
  render(<AdminSchoolsScreen />);
  fireEvent.click(
    within(await screen.findByRole('alert')).getByRole('button', { name: 'Coba lagi' }),
  );
  await selectSchool();
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('Akses ditolak.');
  expect(screen.queryByRole('button', { name: 'Edit sekolah' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Ke halaman masuk' }).getAttribute('href')).toBe(
    '/admin/login',
  );
});
it('ignores a late detail response after returning to the school list', async () => {
  let finish!: (value: typeof school) => void;
  vi.mocked(getAdminSchool).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AdminSchoolsScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Kelola Sekolah TEST' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kembali ke daftar sekolah' }));
  await act(async () => finish(school));
  expect(screen.queryByRole('button', { name: 'Edit sekolah' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Terbitkan token' })).toBeNull();
});

it('keeps a newly issued token visible and focuses it while school detail refreshes', async () => {
  let finish!: (value: typeof school) => void;
  vi.mocked(getAdminSchool)
    .mockResolvedValueOnce(school)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  vi.mocked(issueTeacherToken).mockResolvedValue({
    id: 'new',
    token: 'SYNTHETIC-SECRET',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  render(<AdminSchoolsScreen />);
  await selectSchool();
  fireEvent.click(screen.getByRole('button', { name: 'Terbitkan token' }));
  await screen.findByText('SYNTHETIC-SECRET');
  expect(screen.getByRole('region', { name: 'Token baru' })).toBe(document.activeElement);
  expect(screen.getByRole('button', { name: 'Edit sekolah' })).toBeTruthy();
  expect(screen.queryByText('Memuat detail sekolah...')).toBeNull();
  await act(async () => finish(school));
});
