'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, Icon, Input, Select, Tabs } from '@tka/ui';
import {
  getBannedClassStudents,
  setClassStudentBan,
  takeoverClass,
  type StudentSummary,
  type ApiProblem,
} from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { teacherAccessFailure, teacherKeys } from './teacher-query';

export function TeacherTakeover({ token }: { token: string }) {
  const cache = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const cls = await takeoverClass(token, code.trim());
      setCode('');
      setSuccess('Kelas ' + cls.name + ' sekarang Anda dampingi.');
      await cache.invalidateQueries({ queryKey: teacherKeys.classes() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kelas belum dapat diambil alih.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="teacher-takeover">
      <details>
        <summary>
          Ambil alih kelas tanpa guru <Icon name="chevron" width={18} height={18} />
        </summary>
        <p>
          Gunakan kode kelas lama. Anda harus terverifikasi pada sekolah yang sama dan kelas tidak
          memiliki guru aktif.
        </p>
        <form className="teacher-create-form" onSubmit={submit}>
          <Input
            label="Kode kelas yang diambil alih"
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
            required
            minLength={6}
            maxLength={32}
            pattern="(?:[A-Za-z0-9]{6}|[A-Za-z0-9_\x2D]{8,32})"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !code.trim()} loading={busy}>
            Ambil alih kelas
          </Button>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {success && <p role="status">{success}</p>}
      </details>
    </Card>
  );
}

export function TeacherClassActions({
  token,
  classId,
  students,
  onAccessFailure,
}: {
  token: string;
  classId: string;
  students: StudentSummary[];
  onAccessFailure?: (error: ApiProblem) => void;
}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('active');
  const [activeId, setActiveId] = useState('');
  const [bannedId, setBannedId] = useState('');
  const [action, setAction] = useState<{ student: StudentSummary; banned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const banned = useQuery({
    queryKey: ['teacher-banned-students', classId],
    queryFn: () => getBannedClassStudents(token, classId),
    enabled: open,
  });
  const accessFailure = teacherAccessFailure(error, banned.error);
  useEffect(() => {
    if (accessFailure) onAccessFailure?.(accessFailure);
  }, [accessFailure, onAccessFailure]);
  function confirm(student: StudentSummary | undefined, block: boolean) {
    if (!student || busy) return;
    setError(null);
    setSuccess('');
    setAction({ student, banned: block });
  }
  async function submit() {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setClassStudentBan(token, classId, action.student.id, action.banned);
      for (const key of [
        teacherKeys.progress(classId, action.student.id),
        teacherKeys.feedback(classId, action.student.id),
        teacherKeys.assessments(classId, action.student.id),
      ])
        cache.removeQueries({ queryKey: key });
      setSuccess(
        action.banned
          ? 'Siswa diblokir dari kelas. Riwayat akun tetap tersimpan.'
          : 'Blokir dibuka. Siswa dapat bergabung kembali menggunakan kode kelas.',
      );
      setAction(null);
      setActiveId('');
      setBannedId('');
      await cache.invalidateQueries();
    } catch (cause) {
      setError(cause);
      if (teacherAccessFailure(cause))
        void cache.invalidateQueries({ queryKey: teacherKeys.roster(classId) });
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setOpen(false);
    setAction(null);
    setError(null);
  }
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess('');
        }}
        leftIcon={<Icon name="settings" width={20} height={20} />}
      >
        Kelola anggota
      </Button>
      <Dialog
        open={open}
        pending={busy}
        onClose={close}
        title={
          action
            ? (action.banned ? 'Blokir ' : 'Buka blokir ') + action.student.displayName + '?'
            : 'Kelola anggota'
        }
        description={
          action
            ? action.banned
              ? 'Siswa tidak dapat bergabung kembali sampai blokir dibuka. Riwayat akun tidak dihapus.'
              : 'Siswa dapat bergabung kembali. Keanggotaan tidak ditambahkan otomatis.'
            : 'Kelola akses siswa untuk kelas ini.'
        }
        actions={
          action && !accessFailure ? (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setError(null);
                }}
              >
                Batal
              </Button>
              <Button
                variant={action.banned ? 'danger' : 'primary'}
                loading={busy}
                disabled={busy}
                onClick={() => void submit()}
              >
                Konfirmasi perubahan akses
              </Button>
            </>
          ) : undefined
        }
      >
        {accessFailure ? (
          <DataState
            pending={false}
            error={accessFailure}
            retry={() => {
              void banned.refetch().then((result) => {
                if (result.isSuccess) setError(null);
              });
            }}
          />
        ) : action ? (
          <>
            {error !== null && (
              <p role="alert" className="form-error">
                {error instanceof Error ? error.message : 'Status siswa belum dapat diperbarui.'}
              </p>
            )}
          </>
        ) : (
          <div className="teacher-page-stack">
            <Tabs
              label="Keanggotaan kelas"
              value={tab}
              onChange={setTab}
              items={[
                {
                  value: 'active',
                  label: 'Aktif',
                  content: (
                    <div className="teacher-page-stack">
                      <p className="teacher-help-text">
                        Blokir mengakhiri keanggotaan kelas ini. Progres, XP, dan riwayat tetap
                        tersimpan.
                      </p>
                      <Select
                        label="Siswa aktif untuk diblokir"
                        value={activeId}
                        onChange={(event) => setActiveId(event.target.value)}
                        options={[
                          {
                            value: '',
                            label: students.length ? 'Pilih siswa' : 'Tidak ada anggota aktif',
                          },
                          ...students.map((student) => ({
                            value: student.id,
                            label: student.displayName,
                          })),
                        ]}
                      />
                      <Button
                        variant="danger-outline"
                        disabled={!students.some((student) => student.id === activeId)}
                        onClick={() =>
                          confirm(
                            students.find((student) => student.id === activeId),
                            true,
                          )
                        }
                      >
                        Blokir siswa
                      </Button>
                    </div>
                  ),
                },
                {
                  value: 'banned',
                  label: 'Diblokir',
                  content:
                    banned.isPending || banned.isError ? (
                      <DataState
                        pending={banned.isPending}
                        error={banned.error}
                        retry={() => void banned.refetch()}
                      />
                    ) : (
                      <div className="teacher-page-stack">
                        <p className="teacher-help-text">
                          Buka blokir agar siswa dapat bergabung kembali dengan kode kelas.
                        </p>
                        <Select
                          label="Siswa yang diblokir"
                          value={bannedId}
                          onChange={(event) => setBannedId(event.target.value)}
                          options={[
                            {
                              value: '',
                              label: banned.data.items.length
                                ? 'Pilih siswa'
                                : 'Tidak ada siswa diblokir',
                            },
                            ...banned.data.items.map((student) => ({
                              value: student.id,
                              label: student.displayName,
                            })),
                          ]}
                        />
                        <Button
                          variant="secondary"
                          disabled={!banned.data.items.some((student) => student.id === bannedId)}
                          onClick={() =>
                            confirm(
                              banned.data.items.find((student) => student.id === bannedId),
                              false,
                            )
                          }
                        >
                          Buka blokir
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
            {success && (
              <p className="teacher-feedback-success" role="status">
                {success}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
