'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/onboarding/auth';
import { destination } from '@/features/onboarding/destination';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';

export function AdminEntryScreen() {
  const { state, refresh } = useAuth();
  const router = useRouter();
  const profile =
    state.status === 'ready' && state.profile.role === 'ADMIN' && state.profile.status === 'ACTIVE'
      ? state.profile
      : null;
  const target =
    profile?.adminRole === 'CONTENT_DATA_MODERATION'
      ? '/admin/content'
      : profile?.adminRole === 'SUPER_ADMIN' || profile?.adminRole === 'OPERATIONS'
        ? '/admin/schools'
        : null;

  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/admin/login');
    if (state.status === 'ready' && state.profile.role !== 'ADMIN')
      router.replace(destination(state.profile));
    if (target) router.replace(target);
  }, [router, state, target]);

  if (target) return null;
  return (
    <AdminFrame title="Akses Admin" description="Periksa akses akun untuk melanjutkan." icon="lock">
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akun Admin…" />
      ) : (
        <AdminMessage
          error={state.status === 'error' || state.status === 'disabled'}
          message={
            profile
              ? 'Belum ada modul yang tersedia untuk assignment akun ini. Hubungi Super Admin, lalu periksa kembali akses.'
              : state.status === 'disabled'
                ? 'Akun dinonaktifkan. Hubungi pengelola akun.'
                : state.status === 'registration'
                  ? 'Akun ini belum terdaftar sebagai Admin. Hubungi Super Admin.'
                  : state.status === 'error'
                    ? 'Akun belum dapat diperiksa. Coba lagi.'
                    : 'Masuk dengan akun Admin untuk membuka portal.'
          }
          login
          retry={() => void refresh()}
        />
      )}
    </AdminFrame>
  );
}
