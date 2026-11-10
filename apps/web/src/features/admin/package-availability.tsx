import { Badge, Icon } from '@tka/ui';
import type { ContentPackageDto } from './generated-types';
import { snapshotTime } from './analytics-model';

const labels: Record<string, string> = {
  READY_FOR_BATCH: 'Siap dipakai dalam batch',
  DRAFT: 'Belum diterbitkan',
  BLOCKED: 'Belum bisa dikerjakan',
  SCHEDULED: 'Menunggu jadwal mulai',
  AVAILABLE: 'Bisa dikerjakan',
  CLOSED: 'Waktu pengerjaan berakhir',
  ARCHIVED: 'Paket diarsipkan',
};
export function packageAvailabilityLabel(state: string) {
  return labels[state] ?? 'Belum diperiksa';
}
const reasons: Record<string, string> = {
  PACKAGE_NOT_PUBLISHED:
    'Paket masih berupa draf. Lengkapi soal, tinjauan, dan persetujuan sebelum menerbitkannya.',
  SNAPSHOT_OR_APPROVAL_NOT_ELIGIBLE:
    'Salinan soal untuk siswa, susunan soal, atau persetujuannya belum memenuhi syarat. Periksa kesiapan paket. Jika paket sudah memiliki riwayat, lanjutkan melalui versi baru.',
  CONTENT_NOT_DISTRIBUTABLE:
    'Soal belum siap digunakan siswa atau penggunaannya sedang dihentikan. Periksa kelengkapan dan status soal.',
  SCORING_POLICY_NOT_PUBLISHED:
    'Aturan penilaian belum diterbitkan. Hubungi pengelola aturan penilaian.',
  SCORING_POLICY_UNSUPPORTED:
    'Aturan penilaian yang dipakai paket belum didukung. Periksa aturan penilaian dan persetujuannya.',
  DRILL_SCOPE_NOT_READY:
    'Bab, subbab, atau level latihan belum siap digunakan. Periksa struktur materi.',
  DRILL_NOT_SELECTED_OR_POLICY_UNSUPPORTED:
    'Paket ini belum dipilih untuk latihan siswa atau aturan penilaiannya belum sesuai. Periksa paket lain dan aturan penilaian pada level yang sama.',
  CHAPTER_NOT_READY: 'Bab belum ditandai siap digunakan. Periksa status bab di Struktur materi.',
  PRETEST_NOT_SELECTED_OR_POLICY_UNSUPPORTED:
    'Paket ini belum dipilih untuk Pretest siswa atau aturan penilaiannya belum didukung. Periksa paket lain pada bab yang sama dan aturan penilaiannya.',
  TRYOUT_NOT_CURRENT_PACKAGE:
    'Paket ini bukan Tryout yang sedang digunakan siswa. Paket yang lebih baru dapat menggantikannya. Pengerjaan yang sudah dimulai tetap memakai versi sebelumnya.',
  TRYOUT_SCHEDULE_INVALID:
    'Jadwal atau durasi pengerjaan belum sesuai. Siapkan versi baru tanpa mengubah riwayat pengerjaan.',
  RELEASE_PENDING: 'Siswa baru bisa mulai pada jadwal yang ditentukan.',
  WINDOW_CLOSED: 'Waktu pengerjaan sudah berakhir. Riwayat tetap tersimpan.',
  PACKAGE_ARCHIVED: 'Paket sudah diarsipkan dan tidak bisa dipakai untuk memulai pengerjaan baru.',
};
export function PackageAvailability({ detail }: { detail: ContentPackageDto }) {
  return (
    <section className="package-availability" aria-label="Ketersediaan untuk siswa">
      <h3>Ketersediaan untuk siswa</h3>
      <p role="status" className="package-availability-status">
        <Badge
          variant={
            detail.availability?.state === 'AVAILABLE' ||
            detail.availability?.state === 'READY_FOR_BATCH'
              ? 'success'
              : 'default'
          }
        >
          {detail.availability
            ? packageAvailabilityLabel(detail.availability.state)
            : 'Ketersediaan belum dapat diperiksa. Muat ulang paket.'}
        </Badge>
      </p>
      {detail.assessmentType !== 'TRYOUT' && detail.releaseAt && (
        <p>Rilis: {snapshotTime(detail.releaseAt)}</p>
      )}
      {detail.assessmentType !== 'TRYOUT' && detail.closeAt && (
        <p>Tutup: {snapshotTime(detail.closeAt)}</p>
      )}
      {!!detail.availability?.blockers.length && (
        <ul className="package-availability-reasons">
          {detail.availability.blockers.map((code) => (
            <li key={code}>
              <Icon name="info" width={18} height={18} />
              <span>
                {code === 'PACKAGE_NOT_PUBLISHED' && detail.assessmentType === 'PRETEST'
                  ? 'Paket masih berupa draf. Lengkapi soal dan selesaikan masalah validasi sebelum menerbitkannya.'
                  : (reasons[code] ??
                    'Ada syarat yang belum terpenuhi. Hubungi pengelola dengan kode: ' + code)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {detail.availability && (
        <div className="package-availability-note">
          <small>Diperiksa {snapshotTime(detail.availability.checkedAt)}.</small>
          <p>Syarat pengerjaan siswa diperiksa kembali saat mulai.</p>
        </div>
      )}
      <details className="package-version-details">
        <summary>
          <Icon name="settings" width={16} height={16} />
          Informasi teknis versi paket
          <Icon name="chevron" width={16} height={16} />
        </summary>
        <dl>
          <div>
            <dt>Acuan susunan soal</dt>
            <dd>{detail.blueprintVersionId ?? 'Belum ditetapkan'}</dd>
          </div>
          <div>
            <dt>Aturan penilaian</dt>
            <dd>{detail.scoringPolicyVersionId ?? 'Belum ditetapkan'}</dd>
          </div>
          <div>
            <dt>Salinan soal untuk siswa disimpan</dt>
            <dd>{detail.frozenAt ? snapshotTime(detail.frozenAt) : 'Belum disimpan'}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
