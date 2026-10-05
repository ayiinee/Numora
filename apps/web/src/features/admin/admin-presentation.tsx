'use client';

import Link from 'next/link';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { Badge, Button, Card, Icon, Skeleton, type IconName } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { useAuth } from '@/features/onboarding/auth';
import { adminRoleLabel } from './navigation';

export function AdminFrame({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  children: ReactNode;
}) {
  const { state } = useAuth();
  return (
    <AppShell area="admin" className="admin-redesign-shell">
      <div className="admin-redesign-frame">
        <header className="admin-page-header">
          <span className="admin-header-icon">
            <Icon name={icon} />
          </span>
          <div>
            <span className="admin-eyebrow">Ruang Admin</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <Badge variant="default" className="admin-header-badge">
            {state.status === 'ready' && state.profile.role === 'ADMIN'
              ? adminRoleLabel(state.profile.adminRole)
              : 'Admin'}
          </Badge>
        </header>
        {children}
      </div>
    </AppShell>
  );
}

export function AdminStats({
  items,
}: {
  items: { label: string; value: number; icon: IconName }[];
}) {
  return (
    <div className="admin-stats">
      {items.map((item) => (
        <Card key={item.label} className="admin-stat">
          <span className="admin-stat-icon">
            <Icon name={item.icon} />
          </span>
          <div>
            <span>{item.label}</span>
            <strong>{item.value.toLocaleString('id-ID')}</strong>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AdminLoading({ message }: { message: string }) {
  return (
    <Card className="admin-state" role="status" aria-busy="true">
      <p>{message}</p>
      <Skeleton height={24} />
      <Skeleton height={56} />
      <Skeleton height={56} />
    </Card>
  );
}

export function AdminMessage({
  message,
  error = false,
  retry,
  login = false,
}: {
  message: string;
  error?: boolean;
  retry?: () => void;
  login?: boolean;
}) {
  return (
    <Card
      className={`admin-state ${error ? 'admin-state-error' : 'admin-state-info'}`}
      role={error ? 'alert' : 'status'}
    >
      <div className="admin-state-copy">
        <Icon name="info" />
        <p>{message}</p>
      </div>
      {(retry || login) && (
        <div className="admin-content-actions">
          {retry && (
            <Button variant="secondary" onClick={retry}>
              Coba lagi
            </Button>
          )}
          {login && (
            <Link className="admin-recovery-link" href="/admin/login">
              Ke halaman masuk
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

export function AdminEditorForm({
  busy,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { busy: boolean }) {
  return (
    <form {...props} className="monitoring-notice admin-content-form" aria-busy={busy}>
      <fieldset className="admin-editor-fields" disabled={busy}>
        {children}
      </fieldset>
    </form>
  );
}
