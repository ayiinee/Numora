# Batch insert konten dan provenance

**ENGINEERING DECISION — 14 November 2026:** lengkapi prioritas write/import
pada PR #176. Setelah validasi dan pengambilan lock existing, server menyiapkan
UUID baru dan menulis families, variants, identities, versions serta provenance
per lapis FK, maksimal 200 row per statement. Tidak mengandalkan urutan RETURNING.

Report mempertahankan urutan input dan ID hasil. Konten dengan hash sama tetap
SKIPPED_UNCHANGED, termasuk pemeriksaan rubric Pretest existing. Revisi memakai
versi bertambah dan revisedFrom yang sama; tidak mengubah versi historis.
Rubric Tryout/Pretest yang otomatis diturunkan dari type/count yang sama dipakai
ulang hanya di dalam transaksi ini, setelah validasi/lock pertama. Tidak membuat
cache approval lintas request atau kebijakan akademik baru.

Seluruh validasi, idempotency, identity/package lock, expected revision/source,
media receipt, DRAFT-only, package composition dan audit tetap dalam transaksi
existing. UUID baru, kelima lapis FK, report dan audit batal bersama pada failure.
Tidak ada migrasi, environment atau kontrak baru. Batas batch menghindari jumlah
bind parameter besar; input tetap mengikuti validator dan batas HTTP existing.

## Pengukuran dan regresi

Statement-level AFTER INSERT trigger khusus fixture menghitung lima tabel FK
pada database lokal terisolasi dengan role Main non-owner. Instrumentasi dibuat
oleh owner test, lalu dihapus dalam finally; tidak dipasang pada cloud.

- Import baru 201 soal: sebelum 1.005 statement, sesudah 10 (dua batch/lapis).
- Import ulang dengan satu perubahan: 200 SKIPPED_UNCHANGED dan dua statement
  version/provenance; nomor versi dan parent ID benar, 200 ID lainnya tetap.
- Failure BEFORE INSERT pada lapis provenance terakhir membatalkan families,
  versions dan record import; tidak ada sisa partial write.
- Seluruh 29 tes preview/import lulus tanpa skip, termasuk mixed formats,
  revision/idempotency races, media/publication gates, rollback dan least-data
  upload summary. Budget baru gagal pada source #176 sebelum batching.

Baseline statement memakai source PR #176 sebelum perubahan batching, bukan
benchmark mutation Supabase cloud. Angka transfer cloud pada dokumen payload
sebelumnya tetap grup read-only upload; tidak mengklaim seluruh billing turun.
Grading Drill dilengkapi terpisah melalui PR #185 (10 upsert → satu).

```powershell
pnpm --filter @tka/api exec vitest run src/modules/content/content-preview.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Gunakan NODE_ENV=test dan TEST_DATABASE_URL localhost khusus; kosongkan koneksi
runtime/migrasi cloud. Sesudah review/merge, deploy API dan pantau import size,
durasi transaksi, lock waits serta revision conflicts. Rollback melalui revert
dan redeploy, tanpa perubahan schema atau penulisan ulang histori.
