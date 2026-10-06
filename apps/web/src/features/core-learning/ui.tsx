'use client';

import Link from 'next/link';
import katex from 'katex';
import type { ReactNode } from 'react';
import { Button, Card, Icon, Skeleton } from '@tka/ui';
import { StudentLayout } from '@/components/shell';
import { LearningApiError } from './api';
import { ApiProblem } from '@/lib/api';
import { useStudentToken } from './student-session';

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

export function Status({ children, title = 'Perhatian' }: { children: ReactNode; title?: string }) {
  return (
    <Panel className="status-card">
      <span className="icon-tile">
        <Icon name="info" />
      </span>
      <h2>{title}</h2>
      <div className="status-copy">{children}</div>
    </Panel>
  );
}

export function DataState({
  error,
  pending,
  retry,
}: {
  error?: unknown;
  pending: boolean;
  retry?: () => void;
}) {
  if (pending)
    return (
      <div className="loading-stack" aria-label="Memuat data">
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
        <Link className="button-link" href="/">
          Masuk kembali
        </Link>
      ) : (
        <Button variant="secondary" onClick={retry}>
          Coba lagi
        </Button>
      )}
    </Status>
  );
}

export function StudentGate({ children }: { children: (token: string) => ReactNode }) {
  return children(useStudentToken());
}

export function MathText({ value }: { value: string }) {
  const parts = value.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part.startsWith('$') || !part.endsWith('$')) return <span key={index}>{part}</span>;
        try {
          return (
            <span
              key={index}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(part.slice(1, -1), {
                  throwOnError: true,
                  trust: false,
                }),
              }}
            />
          );
        } catch {
          return <span key={index}>{part}</span>;
        }
      })}
    </>
  );
}
