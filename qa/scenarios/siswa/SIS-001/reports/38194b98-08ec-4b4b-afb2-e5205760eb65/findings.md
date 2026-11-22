# Temuan 38194b98-08ec-4b4b-afb2-e5205760eb65

## BUG-001 — quality
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 3262d8cbfe2c7f711a6f6377834168d8b032bc59 / 4e20cdf87aa71049ff94561eee76eb5ecb6b83f56d342e9deefe60698ef5610e
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan quality memenuhi sumber dan assertion yang dipetakan.
Actual: REPOSITORY_QUALITY_CHECK_FAILED; [{"name":"lint","code":0,"timedOut":false},{"name":"exec turbo run typecheck --concurrency=1 --env-mode=loose","code":1,"timedOut":false},{"name":"exec tsc -p qa/tsconfig.json","code":0,"timedOut":false},{"name":"contracts:validate","code":0,"timedOut":false},{"name":"contracts:types:check","code":0,"timedOut":false}]
Bukti: result.json dan artefak lokal check quality.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.

## BUG-002 — connected
Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.
Versi: 3262d8cbfe2c7f711a6f6377834168d8b032bc59 / 4e20cdf87aa71049ff94561eee76eb5ecb6b83f56d342e9deefe60698ef5610e
Reproduksi: pnpm qa run --scenario SIS-001 --profile full
Expected: pemeriksaan connected memenuhi sumber dan assertion yang dipetakan.
Actual: ASSERTION_OR_RUNNER_FAILURE; {"passed":3,"failed":1,"skipped":0,"total":4}
Assertion: SIS-001 TC-001 real browser saves, resumes, submits 80 and retains one XP ledger entry
Test timeout of 120000ms exceeded.
Bukti: result.json dan artefak lokal check connected.
Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.
