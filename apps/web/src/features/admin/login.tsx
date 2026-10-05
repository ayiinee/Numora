'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Brand, Button } from '@tka/ui';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/onboarding/auth';
import { destination } from '@/features/onboarding/destination';

export function AdminLoginScreen() {
  const router = useRouter();
  const { state, refresh, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    if (state.status === 'ready' && state.profile.role === 'ADMIN') router.replace('/admin');
  }, [router, state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError)
        throw new Error('Login Admin gagal. Periksa email dan password, lalu coba lagi.');
      setPassword('');
    } catch {
      setError('Login Admin gagal. Periksa email, password, dan koneksi, lalu coba lagi.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function switchAccount() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch {
      setError('Belum dapat keluar dari akun. Periksa koneksi, lalu coba lagi.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const formVisible = state.status === 'signed_out' || state.status === 'error';
  return (
    <main className="onboarding-shell">
      <div className="onboarding-frame">
        <header className="brand">
          <Brand />
        </header>
        <section className="panel form-panel" aria-label="Login internal Admin">
          <span className="eyebrow">Ruang Admin</span>
          <h1>Masuk Admin</h1>
          <p>Gunakan akun internal yang sudah disediakan. Akses modul mengikuti assignment akun.</p>
          {state.status === 'loading' ||
          (state.status === 'ready' && state.profile.role === 'ADMIN') ? (
            <p role="status">Memeriksa akun dan membuka portal…</p>
          ) : state.status === 'ready' ? (
            <div className="page-stack">
              <p role="alert">Akun yang sedang digunakan bukan akun Admin.</p>
              <Link href={destination(state.profile)}>Kembali ke halaman akun</Link>
              <Button variant="secondary" loading={busy} onClick={() => void switchAccount()}>
                Ganti akun
              </Button>
            </div>
          ) : state.status === 'registration' || state.status === 'disabled' ? (
            <div className="page-stack">
              <p role="alert">
                {state.status === 'disabled'
                  ? 'Akun dinonaktifkan. Hubungi pengelola akun.'
                  : 'Akun ini belum terdaftar sebagai Admin. Hubungi Super Admin.'}
              </p>
              <Button variant="secondary" loading={busy} onClick={() => void switchAccount()}>
                Ganti akun
              </Button>
            </div>
          ) : null}
          {state.status === 'error' && (
            <div className="page-stack">
              <p role="alert">Akun belum dapat diperiksa. Periksa koneksi dan coba lagi.</p>
              <Button variant="secondary" onClick={() => void refresh()}>
                Periksa lagi
              </Button>
            </div>
          )}
          {formVisible && (
            <form onSubmit={(event) => void submit(event)}>
              <label className="field-label" htmlFor="admin-email">
                Email Admin
              </label>
              <input
                className="text-input"
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={busy}
              />
              <label className="field-label" htmlFor="admin-password">
                Password
              </label>
              <input
                className="text-input"
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={busy}
              />
              <Button className="primary-button" type="submit" fullWidth loading={busy}>
                Masuk ke portal Admin
              </Button>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="auth-account-note">
            <Link href="/">Masuk sebagai Siswa atau Guru</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
