# Runbook importer/preview DRAFT

**ENGINEERING DECISION:** rollout awal lokal/CI dan sandbox `pkamenfnwmoeisccnrnk`, bucket private `numora-bucket`. Tidak menerbitkan soal atau mengubah assessment Student. [Kontrak](../api/CONTENT_IMPORT_PREVIEW.md) menjelaskan permission dan state.

## Gate sebelum Cloud

1. Gunakan worktree dari main setelah PR #62. Simpan source PRD v0.6, kontrak v2, migrasi 0023 dan generated OpenAPI/types dalam PR yang sama. PR #63 dashboard operasional bukan prasyarat preview; pertahankan navigasinya bila sudah tergabung.
2. Jalankan lint, typecheck, build, contract validation/freshness dan PostgreSQL integration tanpa skip. Main dan compute diuji sebagai LOGIN non-owner terpisah.
3. Jalankan `pnpm test:release-chain` dari checkout bersih pada satu SHA, dengan PostgreSQL terisolasi `numora_test_job06*` dan Redis 7 loopback. Harness menggunakan provider dan transport S3 **TEST ONLY**; presigning, verifikasi byte, API, persistence dan browser tetap nyata. Bukti disimpan di `.tmp/job06-evidence/connected.json`. Ini memperluas bukti JOB-06 tanpa menghapus bukti sebelumnya.
4. Backup schema public/drizzle/irt_compute memakai tool PostgreSQL yang kompatibel. Simpan dump, checksum, fingerprint setiap tabel dan history migrasi di direktori privat di luar Git. Dump ini bukan backup Auth/Storage/configuration. Restore ke PostgreSQL lokal terisolasi, jalankan migrasi maju dan replay, cocokkan fingerprint lama (abaikan kolom baru `users.admin_role`) serta history append-only. Jangan menghapus database bersama untuk rehearsal.

## Operasi sandbox

1. Jalankan migrasi repo dengan `DATABASE_MIGRATION_URL` owner/operator. Runtime API memakai LOGIN main non-owner, anggota `numora_main_runtime`, tanpa SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS. Periksa RLS dan grant tabel baru; compute serta anon/authenticated/service_role tidak boleh membaca preview/kunci.
2. Provision satu akun Admin ACTIVE secara eksplisit. Pengguna memilih **DEMO-QA admin**, UUID `0ed807a0-3524-4deb-9aea-452f4a9ba400`, subrole `CONTENT_DATA_MODERATION`. Jangan menaikkan semua Admin atau akun personal menjadi Super Admin.

   ```powershell
   node --env-file=.env.operator.local apps/api/scripts/provision-content-admin.mjs --user-id 0ed807a0-3524-4deb-9aea-452f4a9ba400 --actor-id 0ed807a0-3524-4deb-9aea-452f4a9ba400 --role CONTENT_DATA_MODERATION --reason sandbox-content-preview-smoke
   ```

   File env operator lokal harus diabaikan Git. CLI memeriksa owner koneksi, role/status target dan actor, lalu mengaudit perubahan. Assignment ulang identik tidak mengubah histori.

3. Verifikasi credentials terbatas bucket, privasi bucket dan CORS untuk origin UI. Mulai dengan satu gambar smoke, reserve → PUT staging → complete VERIFIED → GET signed. Keberadaan env belum membuktikan storage bekerja. Signed URL dan token tidak boleh masuk bukti publik.
4. Buat master sampel melalui API: 2 bab, 3 subbab, 3 indikator, Level 1 tiap subbab, seluruhnya DRAFT dan **PROPOSED**, sesuai `docs/data/samples/2026-10-03/master-data.proposed.json`. Hentikan bila kode/nama/scope bertabrakan; jangan overwrite master existing atau menganggapnya approved Curriculum.
5. Salin direktori sampel ke direktori lokal yang diabaikan Git, lalu gunakan uploader `--samples` pada salinan itu. Gunakan run ID stabil dan token QA hanya di env lokal. Enam aset harus memiliki receipt VERIFIED; JSON menyimpan key/receipt tanpa token/signed URL. Source sampel historis tetap utuh.
6. Aktifkan `CONTENT_IMPORT_PREVIEW_ENABLED=true` hanya pada API sandbox yang diuji. Upload flag dapat dimatikan setelah upload; renewal GET tetap bekerja. Jalankan sepuluh sampel melalui UI/API: PG, MCMA, Category parsial/kosong; refresh/resume; save ack; submit/review; media di stem/option/statement/pembahasan; ownership/permission denial. Nilai tetap null dan DRAFT tidak muncul di katalog Student.
7. Catat SHA, hash migrasi, hasil rehearsal, UUID receipt/import/session dan hasil acceptance tanpa PII/jawaban/kunci/secrets. Catat kegagalan storage/CORS/credentials sebagai blocker nyata, bukan PASS.

## Rollback dan acceptance

Nonaktifkan flag importer/preview; hentikan API smoke sementara bila perlu. Pertahankan histori, DRAFT, assignment yang diaudit dan aset yang dipin. Jangan melakukan down migration destruktif atau menghapus key final untuk rollback fitur. Pencabutan subrole dapat dilakukan melalui CLI operator dengan assignment Operations bila memang diminta; bukan bagian otomatis rollback.

Fondasi dapat disebut selesai setelah gate engineering dan smoke sandbox lulus. Review PR, approval Curriculum, QA independen dan trial Google tetap mempunyai sign-off masing-masing. Fondasi ini tidak menutup scoring PGK, publikasi konten, seluruh RBAC v0.6 atau JOB-07 penuh.
