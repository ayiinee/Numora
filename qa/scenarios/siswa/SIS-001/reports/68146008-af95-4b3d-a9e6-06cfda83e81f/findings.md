# Temuan 68146008-af95-4b3d-a9e6-06cfda83e81f

## BUG-001 — quality
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 6ba9638c0a60469f1919e675e35d999f2dbde407 / bad003cdbaaf03e29041cdae90c724b293b3f8c9f24cd3b9a47707b8369d5b22
Reproduksi: pnpm qa run --scenario SIS-001 --profile standard
Expected: pemeriksaan quality memenuhi sumber dan assertion yang dipetakan.
Actual: REPOSITORY_QUALITY_CHECK_FAILED; [{"name":"lint","code":0,"timedOut":false},{"name":"typecheck","code":1,"timedOut":false},{"name":"exec","code":0,"timedOut":false},{"name":"contracts:validate","code":0,"timedOut":false},{"name":"contracts:types:check","code":0,"timedOut":false}]
Bukti: result.json dan artefak lokal check quality.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.

## BUG-002 — connected
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 6ba9638c0a60469f1919e675e35d999f2dbde407 / bad003cdbaaf03e29041cdae90c724b293b3f8c9f24cd3b9a47707b8369d5b22
Reproduksi: pnpm qa run --scenario SIS-001 --profile standard
Expected: pemeriksaan connected memenuhi sumber dan assertion yang dipetakan.
Actual: ASSERTION_OR_RUNNER_FAILURE; {"passed":0,"failed":0,"skipped":0,"total":0}
Bukti: result.json dan artefak lokal check connected.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.
