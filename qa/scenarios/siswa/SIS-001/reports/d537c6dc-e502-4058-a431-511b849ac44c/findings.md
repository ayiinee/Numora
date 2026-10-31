# Temuan d537c6dc-e502-4058-a431-511b849ac44c

## BUG-001 — load
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 820a76bfc279feb50e2a2826f23c4f9d8488d9cd / 5a3066c3e2d3d2f33a96548540b16608e2b2e123b5ee3da3343e3ec87b34f329
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan load memenuhi sumber dan assertion yang dipetakan.
Actual: DATABASE_RECONCILIATION_FAILED; {}
Bukti: result.json dan artefak lokal check load.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.

## BUG-002 — dependencies
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 820a76bfc279feb50e2a2826f23c4f9d8488d9cd / 5a3066c3e2d3d2f33a96548540b16608e2b2e123b5ee3da3343e3ec87b34f329
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan dependencies memenuhi sumber dan assertion yang dipetakan.
Actual: DEPENDENCY_VULNERABILITIES_REQUIRE_TRIAGE; {}
Bukti: result.json dan artefak lokal check dependencies.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.
