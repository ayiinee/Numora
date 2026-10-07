'use client';

import { useState } from 'react';
import { Button } from '@tka/ui';

interface OnboardingShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/** Clean centered layout with NUMORA branding */
export function OnboardingShell({ children, title, description }: OnboardingShellProps) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <svg width="180" height="48" viewBox="0 0 180 48" fill="none">
            <circle cx="24" cy="24" r="20" fill="var(--numora-purple)" />
            <circle cx="24" cy="24" r="14" fill="var(--numora-peach)" />
            <circle cx="18" cy="21" r="4" fill="var(--numora-purple)" />
            <circle cx="30" cy="21" r="4" fill="var(--numora-purple)" />
            <path
              d="M15 30 Q24 38 33 30"
              stroke="var(--numora-gold)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Title */}
        {title && (
          <h1
            style={{
              fontSize: 'clamp(28px, 6vw, 40px)',
              fontWeight: 900,
              textAlign: 'center',
              margin: '0 0 8px',
              color: 'var(--color-text)',
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
        )}

        {/* Description */}
        {description && (
          <p
            style={{
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              marginBottom: 32,
              fontSize: 'var(--text-base)',
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        )}

        {/* Card */}
        <div
          style={{
            width: '100%',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-md)',
            padding: '28px 20px',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        <p
          style={{
            marginTop: 32,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          NUMORA v1.0 - TKA Mathematics SMP
        </p>
      </div>
    </main>
  );
}

/** Login Card with Google button */
export function LoginCard({
  onGoogleLogin,
  loading,
  error,
}: {
  onGoogleLogin?: () => void;
  loading?: boolean;
  error?: string;
}) {
  return (
    <>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Selamat Datang</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          Masuk untuk mulai belajar matematika
        </p>
      </div>

      <button
        onClick={onGoogleLogin}
        disabled={loading}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          height: 48,
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 700,
          fontSize: 'var(--text-base)',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          transition: 'all var(--transition-fast)',
        }}
      >
        <GoogleIcon />
        {loading ? 'Memuat...' : 'Masuk dengan Google'}
      </button>

      {error && (
        <p
          role="alert"
          style={{
            marginTop: 16,
            color: 'var(--color-danger)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}

      <p
        style={{
          marginTop: 20,
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
        }}
      >
        Dengan masuk, Anda menyetujui Syarat Layanan dan Kebijakan Privasi NUMORA.
      </p>
    </>
  );
}

/** Role selection card */
export function RoleSelectionCard({
  selectedRole,
  onSelect,
}: {
  selectedRole?: string;
  onSelect: (role: 'STUDENT' | 'TEACHER') => void;
}) {
  return (
    <>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Pilih Peran</h2>
      <p
        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 24px' }}
      >
        Anda ingin masuk sebagai?
      </p>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
          }}
        >
          Pilih peran
        </legend>
        <div style={{ display: 'grid', gap: 12 }}>
          <RoleOption
            type="STUDENT"
            title="Siswa"
            description="Belajar matematika TKA, latihan soal, tryout mingguan"
            icon="📚"
            selected={selectedRole === 'STUDENT'}
            onSelect={onSelect}
          />
          <RoleOption
            type="TEACHER"
            title="Guru"
            description="Kelola kelas, pantau progress siswa"
            icon="👨‍🏫"
            selected={selectedRole === 'TEACHER'}
            onSelect={onSelect}
          />
        </div>
      </fieldset>
    </>
  );
}

function RoleOption({
  type,
  title,
  description,
  icon,
  selected,
  onSelect,
}: {
  type: 'STUDENT' | 'TEACHER';
  title: string;
  description: string;
  icon: string;
  selected: boolean;
  onSelect: (r: 'STUDENT' | 'TEACHER') => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: selected ? 'var(--color-primary-light)' : 'var(--color-surface)',
        border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      <input
        type="radio"
        name="role"
        value={type}
        checked={selected}
        onChange={() => onSelect(type)}
        style={{ width: 20, height: 20, accentColor: 'var(--color-primary)' }}
      />
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{title}</p>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            margin: '2px 0 0',
          }}
        >
          {description}
        </p>
      </div>
    </label>
  );
}

/** Success after role selection */
export function SuccessCard({
  role,
  onContinue,
}: {
  role: 'STUDENT' | 'TEACHER';
  onContinue: () => void;
}) {
  return (
    <>
      <div
        style={{
          width: 64,
          height: 64,
          margin: '0 auto 20px',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--color-success-light)',
          borderRadius: '50%',
          fontSize: 32,
        }}
      >
        ✓
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }}>
        Berhasil terdaftar sebagai {role === 'STUDENT' ? 'Siswa' : 'Guru'}!
      </h2>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        {role === 'STUDENT'
          ? 'Selamat belajar matematika TKA!'
          : 'Sekarang Anda bisa mengelola kelas dan siswa.'}
      </p>
      <Button onClick={onContinue} fullWidth style={{ height: 48, fontWeight: 700 }}>
        Lanjutkan ke {role === 'STUDENT' ? 'Beranda' : 'Dashboard'}
      </Button>
    </>
  );
}

