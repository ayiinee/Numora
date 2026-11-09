'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, Icon, Input, Skeleton } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AppShell } from '@/components/shell';
import { joinClass, leaveClass } from '@/lib/api';
import type { DashboardClassDto } from './generated-types';
import { ProfileEditor } from '@/features/onboarding/profile-editor';
import { useProfilePhoto } from '@/features/onboarding/user-avatar';
import { DataState, StudentGate } from './ui';
import { learningApi } from './api';
import {
  ProfileIdentity,
  ProfileStats,
  ProfileTryout,
  ProfileSetting,
} from './account-presentation';
import { StudentSectionHeader } from './student-section-header';

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
  const [leaving, setLeaving] = useState<DashboardClassDto | null>(null);
  const photo = useProfilePhoto(state.status === 'ready' ? state.profile.id : undefined);
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
  const classes = dashboard.data?.classes ?? (dashboard.data?.class ? [dashboard.data.class] : []);

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
  async function leave() {
    if (!leaving || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await leaveClass(token, leaving.id);
      setLeaving(null);
      setSuccess('Berhasil keluar dari kelas. Progres dan riwayatmu tetap tersimpan.');
      await cache.invalidateQueries();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Belum dapat keluar kelas. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell className="student-profile-shell student-account-shell">
      <header>
        <StudentSectionHeader title="Profil" />
      </header>
      <div className="student-profile-layout">
        <section className="student-profile-overview" aria-label="Profil dan progres">
          <ProfileIdentity
            profile={profile}
            avatarUrl={photo.data?.url ?? undefined}
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
          <ProfileEditor />
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
            <ProfileSetting
              icon="users"
              title="Sekolah & Kelas"
              description={dashboard.data ? `${classes.length}/5 kelas aktif` : 'Memuat kelas'}
            >
              {dashboard.isPending || dashboard.isError ? (
                <DataState
                  pending={dashboard.isPending}
                  error={dashboard.error}
                  retry={() => void dashboard.refetch()}
                />
              ) : classes.length ? (
                <ul className="settings-list">
                  {classes.map((cls) => (
                    <li key={cls.id}>
                      <strong>{cls.name}</strong>
                      <p>{cls.schoolName}</p>
                      <Button
                        variant="danger-outline"
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setLeaving(cls);
                        }}
                      >
                        Keluar dari {cls.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Belajar mandiri. Gabung kelas bersifat opsional.</p>
              )}
            </ProfileSetting>
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
          {
            <Card
              id="gabung-kelas"
              className="student-profile-join"
              aria-labelledby="profile-join-title"
            >
              <h2 id="profile-join-title">Gabung kelas</h2>
              <p>
                Kamu dapat mengikuti maksimal lima kelas aktif. Progres dan XP tetap milik akunmu.
              </p>
              {classes.length >= 5 && (
                <p role="status">
                  Batas lima kelas aktif tercapai. Keluar dari salah satu kelas untuk bergabung
                  dengan kelas lain.
                </p>
              )}
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
                  disabled={busy || !dashboard.data || classes.length >= 5}
                />
                <Button
                  type="submit"
                  disabled={busy || !dashboard.data || classes.length >= 5 || !joinCode.trim()}
                >
                  {busy ? 'Menghubungkan…' : 'Gabung kelas'}
                </Button>
              </form>
            </Card>
          }
          {error && !leaving && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="success-message">
              {success}
            </p>
          )}
          <Dialog
            open={leaving !== null}
            onClose={() => setLeaving(null)}
            pending={busy}
            title={`Keluar dari ${leaving?.name ?? 'kelas'}?`}
            description="Keanggotaan kelas akan berakhir. Progres, riwayat, XP, dan feedback lama tetap tersimpan."
            actions={
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setLeaving(null)}>
                  Batal
                </Button>
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={busy}
                  onClick={() => void leave()}
                >
                  Konfirmasi keluar kelas
                </Button>
              </>
            }
          >
            {leaving && error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </Dialog>
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
