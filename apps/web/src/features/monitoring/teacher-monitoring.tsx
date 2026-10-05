'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Avatar, Badge, Card, EmptyState, Icon, Input, SectionHeader, Select, Tabs } from '@tka/ui';
import { TeacherShell } from '@/components/shell';
import { DataState } from '@/features/core-learning/ui';
import { TeacherGate } from './teacher-gate';
import { useTeacherClassContext, useTeacherClassProgress } from './teacher-data';
import { TeacherAnnouncement, TeacherMetric, TeacherUnavailable } from './teacher-ui';

export function TeacherMonitoringScreen() {
  const params = useSearchParams();
  return (
    <TeacherGate>
      {(token, name) => (
        <Monitoring
          key={params.get('classId') ?? ''}
          token={token}
          teacherName={name}
          initialClassId={params.get('classId') ?? ''}
        />
      )}
    </TeacherGate>
  );
}

function Monitoring({
  token,
  teacherName,
  initialClassId,
}: {
  token: string;
  teacherName: string;
  initialClassId: string;
}) {
  const context = useTeacherClassContext(token, initialClassId);
  const [view, setView] = useState('progress');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('asc');
  const progress = useTeacherClassProgress(
    token,
    context.classId,
    context.roster.isSuccess ? context.roster.data.items.map((student) => student.id) : undefined,
  );
  const students = progress.isSuccess ? progress.data : [];
  const attempted = students.filter((student) => student.latestDrillScore !== null).length;
  const ongoing = students.filter((student) =>
    student.levels.some((level) => level.inProgress),
  ).length;
  const opened = students.reduce(
    (sum, student) =>
      sum + student.levels.filter((level) => level.accessStatus === 'UNLOCKED').length,
    0,
  );
  const chapters = [
    ...new Set(students.flatMap((student) => student.levels.map((level) => level.chapterLabel))),
  ];
  const filtered = students
    .filter((student) =>
      student.student.displayName.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')),
    )
    .sort(
      (a, b) =>
        (sort === 'asc' ? 1 : -1) *
        a.student.displayName.localeCompare(b.student.displayName, 'id'),
    );
  const progressView =
    context.roster.isPending || context.roster.isError ? (
      <DataState
        pending={context.roster.isPending}
        error={context.roster.error}
        retry={() => void context.roster.refetch()}
      />
    ) : progress.isPending || progress.isError ? (
      <DataState
        pending={progress.isPending}
        error={progress.error}
        retry={() => void progress.refetch()}
      />
    ) : !students.length ? (
      <Card>
        <EmptyState
          icon={<Icon name="users" />}
          title="Belum ada siswa"
          description="Undang siswa sebelum memantau progres kelas."
        />
        <Link className="button-link" href={`/teacher/classes/${context.classId}/invite`}>
          Undang siswa
        </Link>
      </Card>
    ) : (
      <div className="teacher-page-stack">
        <div className="teacher-metrics">
          <TeacherMetric
            label="Sudah mengumpulkan Drill"
            value={`${attempted} / ${students.length}`}
            icon="clipboard"
            detail="Siswa dengan nilai terakhir"
          />
          <TeacherMetric
            label="Sedang latihan"
            value={ongoing}
            icon="clock"
            detail="Siswa dengan sesi berjalan"
          />
          <TeacherMetric
            label="Akses level terbuka"
            value={opened}
            icon="book"
            detail="Jumlah akses level seluruh siswa"
          />
        </div>
        <TeacherAnnouncement>
          Nilai terakhir dan terbaik mengikuti hasil Drill. Akses level ditentukan sistem; status
          terbuka tidak berarti kurikulum sudah tuntas.
        </TeacherAnnouncement>
        <div className="teacher-monitoring-layout">
          <section className="teacher-monitoring-students">
            <SectionHeader title="Progres siswa" subtitle={`${students.length} anggota aktif`} />
            <Card className="teacher-filter-card">
              <Input
                label="Cari siswa"
                type="search"
                placeholder="Nama siswa…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                leftIcon={<Icon name="search" />}
              />
              <Select
                label="Urutkan"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                options={[
                  { value: 'asc', label: 'Nama A–Z' },
                  { value: 'desc', label: 'Nama Z–A' },
                ]}
              />
            </Card>
            <Card className="teacher-progress-roster">
              {filtered.map((student) => (
                <article className="teacher-progress-row" key={student.student.id}>
                  <div className="teacher-progress-row__identity">
                    <Avatar name={student.student.displayName} />
                    <div>
                      <Link
                        href={`/teacher/classes/${context.classId}/students/${student.student.id}`}
                      >
                        {student.student.displayName}
                      </Link>
                      <Badge
                        variant={
                          student.levels.some((level) => level.inProgress) ? 'primary' : 'default'
                        }
                      >
                        {student.levels.some((level) => level.inProgress)
                          ? 'Sedang latihan'
                          : student.latestDrillScore === null
                            ? 'Belum ada hasil'
                            : 'Hasil tersedia'}
                      </Badge>
                    </div>
                  </div>
                  <dl className="teacher-progress-row__scores">
                    <div>
                      <dt>Drill terakhir</dt>
                      <dd>{student.latestDrillScore ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Terbaik per level</dt>
                      <dd>
                        {student.levels.some((level) => level.bestDrillScore !== null)
                          ? Math.max(
                              ...student.levels.flatMap((level) =>
                                level.bestDrillScore === null ? [] : [level.bestDrillScore],
                              ),
                            )
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="teacher-progress-row__actions">
                    <Link
                      href={`/teacher/classes/${context.classId}/students/${student.student.id}`}
                    >
                      Lihat progres <Icon name="arrow" width={16} height={16} />
                    </Link>
                    <Link
                      href={`/teacher/feedback?classId=${context.classId}&studentId=${student.student.id}`}
                    >
                      Feedback
                    </Link>
                  </div>
                </article>
              ))}
              {!filtered.length && (
                <EmptyState title="Siswa tidak ditemukan" description="Coba kata kunci lain." />
              )}
            </Card>
            <p className="teacher-help-text">
              — berarti belum ada hasil. Nilai terbaik di daftar ini adalah nilai tertinggi di
              antara level yang tercatat, bukan nilai gabungan.
            </p>
          </section>
          <aside className="teacher-curriculum">
            <SectionHeader title="Ringkasan per bab" subtitle="Berdasarkan level yang tercatat" />
            {chapters.map((chapter) => {
              const records = students.flatMap((student) =>
                student.levels.filter((level) => level.chapterLabel === chapter),
              );
              return (
                <Card key={chapter}>
                  <details className="teacher-chapter">
                    <summary>
                      <Icon name="book" />
                      <strong>{chapter}</strong>
                      <Icon name="chevron" />
                    </summary>
                    <dl>
                      <div>
                        <dt>Akses level terbuka</dt>
                        <dd>
                          {records.filter((level) => level.accessStatus === 'UNLOCKED').length}
                        </dd>
                      </div>
                      <div>
                        <dt>Level sedang dikerjakan</dt>
                        <dd>{records.filter((level) => level.inProgress).length}</dd>
                      </div>
                      <div>
                        <dt>Level dengan hasil</dt>
                        <dd>{records.filter((level) => level.bestDrillScore !== null).length}</dd>
                      </div>
                    </dl>
                    <p>Hitungan mencakup catatan setiap siswa dalam kelas ini.</p>
                  </details>
                </Card>
              );
            })}
            {!chapters.length && (
              <Card>
                <EmptyState
                  title="Belum ada level"
                  description="Ringkasan bab tampil setelah materi tersedia."
                />
              </Card>
            )}
          </aside>
        </div>
      </div>
    );
  return (
    <TeacherShell
      title="Monitoring akademik"
      description="Ikuti perkembangan belajar kelas Anda."
      teacherName={teacherName}
    >
      <div className="teacher-page-stack">
        {context.classes.isPending || context.classes.isError ? (
          <DataState
            pending={context.classes.isPending}
            error={context.classes.error}
            retry={() => void context.classes.refetch()}
          />
        ) : !context.classes.data.items.length ? (
          <Card>
            <EmptyState
              icon={<Icon name="users" />}
              title="Belum ada kelas"
              description="Buat kelas untuk mulai memantau siswa."
            />
            <Link className="button-link" href="/teacher">
              Buat kelas baru
            </Link>
          </Card>
        ) : (
          <>
            <Card className="teacher-class-picker">
              <Select
                label="Pilih kelas"
                value={context.classId}
                onChange={(event) => context.setSelection(event.target.value)}
                options={context.classes.data.items.map((value) => ({
                  value: value.id,
                  label: value.name,
                }))}
              />
              {context.selectedClass && (
                <Link href={`/teacher/classes/${context.classId}`}>
                  Detail kelas <Icon name="arrow" width={18} height={18} />
                </Link>
              )}
            </Card>
            {context.invalidError ? (
              <DataState
                pending={false}
                error={context.invalidError}
                retry={() => context.setSelection('')}
              />
            ) : (
              <Tabs
                label="Jenis monitoring"
                value={view}
                onChange={setView}
                items={[
                  { value: 'progress', label: 'Progres', content: progressView },
                  {
                    value: 'tryout',
                    label: 'Tryout',
                    content: (
                      <TeacherUnavailable
                        title="Monitoring Tryout belum tersedia"
                        description="Ringkasan batch dan distribusi hasil belum tersedia untuk akun guru. Hasil asesmen hanya ditampilkan sesuai izin dan waktu rilis sistem."
                        icon="clipboard"
                      />
                    ),
                  },
                  {
                    value: 'leaderboard',
                    label: 'Leaderboard',
                    content: (
                      <TeacherUnavailable
                        title="Leaderboard guru belum tersedia"
                        description="Peringkat dan XP kelas belum tersedia untuk akun guru. Tidak ada peringkat yang dihitung di halaman ini."
                        icon="trophy"
                      />
                    ),
                  },
                ]}
              />
            )}
          </>
        )}
      </div>
    </TeacherShell>
  );
}
