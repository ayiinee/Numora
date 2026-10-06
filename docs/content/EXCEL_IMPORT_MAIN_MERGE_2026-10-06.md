# Rekonsiliasi branch impor Excel dengan main — 6 Oktober 2026

**ENGINEERING DECISION — permintaan pemilik:** menyelesaikan merge `origin/main` ke `feat/excel-parser`, pertama `fbb031b`, lalu pembaruan `53e7857` dan `607c3c5`, mempertahankan impor tujuan/paket, reward PRD v0.6, permission Admin, materi/notifikasi, lifecycle Pretest/Tryout/PvP dan revisi UI yang disetujui. Tidak mengubah keputusan akademik atau membuka publikasi konten impor.

## Migrasi

- SQL dan snapshot canonical `main` 0000–0029 dipertahankan. Impor terarah ditambahkan sebagai `0030_question_package_imports`; snapshot baru dihasilkan oleh Drizzle dari schema gabungan. Nomor 0028 pada merge awal bergeser karena main menambahkan lifecycle/PvP pada nomor 0028/0029.
- SQL 0030 sama persis dengan migrasi purpose/package yang sebelumnya bernama `0025_magical_phil_sheldon`. Timestamp baru mengikuti main. Recovery mencatat cursor canonical untuk hash yang sudah ada tanpa menjalankan ulang DDL; baris histori asal dipertahankan.
- Empat file SQL/journal fork Excel disimpan tanpa perubahan di `packages/database/staging/fixtures/excel-import-branch`. Runner mengenali hash yang pernah dipakai, termasuk line ending LF/CRLF notifikasi lama. Histori yang sudah ada tidak diubah/dihapus.
- Recovery hanya menerima hash fork yang dikenal dengan baseline bersama yang sesuai. Migrasi reward/data yang belum diterapkan dijalankan dalam urutan canonical, secara transaksional. Notifikasi yang sudah ada tidak dibuat ulang; pembatasan akses tambahan dari main diterapkan dan dicatat.
- Git merge ini tidak menjalankan migrasi pada database bersama. Jalur upgrade diuji pada PostgreSQL lokal terisolasi. Database dengan data yang melanggar constraint baru dari main tetap ditolak, bukan diperbaiki atau dilonggarkan diam-diam. Fixture lama dengan beberapa paket Drill resmi terbit pada satu level termasuk data yang harus direkonsiliasi sebelum upgrade.

## Pemeriksaan merge awal (`fbb031b`)

- Tidak ada entry Git unmerged atau marker konflik tersisa.
- Tes migration/journal/lockdown: 16 lolos, mencakup canonical upgrade, fork IRT, fork notifikasi, fork Excel sebelum/sesudah purpose, retry dan histori tetap utuh.
- Tes integrasi API: 42 lolos pada tujuh file, mencakup importer/paket, scope/purpose, Drill, reward, Tryout, notifikasi dan otorisasi.
- OpenAPI dan tipe frontend dihasilkan ulang dari DTO gabungan. Import `Link` yang hilang akibat auto-merge diperbaiki; shortcut Pretest yang sebelumnya dihapus tetap dihapus.
- Tes frontend: 216 lolos pada 30 file. Typecheck seluruh workspace, lint dan pemeriksaan schema/tipe kontrak lolos.
- Unit API: 75 lolos; assessment engine: enam lolos; worker: sembilan lolos, satu tes integrasi PostgreSQL dilewati pada run unit.
- Build backend/package dan frontend produksi lolos. Playwright: 16 skenario impor terarah/media dan materi/notifikasi dengan fixture API/media lolos.

## Pemeriksaan akhir (`607c3c5`)

- Migrasi canonical main 0000–0029 tidak berubah; tambahan hanya SQL/snapshot 0030 dan entry journal. Histori fork IRT dan Excel yang ditemukan lewat probe read-only development tercakup pada tes recovery gabungan. Tidak menjalankan migrasi cloud.
- PostgreSQL lokal terisolasi: 18 tes migration/journal/activation lolos, termasuk upgrade merge awal dengan cursor purpose lama, retry, rollback dan histori tetap utuh. Integrasi API: 50 tes pada sembilan file lolos, termasuk importer/paket, otorisasi, Pretest/Tryout dan jawaban PGK.
- Fixture hasil Tryout menggunakan waktu publikasi yang sudah berlalu agar presisi mikrodetik PostgreSQL tidak bertabrakan dengan milidetik JavaScript; trigger publikasi batch tetap diperiksa. Tidak melonggarkan gate rilis.
- Unit API: 76 lolos; assessment engine: 16 lolos; worker: sembilan lolos, satu tes integrasi PostgreSQL dilewati pada run unit. Frontend: 233 tes pada 32 file lolos. Shutdown worker tetap menunggu polling notifikasi dan IRT.
- Revisi UI main dipertahankan: tiga shortcut Home, akses Pretest di Materi, dan navigasi Teacher sesuai handoff. Tes memeriksa bahwa Pretest aktif tidak menambah shortcut Home. Import `Link` ganda hasil auto-merge dihapus.
- OpenAPI/tipe frontend dihasilkan ulang; delapan schema kontrak, freshness tipe, 68 repository checks, lint dan 14 tugas typecheck lolos. Sembilan tugas build backend/package serta build produksi frontend lolos.
- Playwright produksi: sembilan skenario lolos, mencakup tiga tujuan impor, preview/gambar dan retry R2, serta Pretest/Tryout pada 390/1280 px. API/auth/media menggunakan fixture; bukan bukti integrasi R2 cloud.

Laporan [verifikasi pipeline sebelumnya](CONTENT_PACKAGE_PIPELINE_VERIFICATION_2026-10-06.md) adalah bukti sebelum merge, termasuk penerapan migrasi fork lama ke development. Tidak mengklaim bahwa seluruh migrasi main sudah diterapkan ke cloud. Pengujian R2 nyata dan dependensi blueprint/runtime tetap seperti pada laporan tersebut.
