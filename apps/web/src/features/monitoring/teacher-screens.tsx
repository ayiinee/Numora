'use client';

import { Suspense, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  Input,
  SectionHeader,
  Select,
  Tabs,
} from '@tka/ui';
import { UserAvatar as Avatar } from '@/features/onboarding/user-avatar';
import { StudentMascot } from '@/components/student-mascot';
import { TeacherShell } from '@/components/shell';
import { TeacherGate } from './teacher-gate';
import { DataState, Status } from '@/features/core-learning/ui';
import { useAuth } from '@/features/onboarding/auth';
import {
  createTeacherClass,
  getClassStudents,
  getTeacherClasses,
  getTeacherStudentProgress,
  ApiProblem,
} from '@/lib/api';
import { TeacherClassCard, TeacherStudentRow } from './teacher-presentation';
import { findTeacherClass, teacherKeys } from './teacher-query';
import { useTeacherRosterCounts } from './teacher-data';
import { TeacherInviteContent } from './teacher-class-tools';
import { TeacherClassActions, TeacherTakeover } from './teacher-class-actions';
import { TeacherAssessmentHistory } from './teacher-assessment-history';
import { FeedbackWorkspace } from './teacher-feedback';
import { TeacherLevelGroups } from './teacher-level-groups';
import { teacherContextHref, useTeacherSearch } from './teacher-location';

