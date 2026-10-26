const explanations: Record<string, string> = {
  APPROVED_PGK_RUBRIC_REQUIRED:
    'Rubric scoring PGK belum disahkan atau belum terhubung ke versi ini. Minta konfirmasi Curriculum sebelum publikasi paket.',
  REVIEW_REQUIRED:
    'Versi ini belum memiliki keputusan READY yang sah. Lengkapi review terlebih dahulu.',
  DIFFICULTY_REQUIRED: 'Tingkat kesulitan belum diisi.',
  TAXONOMY_NOT_READY:
    'Keluarga soal atau materi induknya belum READY. Periksa bab, subbab, dan kompetensi.',
  LEVEL_NOT_READY: 'Level yang digunakan belum READY.',
  MEDIA_RECEIPT_INVALID:
    'Gambar belum memiliki bukti upload yang sesuai. Periksa referensi aset dan verifikasi upload.',
  VERSION_ARCHIVED: 'Versi sudah diarsipkan dan tidak tersedia untuk penggunaan baru.',
  DUPLICATE_EXTERNAL_ID: 'Ada ID soal sumber yang berulang dalam file. Perbaiki sebelum mengimpor.',
  MASTER_SCOPE_NOT_FOUND:
    'Bab, subbab, kompetensi, atau level sumber tidak ditemukan. Cocokkan dengan struktur materi.',
  RUBRIC_ID_INVALID: 'Referensi rubric tidak valid. Periksa versi rubric dari Curriculum.',
  NEEDS_REVIEW: 'Isi sumber berubah. Periksa versi yang akan disimpan sebelum melanjutkan.',
  PRETEST_STUDENT_CONSUMER_REQUIRED:
    'Alur Pretest untuk siswa belum tersedia. Paket dapat disusun dan direview, tetapi belum dapat dipublikasikan.',
  APPROVED_PRETEST_BLUEPRINT_REQUIRED:
    'Blueprint Pretest yang disahkan Curriculum belum terhubung.',
  PRETEST_REVIEW_REQUIRED: 'Paket Pretest belum direview.',
  PRETEST_ARCHIVED: 'Paket Pretest sudah diarsipkan.',
};

export function ContentBlockers({ codes, empty }: { codes: string[]; empty: string }) {
  if (!codes.length) return <p>{empty}</p>;
  return (
    <ul className="content-blocker-list">
      {codes.map((code, index) => (
        <li key={`${code}:${index}`}>
          {explanations[code] && <p>{explanations[code]}</p>}
          <small>{code}</small>
        </li>
      ))}
    </ul>
  );
}
