# Temuan eaca5329-5170-4a6b-a524-e867c60fbf07

## BUG-001 — recovery
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 6ba9638c0a60469f1919e675e35d999f2dbde407 / e9a6aedba7c83cf28ac9d5df25df29b720bf92fb6e57ccf2dd2ab729f9c9344f
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan recovery memenuhi sumber dan assertion yang dipetakan.
Actual: ASSERTION_OR_RUNNER_FAILURE; {}
Assertion: database-connection-outage-retains-events-and-recovers
Expected values to be strictly equal:

1 !== 0

Assertion: redis-connection-outage-and-reconnect-preserve-postgres-results
Connection is closed.
Bukti: result.json dan artefak lokal check recovery.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.

## BUG-002 — dependencies
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 6ba9638c0a60469f1919e675e35d999f2dbde407 / e9a6aedba7c83cf28ac9d5df25df29b720bf92fb6e57ccf2dd2ab729f9c9344f
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan dependencies memenuhi sumber dan assertion yang dipetakan.
Actual: DEPENDENCY_VULNERABILITIES_REQUIRE_TRIAGE; {}
Bukti: result.json dan artefak lokal check dependencies.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.
