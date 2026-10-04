'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brand, Button, Icon, Input, Select } from '@tka/ui';
import { TeacherVerificationFrame } from '@/features/monitoring/teacher-presentation';
import { destination, useAuth } from './auth';
import { AuthFrame, AuthStatus, GoogleIdentity } from './auth-presentation';
import { getSupabase } from '@/lib/supabase';
import { ApiProblem, getSchools, verifyTeacher, type SchoolSummary } from '@/lib/api';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="onboarding-shell">
      <div className="onboarding-frame">
        <header className="brand">
          <Brand />
        </header>
        {children}
        <p className="page-footer">Belajar matematika, satu langkah setiap hari.</p>
      </div>
    </main>
  );
}

function Notice({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return (
    <section className="status-panel" role="status">
      <h2>{title}</h2>
      <p>{message}</p>
      {retry && (
        <Button className="secondary-button" onClick={retry}>
          Coba lagi
        </Button>
      )}
    </section>
  );
}

function LogoutButton({ fullWidth = false }: { fullWidth?: boolean }) {
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
            router.replace('/');
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

function Avatar({ name, photo }: { name: string; photo: unknown }) {
  const [failed, setFailed] = useState(false);
  let source = '';
  if (typeof photo === 'string') {
    try {
      const url = new URL(photo);
      if (
        url.protocol === 'https:' &&
        (url.hostname === 'googleusercontent.com' ||
          url.hostname.endsWith('.googleusercontent.com'))
      )
        source = photo;
    } catch {
      /* Use initials. */
    }
  }
  return (
    <span className="avatar" aria-hidden="true">
      {source && !failed ? (
        <img src={source} alt="" onError={() => setFailed(true)} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const { state, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (state.status === 'ready') router.replace(destination(state.profile));
    if (state.status === 'registration') router.replace('/onboarding');
  }, [router, state]);
  const login = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login belum berhasil. Coba lagi.');
      setBusy(false);
    }
  };
  return (
    <AuthFrame>
      <section className="auth-card" aria-labelledby="login-title">
        <span className="auth-card-icon">
          <Icon name="graduation" />
        </span>
        <span className="auth-eyebrow">Selamat datang</span>
        <h2 id="login-title">Mulai bersama NUMORA</h2>
        <p className="auth-card-description">
          Gunakan akun Google untuk melanjutkan belajar atau mendampingi siswa.
        </p>
        {state.status === 'loading' ||
        state.status === 'ready' ||
        state.status === 'registration' ? (
          <AuthStatus
            title="Memeriksa sesi…"
            message="Sebentar, kami sedang memeriksa akunmu."
            loading
          />
        ) : state.status === 'disabled' ? (
          <>
            <p className="form-error" role="alert">
              Akun ini tidak aktif.
            </p>
            <LogoutButton />
          </>
        ) : (
          <>
            {state.status === 'error' && (
              <p className="form-error" role="alert">
                {state.message}
              </p>
            )}
            {state.status === 'signed_out' && state.message && (
              <p className="form-error" role="alert">
                {state.message}
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button fullWidth loading={busy} disabled={state.status === 'error'} onClick={login}>
              {busy ? 'Menghubungkan ke Google…' : 'Lanjutkan dengan Google'}
            </Button>
            {state.status === 'error' && (
              <Button variant="secondary" fullWidth onClick={() => void refresh()}>
                Periksa lagi
              </Button>
            )}
          </>
        )}
        {process.env.NODE_ENV === 'development' && (
          <div className="demo-entry">
            <Link className="demo-entry-admin" href="/admin/preview">
              Lihat pratinjau Admin (development)
            </Link>
            {process.env.NEXT_PUBLIC_SUPABASE_URL ===
              'https://pkamenfnwmoeisccnrnk.supabase.co' && (
              <Link className="demo-entry-admin" href="/qa/login">
                Masuk dengan akun QA Development
              </Link>
            )}
          </div>
        )}
        <p className="auth-account-note">
          <Icon name="lock" width="16" height="16" /> Role dipilih sekali setelah login pertama.
        </p>
      </section>
    </AuthFrame>
  );
}

export function CallbackScreen() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code || params.has('error')) {
      setError('Login Google dibatalkan atau tidak berhasil.');
      return;
    }
    void (async () => {
      try {
        const { error: authError } = await getSupabase().auth.exchangeCodeForSession(code);
        if (authError) throw authError;
        router.replace('/');
      } catch {
        setError('Sesi login belum dapat dibuat. Coba masuk lagi.');
      }
    })();
  }, [router]);
  return (
    <AuthFrame>
      <section className="auth-card auth-callback-card" aria-label="Status login Google">
        <span className="auth-eyebrow">Login Google</span>
        {error ? (
          <AuthStatus
            title="Login belum berhasil"
            message={error}
            retry={() => router.replace('/')}
          />
        ) : (
          <AuthStatus
            title="Menyelesaikan login"
            message="Sebentar, kami sedang memeriksa akunmu."
            loading
          />
        )}
      </section>
    </AuthFrame>
  );
}

