'use client';

import type { ReactNode } from 'react';
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
        <Brand />
        <span>TKA Matematika SMP</span>
      </header>
      <div className="auth-redesign-layout">
        <section className="auth-welcome" aria-label="Selamat datang di NUMORA">
          <span className="auth-welcome-badge">
            <Icon name="graduation" width="16" height="16" /> Belajar bersama NUMORA
          </span>
          <h1>
            Matematika jadi lebih <em>terarah.</em>
          </h1>
          <p>Latihan bertahap, kenali progresmu, dan siapkan diri untuk TKA Matematika.</p>
          <div className="auth-welcome-art" aria-hidden="true">
            <span>x² + y²</span>
            <img src="/figma/numora-owl-source.png" alt="" width="96" height="134" />
            <Icon name="spark" width="32" height="32" />
          </div>
          <div className="auth-welcome-note">
            <Icon name={onboarding ? 'user' : 'book'} />
            <p>
              {onboarding
                ? 'Satu akun Google untuk perjalananmu di NUMORA.'
                : 'Untuk siswa mandiri, siswa sekolah, dan guru pendamping.'}
            </p>
          </div>
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
