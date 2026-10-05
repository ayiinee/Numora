'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { TeacherShell } from '@/components/shell';
import { destination } from '@/features/onboarding/destination';
import { LearningProvider } from '@/features/core-learning/provider';
import { DataState, Status } from '@/features/core-learning/ui';

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
