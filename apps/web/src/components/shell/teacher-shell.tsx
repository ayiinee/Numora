'use client';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
export function TeacherShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
  teacherName: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      area="teacher"
      title={title}
      subtitle={description}
      className="teacher-redesign-shell"
    >
      {children}
    </AppShell>
  );
}
