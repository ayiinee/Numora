# Integrasi PR #77, #71 dan #69

**ENGINEERING DECISION — Aini, 5 Oktober 2026:** integrasikan reward Drill/TryOut PG, alignment data v0.6 dan Materi/notifikasi. Persetujuan ini tidak mengaktifkan rubrik PGK, scoring biasa untuk fallback IRT atau publication gate yang belum final.

## Rekonsiliasi

- Pertahankan hash, urutan dan snapshot migrasi XP `0024_drill_v06_rewards` serta `0025_tryout_xp_v06` yang sudah diterapkan di sandbox. Data alignment menjadi `0026_prd_v06_data_alignment`; Materi/notifikasi menjadi `0027_materials_notifications`. Kolom/constraint latest stars yang sudah ada tidak dibuat ulang.
- Satu posting XP per attempt, dalam transaksi grading/progress/outbox, dengan pin reward dan provenance immutable. Pin reward Drill v2 terpisah dari scoring paket v1. Ledger numeric dari #71 dipertahankan; XP Drill tetap dibulatkan sekali sesuai keputusan Aini. Rubrik PGK dan fallback parsial belum diaktifkan.
- Result Drill mempertahankan rincian `reward` untuk UI dan field XP kompatibel dari #71. History tetap memakai `ready`/`legacy` agar nilai lama tidak dianggap nol atau menunggu reward baru. Regenerasikan OpenAPI dan seluruh shared types.
- Paket Drill resmi baru wajib memakai scoring policy v0.6; paket demo tetap jelas berlabel demo. Snapshot dan kebijakan attempt lama dipertahankan, termasuk expiry pembahasan legacy. Attempt reward v2 tidak memiliki expiry baru.
- Integrasi mempertahankan notifikasi transactional saat unlock. Pagination notifikasi memakai timestamp PostgreSQL penuh serta UUID, memvalidasi filter jenis cursor, dan tetap mengizinkan cursor yang telah dibaca atau melewati batas arsip.
- Filter Materi menyusun perubahan dari URL browser terkini dan memakai History API untuk filter lokal. Menghapus pencarian lalu cepat mengganti kategori tidak boleh mengembalikan pencarian lama; regresi browser memeriksa kedua parameter setelah interaksi berurutan.
- Connected acceptance mencakup tujuh check wajib: reward/session, otorisasi, TryOut/privacy/history, importer/preview dan multi-class/ban/leave/takeover. Daftar check lengkap wajib hadir pada satu SHA; jumlah test saja tidak cukup.

## Gate dan rollout

Jalankan integration PostgreSQL/Redis tanpa skip, tes upgrade dari baseline sampai 0025 dengan reward historis, lint/typecheck/build, contract validation/freshness, serta connected IRT/browser pada satu SHA. CI gabungan pada head PR dan CI main menjadi bukti engineering, bukan approval Curriculum, Google/R2 Cloud, atau QA independen.

Migrasi 0026/0027 pada pekerjaan integrasi ini hanya diterapkan pada database lokal terisolasi. Cloud masih memerlukan backup/rehearsal dan penerapan migrasi oleh operator, bersama deployment API/worker/web. Merge Git tidak menjalankan migrasi atau deployment Cloud. Histori dan secrets tidak diubah; aturan PGK yang menunggu konfirmasi tetap dicatat di product context.
