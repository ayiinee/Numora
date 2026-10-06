'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@tka/ui';
import { useAuth } from '@/features/onboarding/auth';
import { AdminFrame, AdminLoading, AdminMessage } from './admin-presentation';
import { useOperationalQuery } from './operational-query';
import type { AdminAnalyticsDto } from './generated-types';
export function AdminAnalyticsScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const activeAdmin =
    state.status === 'ready' && state.profile.role === 'ADMIN' && state.profile.status === 'ACTIVE';
  const redirectTo = activeAdmin
    ? state.profile.adminRole === 'CONTENT_DATA_MODERATION'
      ? '/admin/content'
      : state.profile.adminRole === 'OPERATIONS'
        ? '/admin/schools'
        : null
    : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);
  const allowed =
    activeAdmin &&
    state.profile.capabilities?.some(
      (cap) => cap === 'ANALYTICS_CONTENT' || cap === 'ANALYTICS_OPERATIONS',
    );
  if (redirectTo) return null;
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
          contentRole={state.profile.adminRole === 'CONTENT_DATA_MODERATION'}
        />
      )}
    </AdminFrame>
  );
}
const domains: Record<string, { title: string; description: string }> = {
  STRUCTURE: {
    title: 'Sekolah & kelas',
    description: 'Struktur dan jumlah keanggotaan, tanpa identitas siswa individual.',
  },
  STUDENTS: {
    title: 'Aktivitas belajar',
    description: 'Jumlah akun dan pengerjaan tercatat. Start dan completion bersifat kumulatif.',
  },
  CONTENT: {
    title: 'Cakupan konten & moderasi',
    description: 'Kesiapan bank soal dan laporan yang perlu ditindaklanjuti.',
  },
  RELEASE: {
    title: 'Kesehatan rilis Tryout',
    description: 'Pantau batch belum dirilis, analisis yang gagal, dan keterlambatan.',
  },
};
function AnalyticsPanel({ token, contentRole }: { token: string; contentRole: boolean }) {
  const query = useOperationalQuery<AdminAnalyticsDto>('admin/analytics', token);
  const groups = query.data
    ? contentRole
      ? [...new Set(query.data.metrics.map((m) => m.domain))]
      : ['ALL']
    : [];
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
            Data tersimpan · diperbarui {new Date(query.data.generatedAt).toLocaleString('id-ID')}.
            Angka kumulatif mengikuti catatan aktivitas. Data yang tidak tersedia tidak ditampilkan
            sebagai nol.
          </p>
          {groups.map((domain) => (
            <section key={domain}>
              {domain !== 'ALL' && (
                <div className="content-section-title">
                  <h2>{domains[domain]?.title ?? domain}</h2>
                  <p>{domains[domain]?.description}</p>
                </div>
              )}
              <div className="admin-home-grid">
                {query
                  .data!.metrics.filter((metric) => domain === 'ALL' || metric.domain === domain)
                  .map((metric) => (
                    <Card key={metric.key} className="content-metric">
                      <p>{metric.label}</p>
                      <strong>
                        {metric.value == null
                          ? 'Tidak tersedia'
                          : metric.value.toLocaleString('id-ID')}
                      </strong>
                      {metric.unavailableReason && (
                        <p role="status">Sumber belum dapat dibaca. Perbarui untuk mencoba lagi.</p>
                      )}
                    </Card>
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
