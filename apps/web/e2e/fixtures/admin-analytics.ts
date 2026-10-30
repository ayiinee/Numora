import type { Page } from '@playwright/test';
import { setup } from './admin';
import type {
  AdminAnalyticsDto,
  AdminAnalyticsMetricDto,
} from '../../src/features/admin/generated-types';

export function analyticsSnapshot(): AdminAnalyticsDto {
  const metrics: [string, string, AdminAnalyticsMetricDto['domain'], number][] = [
    ['schools', 'Sekolah tercatat', 'STRUCTURE', 48],
    ['classes', 'Kelas aktif', 'STRUCTURE', 136],
    ['memberships', 'Membership aktif', 'STRUCTURE', 4120],
    ['schoolStudents', 'Siswa dengan membership aktif', 'STRUCTURE', 2780],
    ['verifiedTeachers', 'Guru aktif terverifikasi', 'OPERATIONS', 64],
    ['verifiedSchools', 'Sekolah dengan Guru terverifikasi', 'OPERATIONS', 36],
    ['unusedCredentials', 'Credential belum dipakai dan masih berlaku', 'OPERATIONS', 12],
    ['students', 'Akun siswa aktif', 'STUDENTS', 3600],
    ['mandiriStudents', 'Siswa Mandiri aktif', 'STUDENTS', 820],
    ['drillStarted', 'Drill dimulai (kumulatif)', 'STUDENTS', 18400],
    ['drillCompleted', 'Drill selesai (kumulatif)', 'STUDENTS', 14240],
    ['tryoutStarted', 'Tryout dimulai (kumulatif)', 'STUDENTS', 6200],
    ['tryoutCompleted', 'Tryout selesai (kumulatif)', 'STUDENTS', 4680],
    ['versions', 'Versi soal tercatat', 'CONTENT', 2400],
    ['readyVersions', 'Versi soal READY', 'CONTENT', 1780],
    ['levelsWithPublishedDrill', 'Level dengan paket Drill aktif', 'CONTENT', 48],
    ['totalLevels', 'Level tercatat', 'CONTENT', 80],
    ['openReports', 'Laporan terbuka', 'CONTENT', 7],
    ['closedUnpublishedBatches', 'Batch tutup belum dipublikasikan', 'RELEASE', 4],
    ['overdueReleases', 'Rilis melewati SLA 72 jam', 'RELEASE', 1],
    ['publishedBatches', 'Batch dengan finalisasi dipublikasikan', 'RELEASE', 28],
    ['failedIrtRequests', 'Request IRT gagal', 'RELEASE', 2],
  ];
  return {
    generatedAt: '2026-10-30T08:00:00Z',
    source: 'POSTGRESQL',
    metrics: metrics.map(([key, label, domain, value]) => ({
      key,
      label,
      domain,
      value,
      unavailableReason: null,
    })),
  };
}
export async function setupAnalytics(
  page: Page,
  role: 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION' | null = 'SUPER_ADMIN',
) {
  const base = await setup(page);
  base.state.adminRole = role;
  const analytics = { data: analyticsSnapshot(), status: 200, requests: [] as string[] };
  await page.route('**/api/v1/admin/analytics', (route) => {
    analytics.requests.push(route.request().method());
    return analytics.status === 200
      ? route.fulfill({ json: analytics.data })
      : route.fulfill({
          status: analytics.status,
          json: {
            code: analytics.status === 403 ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE',
            detail:
              analytics.status === 403
                ? 'Akses analytics dicabut.'
                : 'Analytics sementara tidak tersedia.',
          },
        });
  });
  return { ...base, analytics };
}
