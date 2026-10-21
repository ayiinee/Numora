'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';

/**
 * Signing out happens from the Teacher sidebar and from the Profile screen. Both
 * used to keep their own copy of the lock and the failure text, so the wording
 * could drift apart. The lock is released on failure because the button doubles
 * as the retry; the message stays on screen instead.
 */
export function useTeacherSignOut() {
  const { logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logout();
      router.replace('/');
    } catch {
      setError('Belum dapat keluar. Coba lagi.');
      setBusy(false);
    }
  }

  return { busy, error, signOut };
}
