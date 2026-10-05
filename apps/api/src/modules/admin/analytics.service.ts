import { Injectable } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import { adminCapabilities, type AdminRole } from '../identity/admin-capabilities';
import type { AdminAnalyticsDto, AdminAnalyticsMetricDto } from './analytics.dto';
@Injectable()
export class AdminAnalyticsService {
  async summary(role: AdminRole): Promise<AdminAnalyticsDto> {
    const capabilities = adminCapabilities(role);
    const client = getDatabase().client;
    const metrics: AdminAnalyticsMetricDto[] = [];
    const group = async (
      domain: string,
      definitions: [string, string][],
      query: () => Promise<Record<string, unknown>[]>,
    ) => {
      try {
        const [row] = await query();
        for (const [key, label] of definitions)
          metrics.push({
            key,
            label,
            domain,
            value: row?.[key] == null ? null : Number(row[key]),
            unavailableReason: row?.[key] == null ? 'SOURCE_UNAVAILABLE' : null,
          });
      } catch {
        for (const [key, label] of definitions)
          metrics.push({ key, label, domain, value: null, unavailableReason: 'QUERY_UNAVAILABLE' });
      }
    };
    await group(
      'STRUCTURE',
      [
        ['schools', 'Sekolah tercatat'],
        ['classes', 'Kelas aktif'],
        ['memberships', 'Membership aktif'],
        ['schoolStudents', 'Siswa dengan membership aktif'],
      ],
      () => client`
      SELECT (SELECT count(*) FROM schools) AS schools,
      (SELECT count(*) FROM classes WHERE archived_at IS NULL) AS classes,
      (SELECT count(*) FROM class_memberships m JOIN classes c ON c.id=m.class_id WHERE m.left_at IS NULL AND c.archived_at IS NULL) AS memberships,
      (SELECT count(DISTINCT m.student_user_id) FROM class_memberships m JOIN classes c ON c.id=m.class_id JOIN users u ON u.id=m.student_user_id WHERE m.left_at IS NULL AND c.archived_at IS NULL AND u.status='ACTIVE') AS "schoolStudents"`,
    );
    if (capabilities.includes('ANALYTICS_OPERATIONS'))
      await group(
        'OPERATIONS',
        [
          ['verifiedTeachers', 'Guru aktif terverifikasi'],
          ['verifiedSchools', 'Sekolah dengan Guru terverifikasi'],
          ['unusedCredentials', 'Credential belum dipakai dan masih berlaku'],
          ['drillStarted', 'Drill dimulai (kumulatif)'],
          ['drillCompleted', 'Drill selesai (kumulatif)'],
          ['tryoutStarted', 'Tryout dimulai (kumulatif)'],
          ['tryoutCompleted', 'Tryout selesai (kumulatif)'],
        ],
        () => client`
      SELECT (SELECT count(DISTINCT m.teacher_user_id) FROM teacher_school_memberships m JOIN users u ON u.id=m.teacher_user_id WHERE m.ended_at IS NULL AND u.status='ACTIVE') AS "verifiedTeachers",
      (SELECT count(DISTINCT m.school_id) FROM teacher_school_memberships m JOIN users u ON u.id=m.teacher_user_id WHERE m.ended_at IS NULL AND u.status='ACTIVE') AS "verifiedSchools",
      (SELECT count(*) FROM teacher_verification_tokens WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()) AS "unusedCredentials",
      count(*) FILTER (WHERE assessment_type='DRILL') AS "drillStarted",
      count(*) FILTER (WHERE assessment_type='DRILL' AND status='GRADED') AS "drillCompleted",
      count(*) FILTER (WHERE assessment_type='TRYOUT') AS "tryoutStarted",
      count(*) FILTER (WHERE assessment_type='TRYOUT' AND status='GRADED') AS "tryoutCompleted"
      FROM assessment_attempts WHERE purpose='REGULAR'`,
      );
    if (capabilities.includes('ANALYTICS_CONTENT')) {
      await group(
        'CONTENT',
        [
          ['versions', 'Versi soal tercatat'],
          ['readyVersions', 'Versi soal READY'],
          ['levelsWithPublishedDrill', 'Level dengan paket Drill aktif'],
          ['totalLevels', 'Level tercatat'],
          ['openReports', 'Laporan terbuka'],
        ],
        () => client`
        SELECT (SELECT count(*) FROM question_versions) AS versions,
        (SELECT count(*) FROM question_versions WHERE content_status='READY') AS "readyVersions",
        (SELECT count(DISTINCT level_id) FROM assessment_packages WHERE assessment_type='DRILL' AND purpose='REGULAR' AND status='PUBLISHED' AND NOT is_demo) AS "levelsWithPublishedDrill",
        (SELECT count(*) FROM levels) AS "totalLevels",
        (SELECT count(*) FROM question_reports WHERE status IN ('OPEN','IN_REVIEW')) + (SELECT count(*) FROM video_reports WHERE status IN ('OPEN','IN_REVIEW')) AS "openReports"`,
      );
    }
    if (capabilities.includes('ANALYTICS_CONTENT') || capabilities.includes('ANALYTICS_OPERATIONS'))
      await group(
        'RELEASE',
        [
          ['closedUnpublishedBatches', 'Batch tutup belum dipublikasikan'],
          ['overdueReleases', 'Rilis melewati SLA 72 jam'],
          ['publishedBatches', 'Batch dengan finalisasi dipublikasikan'],
          ['failedIrtRequests', 'Request IRT gagal'],
        ],
        () => client`
      SELECT count(*) FILTER (WHERE b.closes_at<=clock_timestamp() AND f.id IS NULL) AS "closedUnpublishedBatches",
      count(*) FILTER (WHERE b.result_due_at<clock_timestamp() AND f.id IS NULL) AS "overdueReleases",
      count(*) FILTER (WHERE f.id IS NOT NULL) AS "publishedBatches",
      (SELECT count(*) FROM analysis_requests WHERE request_type='CALIBRATE_TRYOUT' AND status='FAILED') AS "failedIrtRequests"
      FROM tryout_batches b LEFT JOIN tryout_result_finalizations f ON f.batch_id=b.id AND f.published_at<=clock_timestamp()`,
      );
    return { generatedAt: new Date().toISOString(), source: 'POSTGRESQL', metrics };
  }
}
