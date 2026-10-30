import type { AdminAnalyticsMetricDto } from './generated-types';
export type AnalyticsMetric = AdminAnalyticsMetricDto;

export const analyticsDomains: Record<string, string> = {
  STRUCTURE: 'Sekolah & kelas',
  OPERATIONS: 'Verifikasi & credential',
  STUDENTS: 'Aktivitas belajar',
  CONTENT: 'Bank soal',
  RELEASE: 'Rilis Tryout',
  OTHER: 'Data tambahan',
  CONTENT_RELEASE: 'Konten & rilis',
};
export function metricDomain(metric: AnalyticsMetric) {
  return ['CONTENT', 'RELEASE'].includes(metric.domain)
    ? 'CONTENT_RELEASE'
    : (metric.domain ?? 'OTHER');
}
export const metricLabels: Record<string, string> = {
  memberships: 'Keanggotaan kelas aktif',
  unusedCredentials: 'Credential belum dipakai',
  publishedBatches: 'Hasil batch terbit',
};
export const metricDescriptions: Record<string, string> = {
  students: 'Akun berstatus aktif; bukan pengguna aktif harian.',
  classes: 'Kelas yang belum diarsipkan.',
  readyVersions: 'Status versi READY; bukan jumlah paket terbit.',
  overdueReleases: 'Batch tanpa hasil terbit setelah batas 72 jam.',
  schools: 'Seluruh sekolah yang tercatat.',
  memberships: 'Satu siswa dapat memiliki lebih dari satu keanggotaan.',
  verifiedTeachers: 'Guru aktif dengan keanggotaan sekolah terverifikasi.',
  verifiedSchools: 'Sekolah yang memiliki Guru aktif terverifikasi.',
  unusedCredentials: 'Token verifikasi yang belum dipakai, belum dicabut, dan belum kedaluwarsa.',
  versions: 'Jumlah versi soal; satu soal dapat memiliki beberapa versi.',
  publishedBatches: 'Batch dengan hasil finalisasi yang telah dipublikasikan.',
};
export function metricNumber(metric: AnalyticsMetric | undefined): number | null {
  return metric &&
    !metric.unavailableReason &&
    typeof metric.value === 'number' &&
    Number.isFinite(metric.value) &&
    metric.value >= 0
    ? metric.value
    : null;
}
export function metricText(metric: AnalyticsMetric | undefined) {
  const value = metricNumber(metric);
  return value === null ? 'Tidak tersedia' : value.toLocaleString('id-ID');
}
export function coveragePercent(
  covered: AnalyticsMetric | undefined,
  total: AnalyticsMetric | undefined,
) {
  const numerator = metricNumber(covered),
    denominator = metricNumber(total);
  return numerator !== null && denominator !== null && denominator > 0 && numerator <= denominator
    ? (numerator / denominator) * 100
    : null;
}
export function snapshotTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium',
        timeStyle: 'short',
      }) + ' WIB'
    : 'Waktu tidak tersedia';
}
