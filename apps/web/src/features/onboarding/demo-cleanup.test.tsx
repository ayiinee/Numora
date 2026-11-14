import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoginScreen } from './screens';
import { AdminLoginScreen } from '@/features/admin/login';
import { TryoutWaiting } from '@/features/core-learning/tryout-presentation';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('./auth', () => ({
  useAuth: () => ({ state: { status: 'signed_out' }, refresh: vi.fn(), logout: vi.fn() }),
  destination: () => '/',
}));
afterEach(cleanup);

it('offers Student and Google login without Admin or internal QA links or preset credentials', () => {
  render(<LoginScreen />);
  expect(screen.getByRole('button', { name: 'Masuk dengan email' })).toBeTruthy();
  expect((screen.getByLabelText(/Email Siswa/) as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('button', { name: 'Lanjutkan dengan Google' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Masuk Admin' })).toBeNull();
  expect(document.querySelector('a[href="/qa/login"], a[href^="/demo"]')).toBeNull();
  expect(screen.queryByText(/demo|QA Development/i)).toBeNull();
});

it('keeps Admin credentials empty', () => {
  render(<AdminLoginScreen />);
  expect((screen.getByRole('textbox', { name: 'Email Admin' }) as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
});

it('shows readiness without promising release while content or scoring is pending', () => {
  const view = render(<TryoutWaiting resultPendingReason="CONTENT_PENDING" />);
  expect(screen.getByRole('heading', { name: 'Menunggu hasil' })).toBeTruthy();
  expect(screen.getByText(/konten penilaian sedang disiapkan/i)).toBeTruthy();
  expect(screen.getByText(/nilai dan pembahasan tersedia setelah hasil dirilis/i)).toBeTruthy();
  expect(screen.queryByText(/tenggat rilis|72 jam|DEMO/i)).toBeNull();
  view.rerender(<TryoutWaiting resultDueAt="2026-11-16T12:00:00Z" />);
  expect(screen.getByText(/Tenggat rilis .*19\.00 WIB/)).toBeTruthy();
});
