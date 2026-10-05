# Integrasi PR 59, 63, 64, 65, 67, dan 68

**ENGINEERING DECISION — 5 Oktober 2026:** Aini mengizinkan integrasi keenam PR ke `main` menggunakan akses bypass. Pekerjaan dilakukan pada branch integrasi di folder proyek utama; tidak membuat worktree baru dan tidak memasukkan credential lokal.

Perubahan mencakup pembersihan types Next sebelum typecheck (#59), dashboard Admin baca saja (#63), kartu Pretest yang masih unavailable dan pengujian hasil Drill expired (#64), importer/preview DRAFT tanpa skor (#65), workspace Teacher beserta seed development opt-in (#67), dan diagnosis env provisioning QA (#68). Seed Teacher tidak berjalan otomatis ketika kode digabung.

## Rekonsiliasi

- Navigasi Admin mempertahankan menu pengguna/kelas dan menu impor/preview. Menu serta endpoint konten tetap memerlukan capability `CONTENT_MANAGE`; modul operasional di luar konten mempertahankan otorisasi backend yang ada.
- Tes expiry Drill memajukan waktu aplikasi, bukan menulis ulang `finished_at` assessment final. Skor dan seluruh fakta attempt dibandingkan sebelum/sesudah pembacaan expired.
- Fixture konkurensi upload media dari #65 memakai staging key baru per pemanggilan, sesuai service nyata. Perbaikan ini juga menyelesaikan kegagalan fixture yang terlihat pada CI #68.
- Vitest API hanya mengoleksi tes `src`; tes `node:test` provisioning Teacher ikut gate `pnpm test:checks`. Tes SQL Teacher dapat berjalan otomatis dari `TEST_DATABASE_URL`, membuat database localhost sendiri, memakai transport Auth **TEST ONLY**, dan menghapus database tersebut setelah membuktikan replay, konflik histori serta rollback. Mode rehearsal restore eksplisit tetap tersedia.
- Connected release-chain hanya mengoleksi `release-chain.spec.ts`. Browser Teacher yang memerlukan sesi Cloud tetap memakai konfigurasi opt-in tersendiri; CI tidak membutuhkan credential Cloud untuk menjalankan rantai lokal.
- Bootstrap/teardown suite preview memiliki batas 60 detik agar migrasi database terisolasi selesai sebelum pengujian dan cleanup.
- Connected logout Teacher memilih tombol profil `Keluar dari akun` secara exact; shell Teacher baru juga memiliki tombol `Keluar akun`, sehingga selector regex lama ambigu. Pengujian tetap memverifikasi logout, penolakan URL langsung dan login ulang.

## Verifikasi dan batas

Gate lokal mencakup 57 tes script tanpa skip, delapan schema, generated types, lint, typecheck, build, dan tes PostgreSQL nyata untuk seed Teacher, lifecycle Drill serta konkurensi media. Gate final pada satu SHA mengikuti workflow [CI main](https://github.com/ayiinee/Numora/actions/workflows/ci.yml?query=branch%3Amain), termasuk suite PostgreSQL/Redis, connected IRT, connected release/browser, E2E dan freshness OpenAPI. Bukti CI tiap PR sebelum integrasi tidak menggantikan gate gabungan.

**OPEN:** smoke importer/preview Cloud menggunakan R2 dan sepuluh sampel masih menunggu credential Object Read & Write khusus `numora-bucket`. `CONTENT_IMPORT_PREVIEW_ENABLED` dan upload R2 tetap nonaktif sampai rollout yang didokumentasikan selesai. Merge tidak menutup acceptance Cloud, scoring PGK, publikasi konten, approval Curriculum, Google trial, atau QA independen. [Bukti importer](../testing/CONTENT_IMPORT_PREVIEW_ACCEPTANCE_2026-10-04.md) dan bukti JOB-06 historis tetap dipertahankan.

## Reconciliation tambahan: konflik UI dan migrasi

**ENGINEERING DECISION — 5 October 2026:** revisi UI terbaru dari UI_FEEDBACK_REVISION_2026-10-05.md dipertahankan: Teacher Kelas/Profil, feedback kontekstual, tanpa memulihkan route notifikasi Teacher dari branch lama. CSS importer/preview tetap disertakan.

Benturan nomor 0022 diselesaikan tanpa mengubah isi SQL: 0022_amusing_quasar tetap untuk notifikasi/material category; lockdown menjadi 0023_data_api_runtime_lockdown; import/preview menjadi 0024_content_import_preview. Journal berurutan, cursor meningkat dan snapshot terhubung dengan struktur dari kedua branch. Migrasi Git/history/hash tetap berlaku; tidak ada migrasi cloud yang dijalankan dari pekerjaan Excel ini.

Excel menggunakan importer dan verified-media upload yang sudah ada. Lihat [kontrak V3](../content/EXCEL_IMPORT_TEMPLATE_SPEC.md). Prototipe lokal lama dipertahankan di .tmp/excel-parser-legacy/ dan bukan jalur produksi kedua.
