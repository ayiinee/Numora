# SIS-001 — Penyelesaian Drill

ENGINEERING DECISION — workflow tim QA, 27 Oktober 2026.

Pemilik role: siswa. Tujuan: siswa dapat menyelesaikan Drill PG 10 soal, menyimpan jawaban, memperoleh nilai/progres/XP yang benar, dan membuka kembali hasil tanpa efek submit ganda. Pengujian batas 70/80, latest/best, nol, bonus waktu dan akses memakai aturan PRD v0.6 serta klarifikasi owner yang dirujuk pada manifest.

Mulai dari identitas siswa sintetis yang sudah memiliki sesi; pendaftaran, Google OAuth nyata, Curriculum-approved content dan monitoring guru adalah dependensi/skenario lain. Harness hanya mengganti batas autentikasi dengan identitas email sintetis; API Nest, guard, transaksi, PostgreSQL, ledger dan consumer outbox tetap kode aplikasi nyata. Tidak ada mock respons produk pada suite connected.

`scenario.json` adalah daftar otoritatif case/check/profil. Tes unit integrasi bersama tetap dirujuk dari modul asal. Tes khusus baru berada di folder ini. Alat pipeline bersifat bersama dan dirujuk dari manifest. Semua angka beban adalah eksperimen lokal; tidak menetapkan SLO produksi.

Jalankan dari root: `pnpm qa run --scenario SIS-001 --profile full`. Lihat panduan utama dan workflow untuk setup serta pilihan sesudah laporan.
