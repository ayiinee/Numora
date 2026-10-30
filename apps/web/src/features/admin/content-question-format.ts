export function questionFormat(type: string) {
  switch (type) {
    case 'SINGLE_CHOICE':
      return {
        label: 'Pilihan ganda',
        instruction: 'Pilih satu jawaban yang benar.',
        kind: 'single' as const,
      };
    case 'MCMA':
    case 'MULTIPLE_CHOICE_MULTIPLE_ANSWER':
      return {
        label: 'Pilihan ganda kompleks',
        instruction: 'Pilih semua jawaban yang benar. Jawaban dapat lebih dari satu.',
        kind: 'multiple' as const,
      };
    case 'CATEGORY':
    case 'MULTIPLE_CHOICE_CATEGORY':
      return {
        label: 'Kategori',
        instruction: 'Tentukan kategori untuk setiap pernyataan sesuai petunjuk soal.',
        kind: 'category' as const,
      };
    default:
      return {
        label: 'Format lainnya',
        instruction: 'Periksa petunjuk pada isi soal dan detail versi.',
        kind: 'unknown' as const,
      };
  }
}
export const contentStatusLabel = (status: string) =>
  ({ DRAFT: 'Draf', READY: 'Siap', REVISION: 'Perlu revisi', ARCHIVED: 'Diarsipkan' })[status] ??
  status;
export const usageLabel = (usage?: string | null) =>
  ({ DRILL: 'Drill', PRETEST: 'Pretest', TRYOUT: 'Tryout' })[usage ?? ''] ??
  'Belum diklasifikasikan';
