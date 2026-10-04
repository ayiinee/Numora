'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Badge, Button, Card, Icon, ListRow, SectionHeader } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { TeacherGate } from '@/features/monitoring/teacher-screens';
import { useAuth } from './auth';

export function TeacherProfileScreen() {
  return <TeacherGate>{(_, name) => <TeacherProfileContent name={name} />}</TeacherGate>;
}

function TeacherProfileContent({ name }: { name: string }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
              description="Email akun · Google terhubung"
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
          </Card>
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
