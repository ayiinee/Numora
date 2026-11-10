'use client';
import { Button } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { adminCanAccess, adminCanReadAnalytics } from './admin-access';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { AnalyticsDashboard } from './analytics-dashboard';
import { metricNumber, snapshotTime } from './analytics-model';
import { useAnalyticsSnapshot } from './analytics-query';

export function AdminAnalyticsScreen() {
  const { state } = useAuth();
  const profile = state.status === 'ready' ? state.profile : null;
  return (
    <AdminFrame title="Dashboard" description="" icon="chart" management minimalHeader>
      {state.status === 'loading' ? (
        <AdminLoading message="Memeriksa akses..." />
      ) : !adminCanReadAnalytics(profile) || state.status !== 'ready' ? (
        <AdminMessage error message="Akses Dashboard Admin diperlukan." login />
      ) : (
        <AnalyticsPanel
          key={JSON.stringify([
            state.profile.id,
            state.profile.adminRole,
            state.profile.capabilities,
          ])}
          token={state.session.access_token}
          canManageContent={adminCanAccess(profile, 'content')}
        />
      )}
    </AdminFrame>
  );
}
function AnalyticsPanel({ token, canManageContent }: { token: string; canManageContent: boolean }) {
  const query = useAnalyticsSnapshot(token);
  if (query.denied)
    return <AdminMessage error message={query.error ?? 'Akses Dashboard telah berubah.'} login />;
  const data = query.data;
  const unavailable = data?.metrics.filter((metric) => metricNumber(metric) === null).length ?? 0;
  return (
    <div className="admin-analytics-workspace">
      <div className="analytics-toolbar">
        <p className="analytics-updated">
          {data && <span>Diperbarui</span>}
          {data ? (
            <time dateTime={data.generatedAt}>{snapshotTime(data.generatedAt)}</time>
          ) : (
            'Belum ada data'
          )}
          {data && query.error && <strong className="analytics-stale">Data sebelumnya</strong>}
        </p>
        <Button
          variant="secondary"
          loading={query.loading}
          disabled={query.loading}
          onClick={query.retry}
        >
          Perbarui
        </Button>
      </div>
      {query.error && <AdminMessage error message={query.error} retry={query.retry} />}
      {!data ? (
        query.loading ? (
          <AdminLoading message="Memuat Dashboard..." />
        ) : null
      ) : (
        <>
          {query.loading && (
            <p className="analytics-feedback" role="status">
              Memperbarui data…
            </p>
          )}
          {unavailable > 0 && (
            <p className="analytics-feedback is-warning" role="status">
              {unavailable} metrik belum tersedia.
            </p>
          )}
          {!data.metrics.length ? (
            <AdminMessage message="Belum ada data Dashboard." retry={query.retry} />
          ) : (
            <AnalyticsDashboard metrics={data.metrics} canManageContent={canManageContent} />
          )}
        </>
      )}
    </div>
  );
}
