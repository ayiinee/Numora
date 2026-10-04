'use client';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
export function StudentLayout({
  title,
  subtitle,
  children,
  hideBottomNav,
  backHref,
  mobileHeader,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  hideBottomNav?: boolean;
  backHref?: string;
  mobileHeader?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      backHref={backHref}
      focus={hideBottomNav}
      mobileHeader={mobileHeader}
      className={className ?? ''}
    >
      {children}
    </AppShell>
  );
}
