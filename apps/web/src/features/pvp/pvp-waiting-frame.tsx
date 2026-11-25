import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { StudentSectionHeader } from '@/features/core-learning/student-section-header';

export function PvpWaitingFrame({
  children,
  onLeave,
}: {
  children: ReactNode;
  onLeave?: (() => void) | undefined;
}) {
  const title = 'Ruang Tunggu Duel';
  return (
    <AppShell
      title={title}
      className="pvp-match-shell pvp-waiting-shell"
      mobileHeader={
        <StudentSectionHeader
          title={title}
          back={
            onLeave
              ? { label: 'Keluar', onClick: onLeave }
              : { label: 'Kembali ke PvP', href: '/student/pvp' }
          }
        />
      }
    >
      {children}
    </AppShell>
  );
}
