'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  Input,
  SectionHeader,
  Select,
} from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { TeacherGate } from './teacher-gate';
export { TeacherGate } from './teacher-gate';
import { DataState } from '@/features/core-learning/ui';
import {
  createTeacherClass,
  getClassStudents,
  getTeacherClasses,
  getTeacherStudentProgress,
  ApiProblem,
} from '@/lib/api';
import { MonitoredLevelCard, TeacherClassCard, TeacherStudentRow } from './teacher-presentation';
import { useTeacherRosterCounts } from './teacher-data';
import { TeacherAnnouncement, TeacherMetric } from './teacher-ui';
import { TeacherInviteContent } from './teacher-class-tools';
import { TeacherAssessmentHistory } from './teacher-assessment-history';

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
  const [search, setSearch] = useState('');
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  const counts = useTeacherRosterCounts(token, query.isSuccess ? query.data.items : undefined);
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
        <TeacherAnnouncement>
          Bagikan kode kelas untuk mengajak siswa bergabung. Progres dan hasil latihan mereka dapat
          Anda pantau dari ruang guru.
        </TeacherAnnouncement>
        <div className="teacher-metrics teacher-dashboard-metrics">
          <TeacherMetric
            label="Kelas Anda"
            value={query.isSuccess ? query.data.items.length : '—'}
            icon="users"
            detail="Kelas yang Anda dampingi"
          />
          <TeacherMetric
            label="Siswa di kelas Anda"
            value={counts.total ?? '—'}
            icon="graduation"
            detail={
              counts.error
                ? 'Jumlah belum dapat dimuat'
                : counts.complete
                  ? 'Anggota aktif kelas yang Anda dampingi'
                  : 'Menunggu daftar anggota'
            }
          />
        </div>
        {counts.error && (
          <div className="teacher-aggregate-error" role="alert">
            <p>Jumlah siswa belum lengkap. Daftar kelas tetap dapat dibuka.</p>
            <Button variant="secondary" onClick={counts.retry}>
              Muat ulang jumlah siswa
            </Button>
          </div>
        )}
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
                maxLength={80}
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
          {query.isSuccess && query.data.items.length > 0 && (
            <Input
              label="Cari kelas"
              type="search"
              placeholder="Cari nama kelas…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leftIcon={<Icon name="search" />}
            />
          )}
          {query.isPending || query.isError ? (
            <DataState
              pending={query.isPending}
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : query.data.items.length ? (
            <div className="teacher-class-grid">
              {query.data.items
                .filter((cls) =>
                  cls.name.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
                )
                .map((cls) => (
                  <TeacherClassCard
                    key={cls.id}
                    value={cls}
                    index={query.data.items.indexOf(cls)}
                    count={counts.queries[query.data.items.indexOf(cls)]?.data?.items.length}
                  />
                ))}
              {!query.data.items.some((cls) =>
                cls.name.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
              ) && <EmptyState title="Kelas tidak ditemukan" description="Coba nama kelas lain." />}
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const classes = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  const cls = classes.data?.items.find((value) => value.id === classId);
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
      backHref="/teacher"
    >
      <div className="teacher-page-stack">
        {query.isSuccess && (
          <>
            <Card className="teacher-class-overview">
              <div>
                <span className="eyebrow">Ruang kelas</span>
                <h2>{query.data.class.name}</h2>
                <p>{query.data.items.length} siswa bergabung</p>
              </div>
              <div className="teacher-class-overview__code">
                <span>Kode kelas</span>
                <strong>{classes.isError ? 'Belum dapat dimuat' : (cls?.joinCode ?? '—')}</strong>
                {classes.isError && (
                  <Button variant="secondary" onClick={() => void classes.refetch()}>
                    Muat ulang kode
                  </Button>
                )}
              </div>
            </Card>
            <div className="teacher-class-actions">
              <Link
                className="button-link"
                href={`/teacher/classes/${classId}/invite`}
                onClick={(event) => {
                  if (window.matchMedia('(min-width: 960px)').matches) {
                    event.preventDefault();
                    setInviteOpen(true);
                  }
                }}
              >
                <Icon name="users" />
                Undang siswa
              </Link>
            </div>
            <TeacherAnnouncement>
              Daftar ini menampilkan anggota aktif kelas. Buka siswa untuk melihat progres atau
              mengirim feedback.
            </TeacherAnnouncement>
            <Dialog
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              title="Undang siswa"
              description="Bagikan kode kelas Anda."
              className="teacher-invite-dialog"
            >
              <TeacherInviteContent name={query.data.class.name} code={cls?.joinCode} />
            </Dialog>
          </>
        )}
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
                <table className="teacher-roster-table">
                  <caption className="sr-only">Anggota kelas {query.data.class.name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nama siswa</th>
                      <th scope="col">Progres latihan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((student) => (
                      <TeacherStudentRow
                        name={student.displayName}
                        href={`/teacher/classes/${classId}/students/${student.id}`}
                        key={student.id}
                      />
                    ))}
                  </tbody>
                </table>
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
      backHref={`/teacher/classes/${classId}`}
    >
      <div className="teacher-page-stack">
        {query.isPending || query.isError ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="teacher-class-actions">
              <Link
                className="button-link"
                href={`/teacher/feedback?classId=${classId}&studentId=${studentId}`}
              >
                <Icon name="chat" />
                Kirim feedback untuk siswa
              </Link>
            </div>
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
            <TeacherAssessmentHistory token={token} classId={classId} studentId={studentId} />
          </>
        )}
      </div>
    </TeacherShell>
  );
}
