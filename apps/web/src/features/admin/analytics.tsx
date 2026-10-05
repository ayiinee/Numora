'use client';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { useOperationalQuery } from './operational-query';
import type { AdminAnalyticsDto } from './generated-types';
export function AdminAnalyticsScreen() {
  const { state } = useAuth();
  const allowed =
    state.status === 'ready' &&
    state.profile.role === 'ADMIN' &&
    state.profile.capabilities?.some(
      (cap) => cap === 'ANALYTICS_CONTENT' || cap === 'ANALYTICS_OPERATIONS',
    );
  return (
    <AdminFrame
      title="Analytics operasional"
      description="Aggregate dari data tersimpan, sesuai akses akun."
      icon="chart"
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses..." />
      ) : !allowed || state.status !== 'ready' ? (
        <AdminMessage error message="Akses analytics Admin diperlukan." login />
      ) : (
        <AnalyticsPanel
          key={state.profile.id + state.profile.adminRole}
          token={state.session.access_token}
        />
      )}
    </AdminFrame>
  );
}
function AnalyticsPanel({ token }: { token: string }) {
  const query = useOperationalQuery<AdminAnalyticsDto>('admin/analytics', token);
  return (
    <div className="page-stack">
      <Button onClick={query.retry}>Perbarui analytics</Button>
      {query.error ? (
        <AdminMessage error message={query.error} retry={query.retry} />
      ) : !query.data ? (
        <AdminLoading message="Memuat aggregate..." />
      ) : (
        <>
          <p>
            Sumber PostgreSQL - diperbarui{' '}
            {new Date(query.data.generatedAt).toLocaleString('id-ID')}. Angka kumulatif mengikuti
            catatan durable.
          </p>
          <div className="admin-home-grid">
            {query.data.metrics.map((metric) => (
              <Card key={metric.key}>
                <p>{metric.label}</p>
                <strong>
                  {metric.value == null ? 'Tidak tersedia' : metric.value.toLocaleString('id-ID')}
                </strong>
                {metric.unavailableReason && (
                  <p role="status">Sumber belum dapat dibaca. Perbarui untuk mencoba lagi.</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
