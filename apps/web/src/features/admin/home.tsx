'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Icon } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { destination } from '@/features/onboarding/destination';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { adminNavigation, adminRoleLabel } from './navigation';

export function AdminHomeScreen() {
  const { state, refresh } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/admin/login');
    if (state.status === 'ready' && state.profile.role !== 'ADMIN') {
      router.replace(destination(state.profile));
    }
    if (
      state.status === 'ready' &&
      state.profile.role === 'ADMIN' &&
      state.profile.status === 'ACTIVE' &&
      state.profile.adminRole === 'CONTENT_DATA_MODERATION'
    ) {
      router.replace('/admin/content');
    }
  }, [router, state]);

  const profile =
    state.status === 'ready' && state.profile.role === 'ADMIN' && state.profile.status === 'ACTIVE'
      ? state.profile
      : null;
  const modules = adminNavigation(profile).filter(({ href }) => href !== '/admin');
  if (profile?.adminRole === 'CONTENT_DATA_MODERATION') return null;
  return (
    <AdminFrame
      title="Ringkasan Admin"
      description="Satu ruang untuk mengakses modul administrasi Numora."
      icon="chart"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akun Admin…" />
      ) : !profile ? (
        <AdminMessage
          error={state.status === 'error' || state.status === 'disabled'}
          message={
            state.status === 'disabled'
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
      ) : (
        <div className="page-stack">
          <Card className="admin-home-intro">
            <h2>Selamat datang, {profile.displayName}</h2>
            <p>{adminRoleLabel(profile.adminRole)} · Pilih modul untuk memulai pekerjaan.</p>
          </Card>
          {modules.length === 0 ? (
            <AdminMessage
              message="Belum ada modul yang tersedia untuk assignment akun ini. Hubungi Super Admin, lalu periksa kembali akses."
              retry={() => void refresh()}
            />
          ) : (
            <div className="admin-home-grid">
              {modules.map((item) => (
                <Card key={item.href} className="admin-home-module">
                  <Icon name={item.icon} />
                  <h2>
                    <Link href={item.href}>{item.label}</Link>
                  </h2>
                  <p>{item.description}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminFrame>
  );
}
