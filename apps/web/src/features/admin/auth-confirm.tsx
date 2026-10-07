'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand, Button } from '@tka/ui';
import { getSupabase } from '@/lib/supabase';
import { ApiProblem, apiRequest, getIdentity } from '@/lib/api';
import type { AdminInvitationDto } from './generated-types';
import { useAuth } from '@/features/onboarding/auth';

export function AdminAuthConfirmScreen() {
  const started = useRef(false);
  const { refresh } = useAuth();
  const [kind, setKind] = useState<'invite' | 'recovery' | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('Memeriksa tautan…');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const query = new URLSearchParams(window.location.search),
      fragment = new URLSearchParams(window.location.hash.slice(1));
    const type = query.get('type') ?? fragment.get('type');
    const hash = query.get('token_hash'),
      access = fragment.get('access_token'),
      renewal = fragment.get('refresh_token'),
      code = query.get('code');
    window.history.replaceState(null, '', '/admin/auth/confirm');
    void (async () => {
      try {
        if (type !== 'invite' && type !== 'recovery')
          throw new Error('Tautan tidak valid. Gunakan email invite atau recovery terbaru.');
        const auth = getSupabase().auth;
        const result = hash
          ? await auth.verifyOtp({ token_hash: hash, type })
          : access && renewal
            ? await auth.setSession({ access_token: access, refresh_token: renewal })
            : code && type === 'recovery'
              ? await auth.exchangeCodeForSession(code)
              : null;
        if (!result || result.error || !result.data.session)
          throw new Error(
            'Tautan telah dipakai, kedaluwarsa, atau tidak valid. Minta tautan terbaru.',
          );
        let action: 'invite' | 'recovery' = type;
        if (type === 'recovery') {
          try {
            const profile = await getIdentity(result.data.session.access_token);
            if (profile.role !== 'ADMIN')
              throw new Error('Recovery ini memerlukan akun Admin aktif.');
          } catch (error) {
            if (!(error instanceof ApiProblem) || error.code !== 'ACCOUNT_DISABLED') throw error;
            const invitation = await apiRequest<AdminInvitationDto>(
              'admin/invitation/status',
              result.data.session.access_token,
            );
            if (invitation.status !== 'INVITED') throw error;
            action = 'invite';
          }
        }
        setToken(result.data.session.access_token);
        setKind(action);
        setMessage('Tetapkan password pribadi untuk akun internal Anda.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Tautan belum dapat diverifikasi.');
      }
    })();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind || submitting.current) return;
    if (password !== confirmation) {
      setMessage('Konfirmasi password tidak sama.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error)
        throw new Error(
          'Password belum tersimpan. Ikuti persyaratan password provider dan coba lagi.',
        );
      if (kind === 'invite') await apiRequest('admin/invitation/accept', token, { method: 'POST' });
      setPassword('');
      setConfirmation('');
      setDone(true);
      setMessage('Password tersimpan. Akun siap digunakan.');
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Aktivasi belum selesai. Coba lagi pada sesi ini.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-shell">
      <div className="onboarding-frame">
        <Brand />
        <section className="panel form-panel">
          <h1>{kind === 'recovery' ? 'Pulihkan password Admin' : 'Terima undangan Admin'}</h1>
          <p role="status">{message}</p>
          {kind && !done && (
            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor="new-password">Password baru</label>
              <input
                className="text-input"
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="confirm-password">Ulangi password</label>
              <input
                className="text-input"
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <Button type="submit" loading={busy}>
                Simpan password dan lanjutkan
              </Button>
            </form>
          )}
          <Link href={done ? '/admin' : '/admin/login'}>
            {done ? 'Buka portal Admin' : 'Kembali ke login'}
          </Link>
        </section>
      </div>
    </main>
  );
}
