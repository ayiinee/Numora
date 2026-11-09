'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, Input, Select } from '@tka/ui';
import {
  getBannedClassStudents,
  setClassStudentBan,
  takeoverClass,
  type StudentSummary,
} from '@/lib/api';
import { DataState } from '@/features/core-learning/ui';
import { teacherKeys } from './teacher-query';

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
      setSuccess(`Kelas ${cls.name} sekarang Anda dampingi.`);
      await cache.invalidateQueries({ queryKey: teacherKeys.classes() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kelas belum dapat diambil alih.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="teacher-create-card">
      <details>
        <summary>Ambil alih kelas tanpa guru</summary>
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
}: {
  token: string;
  classId: string;
  students: StudentSummary[];
}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [bannedId, setBannedId] = useState('');
  const [action, setAction] = useState<{ student: StudentSummary; banned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const banned = useQuery({
    queryKey: ['teacher-banned-students', classId],
    queryFn: () => getBannedClassStudents(token, classId),
    enabled: open,
  });
  function confirm(student: StudentSummary | undefined, banned: boolean) {
    if (!student || busy) return;
    setError('');
    setSuccess('');
    setAction({ student, banned });
  }
  async function submit() {
    if (!action || busy) return;
    setBusy(true);
    setError('');
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
      setError(cause instanceof Error ? cause.message : 'Status siswa belum dapat diperbarui.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Kelola akses siswa</summary>
        <p>
          Blokir mengakhiri keanggotaan kelas ini. Progres, XP, dan riwayat siswa tetap tersimpan.
        </p>
        <Select
          label="Siswa aktif untuk diblokir"
          value={activeId}
          onChange={(event) => setActiveId(event.target.value)}
          options={[
            { value: '', label: 'Pilih siswa' },
            ...students.map((student) => ({ value: student.id, label: student.displayName })),
          ]}
          disabled={busy}
        />
        <Button
          variant="danger-outline"
          disabled={busy || !students.some((student) => student.id === activeId)}
          onClick={() =>
            confirm(
              students.find((student) => student.id === activeId),
              true,
            )
          }
        >
          Blokir siswa
        </Button>
        {open &&
          (banned.isPending || banned.isError ? (
            <DataState
              pending={banned.isPending}
              error={banned.error}
              retry={() => void banned.refetch()}
            />
          ) : (
            <>
              <Select
                label="Siswa yang diblokir"
                value={bannedId}
                onChange={(event) => setBannedId(event.target.value)}
                options={[
                  {
                    value: '',
                    label: banned.data.items.length ? 'Pilih siswa' : 'Tidak ada siswa diblokir',
                  },
                  ...banned.data.items.map((student) => ({
                    value: student.id,
                    label: student.displayName,
                  })),
                ]}
                disabled={busy}
              />
              <Button
                variant="secondary"
                disabled={busy || !banned.data.items.some((student) => student.id === bannedId)}
                onClick={() =>
                  confirm(
                    banned.data.items.find((student) => student.id === bannedId),
                    false,
                  )
                }
              >
                Buka blokir
              </Button>
            </>
          ))}
        {success && <p role="status">{success}</p>}
      </details>
      <Dialog
        open={action !== null}
        onClose={() => setAction(null)}
        pending={busy}
        title={`${action?.banned ? 'Blokir' : 'Buka blokir'} ${action?.student.displayName ?? 'siswa'}?`}
        description={
          action?.banned
            ? 'Siswa tidak dapat bergabung kembali sampai blokir dibuka. Riwayat akun tidak dihapus.'
            : 'Siswa dapat bergabung kembali. Keanggotaan tidak ditambahkan otomatis.'
        }
        actions={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>
              Batal
            </Button>
            <Button
              variant={action?.banned ? 'danger' : 'primary'}
              disabled={busy}
              loading={busy}
              onClick={() => void submit()}
            >
              Konfirmasi perubahan akses
            </Button>
          </>
        }
      >
        {action && error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </Dialog>
    </Card>
  );
}
