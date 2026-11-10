'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@tka/ui';
import { LoginLayout } from '@/features/onboarding/login-layout';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/onboarding/auth';
import { destination } from '@/features/onboarding/destination';

export function AdminLoginScreen() {
  const router = useRouter();
  const { state, refresh, logout } = useAuth();
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_GENERATOR_DEMO_QA_EMAIL ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    if (state.status === 'ready' && state.profile.role === 'ADMIN')
      router.replace(
        process.env.NEXT_PUBLIC_GENERATOR_DEMO === 'true' ? '/admin/content/generator' : '/admin',
      );
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
      await refresh();
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
    <LoginLayout audience="admin">
      <section className="login-card" aria-label="Login internal Admin">
        <h1>Masuk Admin</h1>
        <p className="login-description">Gunakan akun pengelola yang sudah disediakan untukmu.</p>
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
            <p role="alert">
              {state.message ?? 'Akun belum dapat diperiksa. Periksa koneksi dan coba lagi.'}
            </p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Periksa lagi
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void switchAccount()}>
              Ganti akun
            </Button>
          </div>
        )}
        {formVisible && (
          <form onSubmit={(event) => void submit(event)}>
            <Input
              id="admin-email"
              label="Email Admin"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
            <Input
              id="admin-password"
              label="Password"
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
        <div className="login-links">
          <Link href="/admin/recovery">Lupa password Admin</Link>
          <Link href="/login">Masuk sebagai Siswa atau Guru</Link>
        </div>
      </section>
    </LoginLayout>
  );
}