function RegistrationForm({ initialName, email }: { initialName: string; email: string }) {
  const { register } = useAuth();
  const [role, setRole] = useState<'STUDENT' | 'TEACHER' | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!role) {
      setError('Pilih role.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register(role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profil belum tersimpan. Coba lagi.');
      setBusy(false);
    }
  };
  return (
    <form
      className="auth-registration-form"
      aria-busy={busy}
      onSubmit={(event) => void submit(event)}
    >
      <GoogleIdentity name={initialName} email={email} />
      <fieldset className="auth-role-fieldset" disabled={busy} aria-describedby="role-policy">
        <legend>Saya masuk sebagai</legend>
        <div className="auth-role-options">
          <label className={`auth-role-option ${role === 'STUDENT' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="role"
              value="STUDENT"
              checked={role === 'STUDENT'}
              onChange={() => setRole('STUDENT')}
            />
            <span className="auth-role-icon">
              <Icon name="graduation" />
            </span>
            <span className="auth-role-copy">
              <strong>Siswa</strong>
              <span>Belajar dan melihat progres sendiri</span>
            </span>
          </label>
          <label className={`auth-role-option ${role === 'TEACHER' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="role"
              value="TEACHER"
              checked={role === 'TEACHER'}
              onChange={() => setRole('TEACHER')}
            />
            <span className="auth-role-icon">
              <Icon name="users" />
            </span>
            <span className="auth-role-copy">
              <strong>Guru</strong>
              <span>Mendampingi siswa setelah verifikasi sekolah</span>
            </span>
          </label>
        </div>
      </fieldset>
      <p className="auth-account-note" id="role-policy">
        <Icon name="info" width="18" height="18" /> Role tidak dapat diubah sendiri setelah profil
        disimpan.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button
        fullWidth
        type="submit"
        loading={busy}
        rightIcon={<Icon name="arrow" width="18" height="18" />}
      >
        {busy ? 'Menyimpan profil…' : 'Simpan dan lanjutkan'}
      </Button>
    </form>
  );
}

export function OnboardingScreen() {
  const router = useRouter();
  const { state, refresh } = useAuth();
  useEffect(() => {
    if (state.status === 'ready') router.replace(destination(state.profile));
    if (state.status === 'signed_out') router.replace('/');
  }, [router, state]);
  return (
    <AuthFrame onboarding>
      <section className="auth-card" aria-labelledby="onboarding-title">
        <span className="auth-eyebrow">Langkah pertama</span>
        <h2 id="onboarding-title">Lengkapi profilmu</h2>
        <p className="auth-card-description">
          Pilih cara kamu menggunakan NUMORA dan periksa akun Google yang terhubung.
        </p>
        {state.status === 'registration' && state.session ? (
          <>
            <RegistrationForm
              initialName={String(
                state.session.user.user_metadata.full_name ??
                  state.session.user.user_metadata.name ??
                  '',
              )}
              email={state.session.user.email ?? ''}
            />
            <div className="form-logout">
              <LogoutButton fullWidth />
            </div>
          </>
        ) : state.status === 'error' ? (
          <AuthStatus
            title="Profil belum dapat diperiksa"
            message={state.message ?? 'Coba lagi.'}
            retry={() => void refresh()}
          />
        ) : state.status === 'disabled' ? (
          <>
            <p className="form-error" role="alert">
              Akun ini tidak aktif.
            </p>
            <LogoutButton />
          </>
        ) : (
          <AuthStatus
            title="Memeriksa sesi…"
            message="Sebentar, kami sedang memeriksa akunmu."
            loading
          />
        )}
      </section>
    </AuthFrame>
  );
}

export function RoleHomeScreen({
  page,
}: {
  page: '/student' | '/teacher' | '/teacher/verification-required';
}) {
  const router = useRouter();
  const { state, refresh } = useAuth();
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && destination(state.profile) !== page)
      router.replace(destination(state.profile));
  }, [router, state, page]);
  const authorized = state.status === 'ready' && destination(state.profile) === page;
  const title =
    page === '/student'
      ? 'Halo, selamat datang!'
      : page === '/teacher'
        ? 'Selamat datang, Guru!'
        : 'Verifikasi sekolah diperlukan';
  return (
    <Shell>
      <section className="panel home-panel">
        {authorized ? (
          <>
            <span className="eyebrow">
              {state.profile.role === 'STUDENT' ? 'Area Siswa' : 'Area Guru'}
            </span>
            <h1>{title}</h1>
            <p>
              {page === '/teacher/verification-required'
                ? 'Akun Guru sudah dibuat. Fitur Guru akan tersedia setelah verifikasi sekolah pada tahap berikutnya.'
                : 'Login berhasil. Halaman utama untuk role ini akan dikembangkan pada tahap berikutnya.'}
            </p>
            <div className="identity-card">
              <Avatar
                name={state.profile.displayName}
                photo={state.session.user.user_metadata.avatar_url}
              />
              <div>
                <strong>{state.profile.displayName}</strong>
                <small>{state.profile.email}</small>
              </div>
            </div>
            <LogoutButton />
          </>
        ) : state.status === 'error' ? (
          <Notice
            title="Akun belum dapat diperiksa"
            message={state.message ?? 'Coba lagi.'}
            retry={() => void refresh()}
          />
        ) : state.status === 'disabled' ? (
          <>
            <Notice title="Akun tidak aktif" message="Akses akun ini sedang tidak tersedia." />
            <LogoutButton />
          </>
        ) : (
          <p className="inline-status" role="status">
            Memeriksa akses…
          </p>
        )}
      </section>
    </Shell>
  );
}

