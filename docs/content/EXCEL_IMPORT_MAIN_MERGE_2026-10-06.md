# Rekonsiliasi branch impor Excel dengan main — 6 Oktober 2026

**ENGINEERING DECISION — permintaan pemilik:** menyelesaikan merge `origin/main` (`fbb031b`) ke `feat/excel-parser`, mempertahankan impor tujuan/paket, pembaruan reward PRD v0.6, permission Admin, materi dan notifikasi. Tidak mengubah keputusan akademik atau membuka publikasi konten impor.

## Migrasi

- SQL dan snapshot canonical `main` 0000–0027 dipertahankan. Impor terarah ditambahkan sebagai `0028_question_package_imports`; snapshot baru dihasilkan oleh Drizzle dari schema gabungan.
- SQL 0028 sama persis dengan migrasi purpose/package yang sebelumnya bernama `0025_magical_phil_sheldon`. Timestamp journal juga dipertahankan agar database yang sudah memakainya tidak menjalankan ulang DDL.
- Empat file SQL/journal fork Excel disimpan tanpa perubahan di `packages/database/staging/fixtures/excel-import-branch`. Runner mengenali hash yang pernah dipakai, termasuk line ending LF/CRLF notifikasi lama. Histori yang sudah ada tidak diubah/dihapus.
- Recovery hanya menerima hash fork yang dikenal dengan baseline bersama yang sesuai. Migrasi reward/data yang belum diterapkan dijalankan dalam urutan canonical, secara transaksional. Notifikasi yang sudah ada tidak dibuat ulang; pembatasan akses tambahan dari main diterapkan dan dicatat.
- Git merge ini tidak menjalankan migrasi pada database bersama. Jalur upgrade diuji pada PostgreSQL lokal terisolasi. Database dengan data yang melanggar constraint baru dari main tetap ditolak, bukan diperbaiki atau dilonggarkan diam-diam. Fixture lama dengan beberapa paket Drill resmi terbit pada satu level termasuk data yang harus direkonsiliasi sebelum upgrade.

## Pemeriksaan

- Tidak ada entry Git unmerged atau marker konflik tersisa.
- Tes migration/journal/lockdown: 16 lolos, mencakup canonical upgrade, fork IRT, fork notifikasi, fork Excel sebelum/sesudah purpose, retry dan histori tetap utuh.
- Tes integrasi API: 42 lolos pada tujuh file, mencakup importer/paket, scope/purpose, Drill, reward, Tryout, notifikasi dan otorisasi.
- OpenAPI dan tipe frontend dihasilkan ulang dari DTO gabungan. Import `Link` yang hilang akibat auto-merge diperbaiki; shortcut Pretest yang sebelumnya dihapus tetap dihapus.
- Tes frontend: 216 lolos pada 30 file. Typecheck seluruh workspace, lint dan pemeriksaan schema/tipe kontrak lolos.
- Unit API: 75 lolos; assessment engine: enam lolos; worker: sembilan lolos, satu probe Redis dilewati karena koneksi uji tidak tersedia.
- Build backend/package dan frontend produksi lolos. Playwright: 16 skenario impor terarah/media dan materi/notifikasi dengan fixture API/media lolos.

Laporan [verifikasi pipeline sebelumnya](CONTENT_PACKAGE_PIPELINE_VERIFICATION_2026-10-06.md) adalah bukti sebelum merge, termasuk penerapan migrasi fork lama ke development. Tidak mengklaim bahwa seluruh migrasi main sudah diterapkan ke cloud. Pengujian R2 nyata dan dependensi blueprint/runtime tetap seperti pada laporan tersebut.
