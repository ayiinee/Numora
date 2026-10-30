'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { adminCanReadAnalytics } from './admin-access';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { AnalyticsDashboard } from './analytics-dashboard';
import { metricNumber, snapshotTime } from './analytics-model';
import { useAnalyticsSnapshot } from './analytics-query';

export function AdminAnalyticsScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const profile = state.status === 'ready' ? state.profile : null;
  const redirectTo =
    profile?.role === 'ADMIN' && profile.status === 'ACTIVE'
      ? profile.adminRole === 'CONTENT_DATA_MODERATION'
        ? '/admin/content'
        : profile.adminRole === 'OPERATIONS'
          ? '/admin/schools'
          : null
      : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);
  if (redirectTo) return null;
  return (
    <AdminFrame
      title="Analytics"
      description="Pantau aktivitas belajar, kesiapan konten, dan tindak lanjut operasional."
      icon="chart"
      management
    >
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses..." />
      ) : !adminCanReadAnalytics(profile) || state.status !== 'ready' ? (
        <AdminMessage error message="Akses analytics Admin diperlukan." login />
      ) : (
        <AnalyticsPanel
          key={JSON.stringify([
            state.profile.id,
            state.profile.adminRole,
            state.profile.capabilities,
          ])}
          token={state.session.access_token}
        />
      )}
    </AdminFrame>
  );
}
function AnalyticsPanel({ token }: { token: string }) {
  const query = useAnalyticsSnapshot(token);
  if (query.denied)
    return <AdminMessage error message={query.error ?? 'Akses analytics telah berubah.'} login />;
  const data = query.data;
  const unavailable = data?.metrics.filter((metric) => metricNumber(metric) === null).length ?? 0;
  return (
    <div className="admin-analytics-workspace">
      <div className="analytics-toolbar">
        <div>
          <span className="analytics-snapshot-label">Snapshot data tersimpan</span>
          <p>
            {data ? (
              <time dateTime={data.generatedAt}>{snapshotTime(data.generatedAt)}</time>
            ) : (
              'Belum ada snapshot'
            )}
            {data && query.error && <strong className="analytics-stale">Data sebelumnya</strong>}
          </p>
        </div>
        <Button
          variant="secondary"
          loading={query.loading}
          disabled={query.loading}
          onClick={query.retry}
        >
          Perbarui analytics
        </Button>
      </div>
      {query.error && <AdminMessage error message={query.error} retry={query.retry} />}
      {!data ? (
        query.loading ? (
          <AdminLoading message="Memuat analytics..." />
        ) : null
      ) : (
        <>
          {query.loading && (
            <p className="analytics-feedback" role="status">
              Memperbarui data. Snapshot sebelumnya tetap ditampilkan sampai pembaruan selesai.
            </p>
          )}
          {unavailable > 0 && (
            <p className="analytics-feedback is-warning" role="status">
              {unavailable} metrik belum tersedia. Nilai yang belum dapat dibaca tidak diganti
              dengan nol.
            </p>
          )}
          {!data.metrics.length ? (
            <AdminMessage
              message="Belum ada metrik analytics yang dikirim oleh sumber data."
              retry={query.retry}
            />
          ) : (
            <AnalyticsDashboard metrics={data.metrics} />
          )}
        </>
      )}
    </div>
  );
}
