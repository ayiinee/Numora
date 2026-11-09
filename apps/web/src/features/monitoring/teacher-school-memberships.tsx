'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Dialog, SectionHeader } from '@tka/ui';
import { getTeacherMemberships, leaveTeacherSchool, type SchoolSummary } from '@/lib/api';
import { useAuth } from '@/features/onboarding/auth';
import { DataState } from '@/features/core-learning/ui';

export function TeacherSchoolMemberships({ token }: { token: string }) {
  const cache = useQueryClient();
  const { refresh } = useAuth();
  const query = useQuery({
    queryKey: ['teacher-school-memberships'],
    queryFn: () => getTeacherMemberships(token),
  });
  const [leaving, setLeaving] = useState<SchoolSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function leave() {
    if (!leaving || busy) return;
    setBusy(true);
    setError('');
    try {
      await leaveTeacherSchool(token, leaving.id);
      setLeaving(null);
      cache.clear();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Belum dapat keluar sekolah.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="teacher-account-card">
      <SectionHeader title="Keanggotaan sekolah" />
      {query.isPending || query.isError ? (
        <DataState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : query.data.items.length ? (
        <ul className="settings-list">
          {query.data.items.map((school) => (
            <li key={school.id}>
              <strong>{school.name}</strong>
              <Button
                variant="danger-outline"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setLeaving(school);
                }}
              >
                Keluar dari {school.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Tidak ada keanggotaan sekolah aktif.</p>
      )}
      <Dialog
        open={leaving !== null}
        pending={busy}
        onClose={() => setLeaving(null)}
        title={`Keluar dari ${leaving?.name ?? 'sekolah'}?`}
        description="Akses monitoring dan kepemilikan kelas di sekolah ini berakhir. Kelas, siswa, dan riwayat tetap tersimpan; guru baru yang berhak dapat mengambil alih kelas."
        actions={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setLeaving(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={busy} disabled={busy} onClick={() => void leave()}>
              Konfirmasi keluar sekolah
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
    </Card>
  );
}
