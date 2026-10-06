# Generator v1 — verifikasi lokal 7 Oktober 2026

**ENGINEERING DECISION — bukti implementasi, bukan approval akademik.** Service asli dari checkout handoff `99e8e7f` (implementasi `3a0f21e`); PostgreSQL disposable loopback memakai stream migrasi Numora sampai 0037 dan restricted main/compute logins. Tidak ada perubahan database shared/cloud atau activation.

## Hasil pemeriksaan

- Lint repo: lulus, nol warning.
- Typecheck dan build monorepo serial: 20 task lulus. Build produksi web mencakup `/admin/content/generator`.
- JSON Schema: 12 schema terkompilasi; generated types check lulus.
- Orchestration/fingerprint: 14 tes lulus.
- Assessment engine: 21 tes lulus. Ekspektasi tes ekuivalen MCMA lama diselaraskan dengan pembagian poin tersimpan yang sudah diimplementasikan; scoring tidak diubah.
- Generator/content rules API: 9 tes lulus.
- Worker runtime/IRT v3: 8 tes lulus; jalur Redis calibration tetap ada.
- UI generator: 5 tes lulus, mencakup authorization, disabled flag, explicit Save dan retry terminal execution.
- Connected Nest/Identity/ContentAdminGuard → worker HTTP → Python subprocess → preview/DRAFT: lulus dengan tiga format, parallel prepare/save, idempotency conflict, replay/digest, expired lease/retry, tampering, rubric/artifact/foreign lineage, rollback, duplicate content dan revoked approval.
- Browser Admin nyata: Generate → preview → Save DRAFT lulus pada mobile 390px dan desktop 1440px; tidak ada overflow horizontal. Bukti di `outputs/generator-v1/admin-mobile.png` dan `admin-desktop.png`. Renderer Kategori diperbaiki agar legend sr-only tidak ditimpa lebar penuh.
- Regresi service PostgreSQL asli: 11 tes lulus. Adapter hanya mengganti fixture setup ke guard forward pusat; trigger produksi tidak dinonaktifkan/diganti.
- Listener HTTP yang tidak merespons: timeout transport 45 detik lulus. Run akhir harness default (tanpa skip browser/timeout) selesai exit 0, termasuk connected API/UI dan seluruh 11 regresi service. Respons hilang disimulasikan setelah eksekusi service berhasil; tidak membuat execution tambahan.
- Count assessment attempts, XP ledger, student exposure, dan IRT batches tidak berubah dalam connected chain. Canonical hasil generator tetap DRAFT.

Tes `integrated-migrations.spec.ts` tanpa database env secara sengaja skipped (16); ini tidak diklaim lulus. Bukti penerapan dan guard 0037 berasal dari cluster disposable connected harness serta regresi service di atas. Pengujian ini bukan seluruh suite assessment/IRT release staging.

## Batas bukti dan activation

Crash diuji melalui lease terbengkalai/expired dan fencing, bukan kill pada setiap instruksi proses. Data/auth/approval lokal semuanya TEST ONLY. Mapping akademik produksi, media aktif, publication/distribution, kalibrasi hasil kandidat dan ekuivalensi akademik berada di luar bukti ini.

Prasyarat activation, manifest approval dan command harness dijelaskan dalam [runbook generator](../content/GENERATOR_SERVICE_V1.md). Flag tetap false. Perubahan tersedia di working tree untuk review; pekerjaan lain yang sudah ada di checkout dipertahankan.

## Whole-package workflow verification (7 October 2026)

Owner-requested package workflow implemented with migration 0038 and generated OpenAPI types. Connected verification passed against isolated PostgreSQL and the real Python generator: Tryout 30, Drill 10, Pretest 20; Content/Super Admin authorization and denied roles; concurrent prepare replay; rejected modified/truncated JSON; read-only validation; concurrent import returning one DRAFT package; distinct family identities and preserved VARIANT → ORIGINAL/rubric lineage; no assessment, XP, exposure or IRT writes.

Connected Playwright desktop/mobile verification passed: choose Drill scope → generate → results → preview → download JSON → upload downloaded file → validation → save DRAFT. Supporting checks: API compilation, web typecheck, root lint, 12 contract schemas, generated types check, and 13 API-routing/preview regression tests passed.

Interactive localhost:3000 uses the same real Supabase QA identity `numora-qa-adminsuper@example.invalid`, with explicit TEST ONLY fixtures in disposable local PostgreSQL. Generator paths use the isolated API; other application paths continue to use the main localhost:3001 API. All three new pages returned HTTP 200. Shared production mappings/schema were not synthesized or manually changed.

Reproduce the connected package test after building API/database/orchestration: set `GENERATOR_PACKAGE_TEST=true` and run `scripts/test-generator-local.py` using the AI service virtualenv Python. Local fixture setup supports all 60 distinct demo source families.