export function TeacherVerificationScreen() {
  const { state } = useAuth();
  const accountKey = state.status === 'ready' ? state.profile.id : state.status;
  return <TeacherVerificationContent key={accountKey} />;
}

function TeacherVerificationContent() {
  const router = useRouter();
  const { state, refresh } = useAuth();
  const [schools, setSchools] = useState<SchoolSummary[] | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const accessToken = state.status === 'ready' ? state.session.access_token : null;
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && destination(state.profile) !== '/teacher/verification-required')
      router.replace(destination(state.profile));
  }, [router, state]);
  useEffect(() => {
    if (!accessToken || state.status !== 'ready' || state.profile.role !== 'TEACHER') return;
    let active = true;
    getSchools(accessToken).then(
      (result) => {
        if (active) setSchools(result.items);
      },
      (cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Sekolah belum dapat dimuat.');
          setErrorStatus(cause instanceof ApiProblem ? cause.status : 0);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [accessToken, revision, state.status, state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !schoolId || !token.trim() || busy) return;
    setBusy(true);
    setError('');
    setErrorStatus(0);
    try {
      await verifyTeacher(accessToken, schoolId, token.trim());
      setToken('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verifikasi belum berhasil.');
      setErrorStatus(cause instanceof ApiProblem ? cause.status : 0);
      setBusy(false);
    }
  }
  return (
    <TeacherVerificationFrame>
      <section className="teacher-verification-content">
        <span className="eyebrow">Akses Guru</span>
        <h1>Verifikasi sekolah</h1>
        <p>Pilih sekolah lalu masukkan token sekali pakai dari Admin. Token berlaku 3×24 jam.</p>
        {state.status === 'ready' &&
        state.profile.role === 'TEACHER' &&
        !state.profile.teacherVerified ? (
          <>
            {schools === null && !error ? (
              <p role="status">Memuat sekolah…</p>
            ) : (
              <form
                className="teacher-verification-fields"
                onSubmit={(event) => void submit(event)}
              >
                <Select
                  label="Sekolah"
                  id="teacher-school"
                  value={schoolId}
                  onChange={(event) => setSchoolId(event.target.value)}
                  disabled={busy || !schools?.length}
                  placeholder="Pilih sekolah"
                  options={
                    schools?.map((school) => ({ value: school.id, label: school.name })) ?? []
                  }
                  required
                />
                {schools?.length === 0 && <p role="status">Belum ada sekolah aktif.</p>}
                <Input
                  label="Token verifikasi"
                  id="teacher-token"
                  minLength={8}
                  maxLength={128}
                  pattern="(?:[A-Za-z0-9]{8}|[A-Za-z0-9_\x2D]{32,128})"
                  autoCapitalize="none"
                  spellCheck={false}
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value.trim())}
                  disabled={busy}
                  leftIcon={<Icon name="lock" width={20} height={20} />}
                  helper="Token diberikan oleh Admin sekolah."
                  required
                />
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <Button fullWidth type="submit" loading={busy} disabled={busy || !schools?.length}>
                  {busy ? 'Memverifikasi…' : 'Verifikasi dan lanjutkan'}
                </Button>
              </form>
            )}
            {error && schools === null && (
              <Button
                className="secondary-button"
                onClick={() => {
                  setError('');
                  setErrorStatus(0);
                  setRevision((n) => n + 1);
                }}
              >
                Coba lagi
              </Button>
            )}
            {errorStatus === 401 && (
              <Link className="button-link" href="/">
                Masuk kembali
              </Link>
            )}
            <div className="form-logout">
              <LogoutButton />
            </div>
          </>
        ) : state.status === 'error' ? (
          <Notice
            title="Akun belum dapat diperiksa"
            message={state.message ?? 'Coba lagi.'}
            retry={() => void refresh()}
          />
        ) : state.status === 'disabled' ? (
          <Notice title="Akun tidak aktif" message="Akses akun ini sedang tidak tersedia." />
        ) : (
          <p role="status">Memeriksa akses…</p>
        )}
      </section>
    </TeacherVerificationFrame>
  );
}
