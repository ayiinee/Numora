'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, Icon, ListRow, SectionHeader } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { TeacherGate } from '@/features/monitoring/teacher-screens';
import { useAuth } from './auth';
import { getTeacherClasses } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { TeacherAnnouncement } from '@/features/monitoring/teacher-ui';

export function TeacherProfileScreen() {
  return (
    <TeacherGate>
      {(token, name) => <TeacherProfileContent name={name} token={token} />}
    </TeacherGate>
  );
}

function TeacherProfileContent({ name, token }: { name: string; token: string }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const classes = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  if (state.status !== 'ready') return null;

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

  return (
    <TeacherShell title="Profil & akun" teacherName={name}>
      <div className="teacher-profile-layout">
        <Card className="teacher-profile-identity teacher-identity-card">
          <Badge variant="success">
            <Icon name="school" width={16} height={16} /> Guru terverifikasi
          </Badge>
          <Avatar name={name} size="lg" />
          <h2>{name}</h2>
          <p>{state.profile.email}</p>
          <span className="teacher-identity-foot">Dampingi kelas dan perkembangan siswa.</span>
        </Card>
        <div className="teacher-page-stack">
          <Card className="teacher-account-card">
            <SectionHeader title="Informasi akun" />
            <ListRow wrapText title={name} description="Nama" leading={<Icon name="user" />} />
            <ListRow
              wrapText
              title={state.profile.email}
              description="Email akun"
              leading={<Icon name="mail" />}
            />
            <ListRow
              wrapText
              title={state.profile.teacherVerified ? 'Terverifikasi' : 'Belum terverifikasi'}
              description="Verifikasi sekolah"
              leading={<Icon name="school" />}
              dividers={false}
            />
          </Card>
          <Card className="teacher-account-card">
            <SectionHeader
              title="Kelas yang Anda dampingi"
              subtitle={classes.isSuccess ? `${classes.data.items.length} kelas` : ''}
            />
            {classes.isPending || classes.isError ? (
              <DataState
                pending={classes.isPending}
                error={classes.error}
                retry={() => void classes.refetch()}
              />
            ) : classes.data.items.length ? (
              classes.data.items.map((cls) => (
                <div className="teacher-profile-class" key={cls.id}>
                  <Link href={`/teacher/classes/${cls.id}`}>
                    <Icon name="users" />
                    <strong>{cls.name}</strong>
                    <Icon name="chevron" />
                  </Link>
                  <div>
                    <Link href={`/teacher/classes/${cls.id}/invite`}>Undang siswa</Link>
                    <Link href={`/teacher/classes/${cls.id}/settings`}>Pengaturan</Link>
                  </div>
                </div>
              ))
            ) : (
              <p>Belum ada kelas. Buat kelas pertama dari Kelas saya.</p>
            )}
          </Card>
          <Card className="teacher-account-card">
            <SectionHeader title="Akses cepat" />
            <Link className="teacher-account-link" href="/teacher">
              <ListRow
                wrapText
                dividers={false}
                title="Kelas saya"
                description="Lihat kelas dan progres siswa."
                leading={<Icon name="users" />}
                trailing={<Icon name="chevron" />}
                style={{ padding: 0, cursor: 'inherit' }}
              />
            </Link>
            <Link className="teacher-quick-link" href="/teacher/monitoring">
              <Icon name="chart" />
              <span>
                <strong>Monitoring akademik</strong>
                <small>Progres siswa di kelas Anda</small>
              </span>
              <Icon name="chevron" />
            </Link>
            <Link className="teacher-quick-link" href="/teacher/feedback">
              <Icon name="chat" />
              <span>
                <strong>Feedback siswa</strong>
                <small>Kirim dan lihat catatan belajar</small>
              </span>
              <Icon name="chevron" />
            </Link>
            <Link className="teacher-quick-link" href="/teacher/notifications">
              <Icon name="bell" />
              <span>
                <strong>Pusat Notifikasi</strong>
                <small>Notifikasi guru belum tersedia</small>
              </span>
              <Icon name="chevron" />
            </Link>
          </Card>
          <TeacherAnnouncement>
            Perubahan profil dan preferensi notifikasi belum tersedia. Informasi akun mengikuti akun
            yang Anda gunakan untuk masuk.
          </TeacherAnnouncement>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button
            variant="danger-outline"
            fullWidth
            onClick={() => void signOut()}
            loading={busy}
            disabled={busy}
          >
            <Icon name="logout" width={18} height={18} />{' '}
            {busy ? 'Sedang keluar…' : 'Keluar dari akun'}
          </Button>
        </div>
      </div>
    </TeacherShell>
  );
}
