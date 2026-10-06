'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, Input, Skeleton } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AppShell } from '@/components/shell';
import { joinClass } from '@/lib/api';
import { DataState, StudentGate } from './ui';
import { learningApi } from './api';
import {
  AccountHeader,
  ProfileIdentity,
  ProfileStats,
  ProfileTryout,
  ProfileSetting,
} from './account-presentation';

export function ProfileScreen() {
  return <StudentGate>{(token) => <ProfileContent token={token} />}</StudentGate>;
}

function ProfileContent({ token }: { token: string }) {
  const { state, logout, refresh } = useAuth();
  const router = useRouter();
  const cache = useQueryClient();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const tryout = useQuery({
    queryKey: ['current-tryout'],
    queryFn: () => learningApi.currentTryout(token),
  });
  if (state.status !== 'ready') return null;
  const profile = state.profile;
  const school = profile.studentAffiliation === 'SCHOOL';

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await joinClass(token, joinCode.trim());
      setSuccess('Berhasil bergabung dengan kelas.');
      setJoinCode('');
      await cache.invalidateQueries();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Belum dapat bergabung. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }
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
  const avatar = state.session.user?.user_metadata?.avatar_url;
  return (
    <AppShell className="student-profile-shell student-account-shell">
      <AccountHeader title="Profil" settings />
      <div className="student-profile-layout">
        <section className="student-profile-overview" aria-label="Profil dan progres">
          <ProfileIdentity
            profile={profile}
            avatarUrl={typeof avatar === 'string' ? avatar : undefined}
            data={dashboard.data}
            progressState={
              dashboard.isPending ? (
                <>
                  <Skeleton height={14} width="70%" />
                  <Skeleton height={8} />
                </>
              ) : (
                <p>Progres belum dapat dimuat.</p>
              )
            }
          />
          {dashboard.isPending ? (
            <div className="student-profile-stats" aria-label="Memuat statistik">
              <Skeleton height={96} />
              <Skeleton height={96} />
            </div>
          ) : dashboard.isError ? (
            <Card>
              <DataState
                pending={false}
                error={dashboard.error}
                retry={() => void dashboard.refetch()}
              />
            </Card>
          ) : (
            <ProfileStats data={dashboard.data} />
          )}
          {tryout.isPending ? (
            <Skeleton height={84} />
          ) : tryout.isError ? (
            <Card>
              <DataState pending={false} error={tryout.error} retry={() => void tryout.refetch()} />
            </Card>
          ) : (
            <ProfileTryout data={tryout.data} />
          )}
          <Link className="button-link student-profile-report" href="/student/assessment">
            Lihat Rapor & Statistik Lengkap <Icon name="arrow" width={18} height={18} />
          </Link>
        </section>
        <div className="student-profile-account">
          <Card
            id="pengaturan-akun"
            className="student-profile-settings"
            aria-labelledby="profile-settings-title"
          >
            <h2 id="profile-settings-title">PENGATURAN BELAJAR & AKUN</h2>
            <ProfileSetting
              icon="user"
              title="Data Diri & Akun Siswa"
              description={`${profile.email} (Google terhubung)`}
            >
              <dl>
                <div>
                  <dt>Nama</dt>
                  <dd>{profile.displayName}</dd>
                </div>
                <div>
                  <dt>Email akun</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div>
                  <dt>Login</dt>
                  <dd>Google</dd>
                </div>
              </dl>
            </ProfileSetting>
            {school ? (
              <ProfileSetting
                icon="users"
                title={
                  dashboard.data?.class
                    ? `Sekolah & Kelas ${dashboard.data.class.name}`
                    : 'Sekolah & Kelas'
                }
                description={dashboard.data?.class?.schoolName ?? 'Terhubung dengan kelas'}
              >
                <p>Terhubung dengan kelas</p>
                {dashboard.data?.class && (
                  <p>
                    {dashboard.data.class.name} · {dashboard.data.class.schoolName}
                  </p>
                )}
                <p>Kamu sudah menjadi bagian dari satu kelas.</p>
              </ProfileSetting>
            ) : (
              <ProfileSetting
                icon="users"
                title="Sekolah & Kelas"
                description="Belajar mandiri · gabung kelas opsional"
                href="#gabung-kelas"
              />
            )}
            <ProfileSetting
              icon="clock"
              title="Riwayat Drill & Pembahasan"
              description="Lihat hasil dan riwayat latihanmu."
              href="/student/assessment"
            />
            <ProfileSetting
              icon="clipboard"
              title="Tryout & Hasil IRT"
              description="Paket dan hasil mengikuti rilis server."
              href="/student/tryout"
            />
            <ProfileSetting
              icon="chat"
              title="Feedback dari Guru"
              description="Baca pesan dan masukan dari guru."
              href="/student/feedback"
            />
            <ProfileSetting
              icon="book"
              title="Latihan Soal"
              description="Pilih bab dan subbab untuk berlatih."
              href="/student/learn"
            />
          </Card>
          {!school && (
            <Card
              id="gabung-kelas"
              className="student-profile-join"
              aria-labelledby="profile-join-title"
            >
              <h2 id="profile-join-title">Gabung kelas</h2>
              <p>
                Masukkan kode kelas yang diberikan oleh gurumu. Drill, Tryout, dan PvP tetap dapat
                diakses sebagai siswa Mandiri sesuai ketersediaan layanan.
              </p>
              <form className="student-profile-join__form" onSubmit={join}>
                <Input
                  label="Kode kelas"
                  minLength={6}
                  maxLength={32}
                  pattern="(?:[A-Za-z0-9]{6}|[A-Za-z0-9_\x2D]{8,32})"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.trim())}
                  placeholder="Kode dari guru"
                  required
                  autoComplete="off"
                  disabled={busy}
                />
                <Button type="submit" disabled={busy || !joinCode.trim()}>
                  {busy ? 'Menghubungkan…' : 'Gabung kelas'}
                </Button>
              </form>
            </Card>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="success-message">
              {success}
            </p>
          )}
          <Button
            variant="danger-outline"
            fullWidth
            onClick={() => void signOut()}
            disabled={busy}
            className="student-profile-logout"
          >
            <Icon name="logout" width={18} height={18} />{' '}
            {busy ? 'Mohon tunggu…' : 'Keluar Akun Google'}
          </Button>
          <p className="student-profile-note">
            Progres dan riwayat belajar tersimpan di akun Numora.
          </p>
          <p className="student-profile-note">NUMORA · Persiapan TKA Matematika SMP</p>
        </div>
      </div>
    </AppShell>
  );
}
