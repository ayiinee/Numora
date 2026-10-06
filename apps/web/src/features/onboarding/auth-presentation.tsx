'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Brand, Button, Icon } from '@tka/ui';

/** Presentation only: session, registration and redirects stay in screens/AuthProvider. */
export function AuthFrame({
  children,
  onboarding = false,
}: {
  children: ReactNode;
  onboarding?: boolean;
}) {
  return (
    <main className="auth-redesign-shell">
      <header className="auth-brand-header">
        <Link href="/" className="auth-home-link" aria-label="Kembali ke halaman utama NUMORA">
          <Brand />
        </Link>
        <span>TKA Matematika SMP</span>
      </header>
      <div className="auth-redesign-layout">
        <section className="auth-welcome" aria-label="Selamat datang di NUMORA">
          {/* <span className="auth-welcome-badge">
            <Icon name="graduation" width="16" height="16" /> Belajar bersama NUMORA
          </span> */}
          <h1>
            Matematika jadi lebih <em>terarah.</em>
          </h1>
          <p>Latihan bertahap, kenali progresmu, dan siapkan diri untuk TKA Matematika.</p>
          {onboarding && (
            <div className="auth-welcome-note">
              <Icon name="user" />
              <p>Satu akun Google untuk perjalananmu di NUMORA.</p>
            </div>
          )}
        </section>
        <div className="auth-content">{children}</div>
      </div>
      <footer className="auth-footer">Belajar matematika, satu langkah setiap hari.</footer>
    </main>
  );
}

export function AuthStatus({
  title,
  message,
  loading = false,
  retry,
}: {
  title: string;
  message: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <section className="auth-status" role={retry ? 'alert' : 'status'} aria-busy={loading}>
      <span className={`auth-status-icon${loading ? ' auth-status-loading' : ''}`}>
        <Icon name={retry ? 'info' : 'lock'} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      {retry && (
        <Button variant="secondary" fullWidth onClick={retry}>
          Coba lagi
        </Button>
      )}
    </section>
  );
}

export function GoogleIdentity({ name, email }: { name: string; email: string }) {
  return (
    <section className="auth-google-identity" aria-label="Akun Google">
      <span className="auth-identity-icon">
        <Icon name="user" />
      </span>
      <div>
        <span>Akun Google</span>
        <strong>{name || 'Nama belum tersedia'}</strong>
        <p>{email || 'Email belum tersedia'}</p>
      </div>
      <Icon name="lock" width="18" height="18" />
    </section>
  );
}
