'use client';

import { TeacherShell } from '@/components/shell';
import { TeacherGate } from './teacher-gate';
import { TeacherUnavailable } from './teacher-ui';

export function TeacherNotificationsScreen() {
  return (
    <TeacherGate>
      {(_, name) => (
        <TeacherShell
          title="Pusat Notifikasi"
          description="Informasi untuk ruang guru."
          teacherName={name}
        >
          <TeacherUnavailable
            icon="bell"
            title="Notifikasi guru belum tersedia"
            description="Pusat notifikasi untuk akun guru belum tersedia. Anda tetap dapat membuka kelas, memantau progres, dan mengirim feedback."
          />
        </TeacherShell>
      )}
    </TeacherGate>
  );
}
