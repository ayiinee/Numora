'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Icon, ListRow, SectionHeader } from '@tka/ui';
import { OwnAvatar as Avatar } from './user-avatar';
import { ProfileEditor } from './profile-editor';
import { TeacherShell } from '@/components/shell';
import { TeacherGate } from '@/features/monitoring/teacher-gate';
import { useAuth } from './auth';
import { useTeacherSignOut } from './teacher-session';
import { getTeacherClasses } from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { teacherKeys } from '@/features/monitoring/teacher-query';
import { TeacherSchoolMemberships } from '@/features/monitoring/teacher-school-memberships';

export function TeacherProfileScreen() {
  return (
    <TeacherGate>
      {(token, name) => <TeacherProfileContent name={name} token={token} />}
    </TeacherGate>
  );
}

function TeacherProfileContent({ name, token }: { name: string; token: string }) {
  const { state } = useAuth();
  const { busy, error, signOut } = useTeacherSignOut();
  const classes = useQuery({
    queryKey: teacherKeys.classes(),
    queryFn: () => getTeacherClasses(token),
  });
  if (state.status !== 'ready') return null;

  return (
    <TeacherShell title="Profil" teacherName={name}>
      <div className="teacher-profile-layout">
        <Card className="teacher-profile-identity teacher-identity-card">
          <Badge variant="success">
            <Icon name="school" width={16} height={16} /> Guru terverifikasi
          </Badge>
          <Avatar name={name} size="lg" />
          <h2>{name}</h2>
          <p>{state.profile.email}</p>
          <span className="teacher-identity-foot">Akun guru NUMORA</span>
        </Card>
        <div className="teacher-page-stack">
          <ProfileEditor />
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
              title="Kelas saya"
              subtitle={classes.isSuccess ? `${classes.data.items.length} kelas` : ''}
            />
            {classes.isPending || classes.isError ? (
              <DataState
                pending={classes.isPending}
                error={classes.error}
                retry={() => void classes.refetch()}
              />
            ) : (
              <Link className="teacher-account-link" href="/teacher">
                <ListRow
                  wrapText
                  dividers={false}
                  title={classes.data.items.length ? 'Buka daftar kelas' : 'Buat kelas pertama'}
                  description="Lihat anggota dan progres siswa."
                  leading={<Icon name="users" />}
                  trailing={<Icon name="chevron" />}
                />
              </Link>
            )}
          </Card>
          <TeacherSchoolMemberships token={token} />
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
