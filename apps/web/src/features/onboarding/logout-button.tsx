'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@tka/ui';
import { useAuth } from './auth';

export function LogoutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        className="secondary-button"
        fullWidth={fullWidth}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await logout();
            router.replace('/login');
          } catch {
            setError('Belum dapat keluar. Coba lagi.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Sedang keluar…' : 'Keluar'}
      </Button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
