'use client';

import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, EmptyState, Icon, Input, SectionHeader, Select } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { TeacherShell } from '@/components/shell';
import { destination } from '@/features/onboarding/destination';
import { LearningProvider } from '@/features/core-learning/provider';
import { DataState, Status } from '@/features/core-learning/ui';
import {
  createTeacherClass,
  getClassStudents,
  getTeacherClasses,
  getTeacherStudentProgress,
  ApiProblem,
} from '@/lib/api';
import {
  MonitoredLevelCard,
  TeacherClassCard,
  TeacherStudentRow,
  TeacherWelcome,
} from './teacher-presentation';

export function TeacherGate({
  children,
}: {
  children: (token: string, name: string) => ReactNode;
}) {
  const { state, refresh } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'signed_out') router.replace('/');
    if (state.status === 'registration') router.replace('/onboarding');
    if (state.status === 'ready' && destination(state.profile) !== '/teacher')
      router.replace(destination(state.profile));
  }, [router, state]);
  if (state.status === 'ready' && destination(state.profile) === '/teacher')
    return (
      <LearningProvider key={state.profile.id}>
        {children(state.session.access_token, state.profile.displayName)}
      </LearningProvider>
    );
  return (
    <TeacherShell title="Ruang guru" teacherName="">
      {state.status === 'error' ? (
        <Status title="Akun belum dapat dimuat">
          <p>{state.message}</p>
          <Button onClick={() => void refresh()}>Coba lagi</Button>
        </Status>
      ) : state.status === 'disabled' ? (
        <Status title="Akun tidak aktif">Akses akun ini sedang tidak tersedia.</Status>
      ) : (
        <DataState pending />
      )}
    </TeacherShell>
  );
}
export function TeacherDashboardScreen() {
  return (
    <TeacherGate>
      {(token, name) => <TeacherDashboard token={token} teacherName={name} />}
    </TeacherGate>
  );
}
function TeacherDashboard({ token, teacherName }: { token: string; teacherName: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const [createdCode, setCreatedCode] = useState('');
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    setErrorStatus(0);
    try {
      const result = await createTeacherClass(token, name.trim());
      setCreatedCode(result.joinCode);
      setName('');
      await cache.invalidateQueries({ queryKey: ['teacher-classes'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kelas belum dapat dibuat.');
      setErrorStatus(err instanceof ApiProblem ? err.status : 0);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TeacherShell
      title="Kelas saya"
      description="Dampingi setiap langkah belajar siswa."
      teacherName={teacherName}
    >
      <div className="teacher-dashboard-layout">
        <TeacherWelcome name={teacherName} count={query.data?.items.length} />
        <Card className="teacher-create-card">
          <details className="teacher-create-details">
            <summary>
              <span className="icon-tile accent-0">
                <Icon name="users" />
              </span>
              <span>
                Buat kelas baru<small>Bagikan kode kelas kepada siswa.</small>
              </span>
              <Icon name="chevron" />
            </summary>
            <form className="teacher-create-form" onSubmit={create}>
              <Input
                label="Nama kelas"
                placeholder="Contoh: IX A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                required
              />
              <Button type="submit" loading={busy} disabled={busy || !name.trim()}>
                {busy ? 'Membuat…' : 'Buat kelas'}
              </Button>
            </form>
          </details>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {errorStatus === 401 && (
            <Link className="button-link" href="/">
              Masuk kembali
            </Link>
          )}
          {createdCode && (
            <p className="teacher-created-code" role="status">
              <Icon name="check" width={20} height={20} /> Kelas berhasil dibuat. Bagikan kode{' '}
              <strong>{createdCode}</strong> kepada siswa.
            </p>
          )}
        </Card>
        <section className="teacher-classes-section">
          <SectionHeader
            title="Kelas yang Anda dampingi"
            subtitle={query.data ? `${query.data.items.length} kelas` : ''}
          />
          {query.isPending || query.isError ? (
            <DataState
              pending={query.isPending}
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : query.data.items.length ? (
            <div className="teacher-class-grid">
              {query.data.items.map((cls, index) => (
                <TeacherClassCard key={cls.id} value={cls} index={index} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<Icon name="users" />}
                title="Kelas pertama dimulai di sini"
                description="Buat kelas dan bagikan kode bergabung kepada siswa."
              />
            </Card>
          )}
        </section>
      </div>
    </TeacherShell>
  );
}
export function ClassStudentsScreen({ classId }: { classId: string }) {
  return (
    <TeacherGate>
      {(token, name) => <ClassStudentsContent token={token} teacherName={name} classId={classId} />}
    </TeacherGate>
  );
}
function ClassStudentsContent({
  token,
  teacherName,
  classId,
}: {
  token: string;
  teacherName: string;
  classId: string;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('asc');
  const query = useQuery({
    queryKey: ['class-students', classId],
    queryFn: () => getClassStudents(token, classId),
  });
  const filtered = query.data?.items
    .filter((s) => s.displayName.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')))
    .sort((a, b) => (sort === 'asc' ? 1 : -1) * a.displayName.localeCompare(b.displayName, 'id'));
  return (
    <TeacherShell
      title={query.data?.class.name ?? 'Daftar siswa'}
      description="Kenali perkembangan siswa melalui hasil latihan mereka."
      teacherName={teacherName}
    >
      <div className="teacher-page-stack">
        <Link className="back-link" href="/teacher">
          <Icon name="back" />
          Kembali ke kelas saya
        </Link>
        <Card className="teacher-filter-card">
          <Input
            label="Cari siswa"
            type="search"
            placeholder="Nama siswa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Icon name="search" />}
          />
          <Select
            label="Urutkan"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={[
              { value: 'asc', label: 'Nama A–Z' },
              { value: 'desc', label: 'Nama Z–A' },
            ]}
          />
        </Card>
        {query.isPending || query.isError ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <section>
            <SectionHeader
              title="Siswa di kelas ini"
              subtitle={`${query.data.items.length} siswa bergabung`}
            />
            {filtered?.length ? (
              <Card className="teacher-students-card">
                {filtered.map((student) => (
                  <TeacherStudentRow
                    name={student.displayName}
                    href={`/teacher/classes/${classId}/students/${student.id}`}
                    key={student.id}
                  />
                ))}
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={<Icon name="users" />}
                  title={query.data.items.length ? 'Siswa tidak ditemukan' : 'Belum ada siswa'}
                  description={
                    query.data.items.length
                      ? 'Coba nama atau kata kunci lain.'
                      : 'Siswa yang bergabung menggunakan kode kelas akan tampil di sini.'
                  }
                />
              </Card>
            )}
          </section>
        )}
      </div>
    </TeacherShell>
  );
}
export function StudentProgressScreen({
  classId,
  studentId,
}: {
  classId: string;
  studentId: string;
}) {
  return (
    <TeacherGate>
      {(token, name) => (
        <StudentProgressContent
          token={token}
          teacherName={name}
          classId={classId}
          studentId={studentId}
        />
      )}
    </TeacherGate>
  );
}
function StudentProgressContent({
  token,
  teacherName,
  classId,
  studentId,
}: {
  token: string;
  teacherName: string;
  classId: string;
  studentId: string;
}) {
  const query = useQuery({
    queryKey: ['student-progress', classId, studentId],
    queryFn: () => getTeacherStudentProgress(token, classId, studentId),
  });
  return (
    <TeacherShell
      title={query.data?.student.displayName ?? 'Progres siswa'}
      description={query.data?.class.name}
      teacherName={teacherName}
    >
      <div className="teacher-page-stack">
        <Link className="back-link" href={`/teacher/classes/${classId}`}>
          <Icon name="back" />
          Kembali ke daftar siswa
        </Link>
        {query.isPending || query.isError ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="teacher-progress-summary">
              <Card className="teacher-student-identity">
                <Avatar name={query.data.student.displayName} size="lg" />
                <div>
                  <span className="eyebrow">Siswa di {query.data.class.name}</span>
                  <h2>{query.data.student.displayName}</h2>
                  <p>Nilai terakhir dan terbaik setiap level tercatat di bawah.</p>
                </div>
              </Card>
              <Card className="teacher-latest-score">
                <span className="teacher-score-label">
                  <Icon name="chart" width={18} height={18} /> Nilai Drill terakhir
                </span>
                <h2>{query.data.latestDrillScore ?? 'Belum ada latihan'}</h2>
                <p>
                  {query.data.latestDrillScore === null
                    ? 'Hasil tampil setelah latihan dikumpulkan.'
                    : 'Hasil latihan terakhir yang telah dikumpulkan.'}
                </p>
              </Card>
            </div>
            <SectionHeader title="Progres per level" />
            {query.data.levels.length ? (
              <div className="teacher-level-grid">
                {query.data.levels.map((level) => (
                  <MonitoredLevelCard key={level.levelId} value={level} />
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState
                  icon={<Icon name="book" />}
                  title="Belum ada level"
                  description="Progres tampil setelah materi tersedia."
                />
              </Card>
            )}
          </>
        )}
      </div>
    </TeacherShell>
  );
}
