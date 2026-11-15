'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, Card, Icon, Skeleton } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { LearningApiError } from './api';
import { ApiProblem } from '@/lib/api';
import { useIsStudentSession, useStudentToken } from './student-session';
import { ContentRichText } from '@/features/admin/content-rich-text';

export function LearningFrame({
  title,
  children,
  focus = false,
  className,
  mobileHeader,
}: {
  title: string;
  children: ReactNode;
  focus?: boolean;
  className?: string;
  mobileHeader?: ReactNode;
}) {
  return (
    <StudentLayout
      title={title}
      hideBottomNav={focus}
      className={className}
      mobileHeader={mobileHeader}
    >
      {children}
    </StudentLayout>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`learning-panel ${className}`}>{children}</Card>;
}

export function PrimaryButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return <Button {...props}>{children}</Button>;
}

export function Status({
  children,
  title = 'Perhatian',
  illustration,
}: {
  children: ReactNode;
  title?: string;
  illustration?: ReactNode;
}) {
  return (
    <Panel className="status-card">
      {illustration ?? (
        <span className="icon-tile">
          <Icon name="info" />
        </span>
      )}
      <h2>{title}</h2>
      <div className="status-copy">{children}</div>
    </Panel>
  );
}

export function DataState({
  error,
  pending,
  retry,
  recovery,
}: {
  error?: unknown;
  pending: boolean;
  retry?: () => void;
  recovery?: { href: string; label: string };
}) {
  const isStudent = useIsStudentSession();
  const returnTo = recovery ?? (isStudent ? { href: '/student', label: 'Kembali ke Belajar' } : undefined);
  if (pending)
    return (
      <div className="loading-stack" aria-label="Memuat data" role={returnTo ? 'status' : undefined}>
        <Skeleton height={24} width="45%" />
        <Skeleton height={120} />
        <Skeleton height={80} />
      </div>
    );
  const status =
    error instanceof LearningApiError || error instanceof ApiProblem ? error.status : 0;
  const message = error instanceof Error ? error.message : 'Data belum dapat dimuat.';
  return (
    <Status
      illustration={isStudent && (status === 401 || status === 403 || status === 404) ? (
        <span className="icon-tile"><Icon name={status === 404 ? 'search' : 'lock'} /></span>
      ) : undefined}
      title={
        status === 401
          ? 'Sesi berakhir'
          : status === 403
            ? 'Akses ditolak'
            : status === 404
              ? 'Tidak ditemukan'
              : 'Gagal memuat'
      }
    >
      <p>{message}</p>
      {status === 401 ? (
        <Link className="button-link" href="/login">
          Masuk kembali
        </Link>
      ) : returnTo && (status === 403 || status === 404) ? (
        <Link className="button-link button-link--secondary" href={returnTo.href}>
          {returnTo.label}
        </Link>
      ) : retry ? (
        <Button variant="secondary" onClick={retry}>
          Coba lagi
        </Button>
      ) : null}
    </Status>
  );
}

export function StudentGate({ children }: { children: (token: string) => ReactNode }) {
  return children(useStudentToken());
}

export function MathText({ value }: { value: string }) {
  return (
    <ContentRichText text={value} media={[]} retry={() => {}} renderBareMath renderMedia={false} />
  );
}