export function TeacherDashboardScreen() {
  return (
    <Suspense fallback={<DataState pending />}>
      <TeacherGate>
        {(token, teacherName) => <TeacherDashboard token={token} teacherName={teacherName} />}
      </TeacherGate>
    </Suspense>
  );
}
function TeacherDashboard({ token, teacherName }: { token: string; teacherName: string }) {
  const router = useRouter();
  const { params, update } = useTeacherSearch();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(0);
  const cache = useQueryClient();
  const { refresh } = useAuth();
  const query = useQuery({
    queryKey: teacherKeys.classes(),
    queryFn: () => getTeacherClasses(token),
  });
  const accessLost = query.error instanceof ApiProblem && query.error.status === 403;
  const counts = useTeacherRosterCounts(token, query.isSuccess ? query.data.items : undefined);
  const search = params.get('q') ?? '';
  const needle = search.trim().toLocaleLowerCase('id');
  const visible = query.isSuccess
    ? query.data.items
        .map((cls, index) => ({ cls, index }))
        .filter(({ cls }) => cls.name.toLocaleLowerCase('id').includes(needle))
    : [];
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    setErrorStatus(0);
    try {
      const result = await createTeacherClass(token, name.trim());
      setName('');
      setCreateOpen(false);
      void cache.invalidateQueries({ queryKey: teacherKeys.classes() });
      router.push(
        teacherContextHref(
          '/teacher/classes/' + encodeURIComponent(result.id) + '/invite',
          new URLSearchParams(search ? { classQ: search } : {}),
        ),
      );
    } catch (err) {
      const status = err instanceof ApiProblem ? err.status : 0;
      setErrorStatus(status);
      const uncertain =
        !(err instanceof ApiProblem) || status === 0 || status === 408 || status >= 500;
      if (uncertain) {
        setError(
          'Pengiriman tidak dapat dipastikan. Daftar kelas dimuat ulang, periksa sebelum mencoba lagi.',
        );
        setName('');
        await cache.invalidateQueries({ queryKey: teacherKeys.classes() });
      } else setError(err instanceof Error ? err.message : 'Kelas belum dapat dibuat.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <TeacherShell title="Kelas saya" teacherName={teacherName}>
      <div className="teacher-page-stack">
        <section className="teacher-directory" aria-labelledby="teacher-classes-title">
          <div className="teacher-section-heading">
            <div>
              <h1 id="teacher-classes-title">Kelas saya</h1>
              <p>
                {query.isSuccess
                  ? needle
                    ? visible.length + ' dari ' + query.data.items.length + ' kelas cocok'
                    : query.data.items.length + ' kelas'
                  : 'Kelas yang Anda dampingi'}
              </p>
            </div>
            {query.isSuccess && (
              <Button
                onClick={() => {
                  setError('');
                  setCreateOpen(true);
                }}
                leftIcon={<Icon name="users" />}
              >
                Buat kelas
              </Button>
            )}
          </div>
          {query.isSuccess && query.data.items.length > 0 && (
            <Input
              className="teacher-search"
              label="Cari kelas"
              type="search"
              placeholder="Cari nama kelas…"
              value={search}
              onChange={(event) => update('q', event.target.value)}
              leftIcon={<Icon name="search" />}
            />
          )}
          {query.isPending ? (
            <DataState pending />
          ) : accessLost ? (
            <Status title="Akses kelas Anda berakhir">
              <p>Keanggotaan sekolah atau kepemilikan kelas Anda telah berakhir.</p>
              <Button onClick={() => void refresh()}>Periksa ulang akses</Button>
            </Status>
          ) : query.isError ? (
            <DataState pending={false} error={query.error} retry={() => void query.refetch()} />
          ) : query.data.items.length ? (
            <div className="teacher-class-grid">
              {visible.map(({ cls, index }) => (
                <TeacherClassCard
                  key={cls.id}
                  value={cls}
                  index={index}
                  href={teacherContextHref(
                    '/teacher/classes/' + encodeURIComponent(cls.id),
                    new URLSearchParams(search ? { classQ: search } : {}),
                  )}
                  count={
                    counts.queries[index]?.isSuccess
                      ? counts.queries[index]?.data?.items.length
                      : undefined
                  }
                  countError={counts.queries[index]?.isError ?? false}
                  retryCount={() => {
                    void counts.queries[index]?.refetch();
                  }}
                />
              ))}
              {!visible.length && (
                <Card>
                  <EmptyState
                    icon={<StudentMascot pose="search" />}
                    title="Kelas tidak ditemukan"
                    description="Coba nama kelas lain."
                  />
                </Card>
              )}
            </div>
          ) : (
            <Card className="teacher-empty">
              <EmptyState
                icon={<StudentMascot pose="start" />}
                title="Belum ada kelas"
                description="Buat kelas untuk mulai mengundang siswa."
              />
            </Card>
          )}
        </section>
        {query.isSuccess && <TeacherTakeover token={token} />}
      </div>
      <Dialog
        open={createOpen}
        pending={busy}
        onClose={() => setCreateOpen(false)}
        title="Buat kelas"
        description="Beri nama yang mudah dikenali siswa."
        className="teacher-create-dialog"
      >
        <form className="teacher-create-form" onSubmit={create}>
          <Input
            label="Nama kelas"
            placeholder="Contoh: IX A"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            maxLength={80}
            required
            autoFocus
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {errorStatus === 401 && (
            <Link className="button-link" href="/login">
              Masuk kembali
            </Link>
          )}
          <div className="teacher-dialog-buttons">
            <Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={busy} disabled={busy || !name.trim()}>
              {busy ? 'Membuat…' : 'Buat kelas'}
            </Button>
          </div>
        </form>
      </Dialog>
    </TeacherShell>
  );
}

export function ClassStudentsScreen({ classId }: { classId: string }) {
  return (
    <Suspense fallback={<DataState pending />}>
      <TeacherGate>
        {(token, teacherName) => (
          <ClassStudentsContent
            key={classId}
            token={token}
            teacherName={teacherName}
            classId={classId}
          />
        )}
      </TeacherGate>
    </Suspense>
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
  const { params, update } = useTeacherSearch();
  const search = params.get('q') ?? '';
  const sort = params.get('sort') === 'desc' ? 'desc' : 'asc';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [accessError, setAccessError] = useState<ApiProblem | undefined>();
  const classes = useQuery({
    queryKey: teacherKeys.classes(),
    queryFn: () => getTeacherClasses(token),
  });
  const cls = findTeacherClass(classes.data?.items, classId);
  const query = useQuery({
    queryKey: teacherKeys.roster(classId),
    queryFn: () => getClassStudents(token, classId),
  });
  const needle = search.trim().toLocaleLowerCase('id');
  const filtered = query.data?.items
    .filter((student) => student.displayName.toLocaleLowerCase('id').includes(needle))
    .sort((a, b) => (sort === 'asc' ? 1 : -1) * a.displayName.localeCompare(b.displayName, 'id'));
  const backHref = params.get('classQ')
    ? '/teacher?' + new URLSearchParams({ q: params.get('classQ')! })
    : '/teacher';
  return (
    <TeacherShell
      title={query.isSuccess && !accessError ? query.data.class.name : 'Daftar siswa'}
      teacherName={teacherName}
      backHref={backHref}
    >
      <div className="teacher-page-stack">
        {query.isPending || query.isError || accessError ? (
          <DataState
            pending={query.isPending}
            error={accessError ?? query.error}
            retry={() => {
              void query.refetch().then((result) => {
                if (result.isSuccess) setAccessError(undefined);
              });
            }}
          />
        ) : (
          <>
            <Card className="teacher-class-overview">
              <div>
                <span className="teacher-kicker">Anggota kelas</span>
                <h2>{query.data.items.length} siswa</h2>
                <p>Buka siswa untuk melihat hasil dan menulis catatan.</p>
              </div>
              <div className="teacher-class-overview__code">
                <span>Kode kelas</span>
                <strong>
                  {classes.isError
                    ? 'Belum termuat'
                    : classes.isPending
                      ? 'Memuat…'
                      : (cls?.joinCode ?? '—')}
                </strong>
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
                href={teacherContextHref('/teacher/classes/' + classId + '/invite', params)}
                onClick={(event) => {
                  if (
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    window.matchMedia('(min-width: 960px)').matches
                  ) {
                    event.preventDefault();
                    setInviteOpen(true);
                  }
                }}
              >
                <Icon name="users" />
                Undang siswa
              </Link>
              <TeacherClassActions
                token={token}
                classId={classId}
                students={query.data.items}
                onAccessFailure={setAccessError}
              />
            </div>
            <Dialog
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              title="Undang siswa"
              description="Bagikan kode kelas Anda."
              className="teacher-invite-dialog"
            >
              <TeacherInviteContent
                name={query.data.class.name}
                code={cls?.joinCode}
                pending={classes.isPending}
              />
            </Dialog>
            <div className="teacher-filter-card">
              <Input
                className="teacher-search"
                label="Cari siswa"
                type="search"
                placeholder="Cari nama siswa…"
                value={search}
                onChange={(event) => update('q', event.target.value)}
                leftIcon={<Icon name="search" />}
              />
              <Select
                label="Urutkan"
                value={sort}
                onChange={(event) => update('sort', event.target.value === 'desc' ? 'desc' : '')}
                options={[
                  { value: 'asc', label: 'Nama A–Z' },
                  { value: 'desc', label: 'Nama Z–A' },
                ]}
              />
            </div>
            <section className="teacher-page-stack" aria-label="Daftar siswa">
              <SectionHeader
                title="Siswa"
                subtitle={
                  needle
                    ? (filtered?.length ?? 0) + ' dari ' + query.data.items.length + ' siswa cocok'
                    : query.data.items.length + ' siswa bergabung'
                }
              />
              {filtered?.length ? (
                <Card className="teacher-students-card" padding="none">
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
                          key={student.id}
                          studentId={student.id}
                          name={student.displayName}
                          href={teacherContextHref(
                            '/teacher/classes/' + classId + '/students/' + student.id,
                            params,
                          )}
                        />
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : (
                <Card>
                  <EmptyState
                    icon={<StudentMascot pose={query.data.items.length ? 'search' : 'start'} />}
                    title={query.data.items.length ? 'Siswa tidak ditemukan' : 'Belum ada siswa'}
                    description={
                      query.data.items.length
                        ? 'Coba nama atau kata kunci lain.'
                        : 'Bagikan kode kelas agar siswa dapat bergabung.'
                    }
                  />
                </Card>
              )}
            </section>
          </>
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
    <Suspense fallback={<DataState pending />}>
      <TeacherGate>
        {(token, teacherName) => (
          <StudentProgressContent
            key={classId + '/' + studentId}
            token={token}
            teacherName={teacherName}
            classId={classId}
            studentId={studentId}
          />
        )}
      </TeacherGate>
    </Suspense>
  );
}
/** Mount on first visit, then preserve local forms across tab changes. */
function VisitedPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  return visited ? children : null;
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
  const { params, update } = useTeacherSearch();
  const requested = params.get('tab');
  const tab = requested === 'history' || requested === 'notes' ? requested : 'progress';
  const [accessError, setAccessError] = useState<ApiProblem | undefined>();
  const query = useQuery({
    queryKey: teacherKeys.progress(classId, studentId),
    queryFn: () => getTeacherStudentProgress(token, classId, studentId),
  });
  return (
    <TeacherShell
      title="Progres siswa"
      teacherName={teacherName}
      backHref={teacherContextHref('/teacher/classes/' + classId, params)}
    >
      {query.isPending || query.isError || accessError ? (
        <DataState
          pending={query.isPending}
          error={accessError ?? query.error}
          retry={() => {
            void query.refetch().then((result) => {
              if (result.isSuccess) setAccessError(undefined);
            });
          }}
        />
      ) : (
        <div className="teacher-page-stack">
          <div className="teacher-progress-summary">
            <Card className="teacher-student-identity">
              <Avatar
                userId={query.data.student.id}
                name={query.data.student.displayName}
                size="lg"
              />
              <div>
                <span className="teacher-kicker">{query.data.class.name}</span>
                <h2>{query.data.student.displayName}</h2>
                <p>Progres dan hasil latihan</p>
              </div>
            </Card>
            <Card className="teacher-latest-score">
              <span className="teacher-score-label">
                <Icon name="chart" width={18} height={18} />
                Nilai Drill terakhir
              </span>
              <p className="teacher-latest-score__value">
                {query.data.latestDrillScore ?? '—'}
                {query.data.latestDrillScore !== null && <small>/100</small>}
              </p>
              <p>
                {query.data.latestDrillScore === null
                  ? 'Belum ada latihan yang dikumpulkan.'
                  : 'Dari latihan terakhir yang dikumpulkan.'}
              </p>
            </Card>
          </div>
          <Tabs
            label="Informasi siswa"
            value={tab}
            onChange={(value) => update('tab', value, true)}
            items={[
              {
                value: 'progress',
                label: 'Progres',
                content: <TeacherLevelGroups levels={query.data.levels} />,
              },
              {
                value: 'history',
                label: 'Riwayat',
                content: (
                  <VisitedPanel active={tab === 'history'}>
                    <TeacherAssessmentHistory
                      token={token}
                      classId={classId}
                      studentId={studentId}
                      onAccessFailure={setAccessError}
                    />
                  </VisitedPanel>
                ),
              },
              {
                value: 'notes',
                label: 'Catatan',
                content: (
                  <VisitedPanel active={tab === 'notes'}>
                    <FeedbackWorkspace
                      token={token}
                      classId={classId}
                      studentId={studentId}
                      studentName={query.data.student.displayName}
                      onAccessFailure={setAccessError}
                    />
                  </VisitedPanel>
                ),
              },
            ]}
          />
        </div>
      )}
    </TeacherShell>
  );
}
