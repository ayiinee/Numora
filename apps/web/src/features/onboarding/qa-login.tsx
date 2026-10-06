'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brand, Button } from '@tka/ui';
import { getSupabase } from '@/lib/supabase';
import { destination, useAuth } from './auth';

export function QaLogin() {
  const router = useRouter();
  const { state } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (state.status === 'ready') router.replace(destination(state.profile));
  }, [router, state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^numora-qa-(admin|teachera|teacherb|studenta|studentb|studentc)@example\.invalid$/.test(email)) {
      setError('Gunakan akun QA Development.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: authError } = await getSupabase().auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Login QA gagal. Periksa akun dan password.');
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-frame">
        <header className="brand">
          <Link href="/" className="auth-home-link" aria-label="Kembali ke halaman utama NUMORA">
            <Brand />
          </Link>
        </header>
        <section className="panel form-panel" aria-label="Login QA Development">
          <span className="eyebrow">Development · QA</span>
          <h1>Masuk akun QA</h1>
          <p>Akun email sementara ini hanya untuk pengujian Development. Pengguna produk tetap masuk dengan Google.</p>
          {state.status === 'ready' ? <p role="status">Membuka halaman…</p> : (
            <form onSubmit={(event) => void submit(event)}>
              <label className="field-label" htmlFor="qa-email">Email QA</label>
              <input className="text-input" id="qa-email" type="email" autoComplete="username"
                value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label className="field-label" htmlFor="qa-password">Password QA</label>
              <input className="text-input" id="qa-password" type="password" autoComplete="current-password"
                value={password} onChange={(event) => setPassword(event.target.value)} required />
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button className="primary-button" type="submit" disabled={busy || state.status === 'loading'}>
                {busy ? 'Masuk…' : 'Masuk ke Development'}
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
