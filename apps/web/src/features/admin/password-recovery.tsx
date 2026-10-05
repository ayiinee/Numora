'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Brand, Button } from '@tka/ui';
import { getSupabase } from '@/lib/supabase';
export function AdminPasswordRecoveryScreen() {
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const sending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/admin/auth/confirm?type=recovery',
      });
      setMessage(
        'Jika alamat terdaftar dan pengiriman tersedia, tautan recovery akan dikirim. Periksa email atau hubungi Super Admin.',
      );
    } catch {
      setMessage('Pengiriman belum dapat diminta. Periksa koneksi dan coba lagi.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-shell">
      <div className="onboarding-frame">
        <Brand />
        <section className="panel form-panel">
          <h1>Pulihkan password Admin</h1>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="recovery-email">Email Admin</label>
            <input
              className="text-input"
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" loading={busy}>
              Kirim tautan recovery
            </Button>
          </form>
          {message && <p role="status">{message}</p>}
          <Link href="/admin/login">Kembali ke login</Link>
        </section>
      </div>
    </main>
  );
}
