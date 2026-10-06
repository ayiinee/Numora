import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TeacherShell } from './teacher-shell';

const fixture = vi.hoisted(() => ({
  pathname: '/teacher',
  verified: true,
  status: 'ready',
  logout: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => fixture.pathname,
  useRouter: () => ({ replace: fixture.replace }),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: {
      status: fixture.status,
      profile: { role: 'TEACHER', displayName: 'Guru dari API', teacherVerified: fixture.verified },
    },
    logout: fixture.logout,
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  fixture.pathname = '/teacher';
  fixture.verified = true;
  fixture.status = 'ready';
});
afterEach(cleanup);
function mount() {
  return render(
    <TeacherShell title="Kelas saya" teacherName="Nama prop">
      <p>Konten halaman</p>
    </TeacherShell>,
  );
}

it('shows actual identity and destinations for implemented Teacher screens without fake badges', () => {
  mount();
  expect(screen.getAllByText('Guru dari API')).toHaveLength(2);
  expect(screen.queryByText('Nama prop')).toBeNull();
  const nav = within(screen.getByRole('navigation', { name: 'Navigasi utama' }));
  expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
    '/teacher',
    '/teacher/profile',
  ]);
  expect(screen.queryByRole('link', { name: 'Pusat Notifikasi' })).toBeNull();
  expect(nav.queryByRole('button')).toBeNull();
});
it('keeps nested student progress in class context and activates profile independently', () => {
  fixture.pathname = '/teacher/classes/class-id/students/student-id';
  const { rerender } = mount();
  const mobile = () => within(screen.getByRole('navigation', { name: 'Navigasi utama' }));
  expect(mobile().getByRole('link', { name: 'Kelas' }).getAttribute('aria-current')).toBe('page');
  expect(screen.queryByRole('link', { name: 'Detail Kelas' })).toBeNull();
  fixture.pathname = '/teacher/profile';
  rerender(
    <TeacherShell title="Profil" teacherName="">
      <p>Profil</p>
    </TeacherShell>,
  );
  expect(mobile().getByRole('link', { name: 'Profil' }).getAttribute('aria-current')).toBe('page');
  expect(mobile().getByRole('link', { name: 'Kelas' }).getAttribute('aria-current')).toBeNull();
});
it.each(['loading', 'error', 'disabled', 'signed_out'])(
  'does not expose ready navigation in auth state %s',
  (status) => {
    fixture.status = status;
    mount();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Buka profil' })).toBeNull();
    expect(screen.getByText('Konten halaman')).toBeTruthy();
  },
);
it('keeps unverified teachers outside the ready shell navigation', () => {
  fixture.verified = false;
  mount();
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.queryByText('Guru terverifikasi')).toBeNull();
});
it('retries real logout after failure and only redirects after successful logout', async () => {
  fixture.logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Keluar akun' }));
  await screen.findByRole('alert');
  expect(fixture.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keluar akun' }));
  await waitFor(() => expect(fixture.replace).toHaveBeenCalledWith('/'));
  expect(fixture.logout).toHaveBeenCalledTimes(2);
});
