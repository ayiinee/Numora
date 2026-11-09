import type { ContentPackageDto } from './generated-types';
import { snapshotTime } from './analytics-model';

const labels: Record<string, string> = {
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
    <section className="content-import-card" aria-label="Ketersediaan untuk siswa">
      <h3>Ketersediaan untuk siswa</h3>
      <p role="status">
        {detail.availability
          ? labels[detail.availability.state]
          : 'Ketersediaan belum dapat diperiksa. Muat ulang paket.'}
      </p>
      {detail.releaseAt && <p>Rilis: {snapshotTime(detail.releaseAt)}</p>}
      {detail.closeAt && <p>Tutup: {snapshotTime(detail.closeAt)}</p>}
      {!!detail.availability?.blockers.length && (
        <ul>
          {detail.availability.blockers.map((code) => (
            <li key={code}>
              {reasons[code] ??
                'Ada syarat yang belum terpenuhi. Hubungi pengelola dengan kode: ' + code}
            </li>
          ))}
        </ul>
      )}
      {detail.availability && (
        <small>
          Diperiksa {snapshotTime(detail.availability.checkedAt)}. Siswa tetap harus memenuhi syarat
          pengerjaan, termasuk batas pengulangan, saat mulai.
        </small>
      )}
      <details>
        <summary>Informasi teknis versi paket</summary>
        <dl>
          <dt>Acuan susunan soal</dt>
          <dd>{detail.blueprintVersionId ?? 'Belum ditetapkan'}</dd>
          <dt>Aturan penilaian</dt>
          <dd>{detail.scoringPolicyVersionId ?? 'Belum ditetapkan'}</dd>
          <dt>Salinan soal untuk siswa disimpan</dt>
          <dd>{detail.frozenAt ? snapshotTime(detail.frozenAt) : 'Belum disimpan'}</dd>
        </dl>
      </details>
    </section>
  );
}