/** Teacher verification required */
export function VerificationRequiredCard({ onRequestToken }: { onRequestToken: () => void }) {
  return (
    <>
      <div
        style={{
          width: 64,
          height: 64,
          margin: '0 auto 20px',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--color-warning-light)',
          borderRadius: '50%',
          fontSize: 32,
        }}
      >
        🔐
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }}>
        Verifikasi Diperlukan
      </h2>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          marginBottom: 24,
          lineHeight: 1.6,
        }}
      >
        Guru memerlukan token verifikasi dari Admin untuk mengelola kelas. Hubungi Admin untuk
        mendapatkan token.
      </p>
      <Button onClick={onRequestToken} fullWidth>
        Saya Punya Token
      </Button>
    </>
  );
}

/** Token input card */
export function TokenCard({
  onSubmit,
  loading,
  error,
  onBack,
}: {
  onSubmit: (token: string) => void;
  loading?: boolean;
  error?: string;
  onBack: () => void;
}) {
  const [token, setToken] = useState('');

  return (
    <>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--color-primary)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          marginBottom: 16,
          padding: 0,
        }}
      >
        ← Kembali
      </button>

      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Masukkan Token</h2>
      <p
        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '0 0 24px' }}
      >
        Token verifikasi dari Admin sekolah
      </p>

      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="TOKEN-XXXXX-XXXXX"
        style={{
          width: '100%',
          height: 48,
          padding: '0 16px',
          fontSize: 'var(--text-base)',
          border: `2px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          outline: 'none',
          marginBottom: error ? 8 : 16,
        }}
      />

      {error && (
        <p
          role="alert"
          style={{
            color: 'var(--color-danger)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={() => token.trim() && onSubmit(token.trim())}
        disabled={!token.trim() || loading}
        style={{
          width: '100%',
          height: 48,
          background: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontWeight: 700,
          fontSize: 'var(--text-base)',
          cursor: token.trim() && !loading ? 'pointer' : 'not-allowed',
          opacity: token.trim() && !loading ? 1 : 0.6,
          transition: 'opacity var(--transition-fast)',
        }}
      >
        {loading ? 'Memverifikasi...' : 'Verifikasi Token'}
      </button>
    </>
  );
}

/* Google "G" icon inline SVG */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.61c-.26-1.51-1.02-2.79-2.19-3.65v2.98h-3.52c2.03-1.86 3.21-4.61 3.21-7.86 0-.78-.07-1.53-.2-2.25H6.01v3.02h6.44c-.27 1.15-.43 2.38-.43 3.72 0 .41.04.1.19.1.19l7.28 5.71c1.62-1.5 2.6-3.69 2.6-6.35v.46z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-3.56c-.99.66-2.26 1.06-3.72 1.06-1.06 0-2.05-.44-2.73-1.16l-4.53 4.53v-2.86h-.04A10 10 0 0 1 2.18 23c1.77 3.52 5.39 5.92 9.82 5.92v.46z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V6.7H2.18A10 10 0 0 1 1.99 12c0-.11.01-.22.01-.33l6.41-5.02c.49 3.39 1.93 6.28 4.24 8.4l4.02-3.2z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1c-4.44 0-8.05 1.64-10.74 4.27l3.55 3.15C1.96 9.11 3.66 9.74 5.24 8.86z"
        fill="#EA4335"
      />
    </svg>
  );
}
