# Temuan 838c1952-e8f9-4681-8396-ea74365157a1

## BUG-001 — load
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: b33954b0678551bdea78e4bb40c9f7eb8568e9c1 / 59b0e6743d76f6acbec0a057428d055452756853793ceb59b0a7f40a34340aca
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan load memenuhi sumber dan assertion yang dipetakan.
Actual: DATABASE_RECONCILIATION_FAILED; {}
Bukti: result.json dan artefak lokal check load.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.
