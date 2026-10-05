# Slug kurikulum dan level soal — 3 Oktober 2026

**USER CLARIFICATION — Reyhan:** indikator sama dengan competency. Siswa memilih Bab → Subbab → Level. Level N mengambil soal dengan nomor level kurikulum N dari indikator-indikator dalam subbab tersebut. Progres/unlock tetap per subbab, bukan per indikator. Kuota soal setiap indikator dan jumlah level tetap OPEN; perubahan ini tidak membangun pemilih paket otomatis.

**ENGINEERING DECISION — aturan slug disetujui pengguna bersama backend:** bab mempunyai slug unik global; subbab unik pada pasangan chapter_id/slug. Slug hanya huruf kecil ASCII, angka, dan tanda hubung, tidak kosong. Nama dapat berubah tanpa otomatis mengganti slug. UUID dan code tetap menjadi identitas/lookup lama. Rename fisik competencies tidak diperlukan karena semua pemakai API/schema tetap kompatibel; label produk dapat menggunakan Indikator.

## Dua migrasi baru

1. `0019_curriculum_slugs`: tambah kolom nullable dahulu, backfill dari nama yang dinormalisasi, lalu terapkan NOT NULL, unique index dan check format. Nama sama setelah normalisasi dalam scope yang sama mendapat suffix UUID. Jika hasil masih bentrok dengan nama lain yang memang menyerupai suffix itu, transaksi gagal untuk ditinjau operator; tidak ada penggabungan data. Nama yang tidak menghasilkan karakter ASCII memakai fallback chapter/subchapter. Setelah migrasi, insert SQL langsung wajib memberikan slug. API Admin lama yang mengirim name/code tanpa slug tetap didukung melalui pembentukan slug saat create saja; slug eksplisit dapat diberikan. Benturan nama saat create ditolak oleh constraint, sehingga client perlu memberikan slug unik.
2. `0020_indicator_question_levels`: tambah `questions.curriculum_level_number`, integer positif atau null, dan indeks `(primary_competency_id, curriculum_level_number)`. Nomor ini adalah posisi level dalam indikator, bukan EASY/MEDIUM/HARD atau kategori kognitif. Relasi `levels.subchapter_id` dan unique `(subchapter_id, level_number)` dipertahankan. Varian dalam keluarga soal mewarisi nomor level keluarga. Importer harus memisahkan keluarga untuk butir yang berasal dari level berbeda.

Kolom level baru nullable untuk mempertahankan bank/paket lama tanpa menebak pemetaan dari kode atau nama. Seeder demo baru mengisi level 1; seeder tidak menulis ulang bank lama. Publikasi/edit paket memeriksa nomor level jika tersedia. Soal lama dengan null tetap menggunakan pemeriksaan subbab sebelumnya; null bukan bukti bahwa soal cocok untuk semua level. Pemetaan seluruh bank diperlukan sebelum mengandalkan filter pool baru secara penuh. Keputusan ini tidak mengubah paket terbit, attempt, question_version, skor, atau progres yang ada.

## Contoh pool calon soal

```sql
SELECT q.id, q.primary_competency_id
FROM questions q
JOIN competencies i ON i.id = q.primary_competency_id
JOIN levels l ON l.subchapter_id = i.subchapter_id
WHERE l.id = :level_id
  AND q.curriculum_level_number = l.level_number;
```

Query ini menunjukkan pemetaan saja. Pemilih produksi tetap memerlukan status READY, versi ditinjau, paket berisi 10 soal dan aturan varian/retry. Tidak ada asumsi kuota sama atau pasti satu soal dari setiap indikator.

## Dampak JSON dan API

JSON persiapan tetap memakai chapterCode/subchapterCode/competencyCode. `metadata.sourceLevelNumber` pada 10 sampel dipetakan ke `questions.curriculumLevelNumber` setelah indikator dan scope diverifikasi. `levelCode` diselesaikan ke level subbab yang sesuai; kontrak repo belum menetapkan sintaks kode level. Definisi pool di atas tidak mengharuskan mengganti struktur stem/options/answer/explanation/gambar.

API Admin menerima slug opsional saat create, menampilkan slug bab/subbab dan nomor level bank soal. API katalog siswa menyertakan slug secara aditif. Endpoint bisnis tetap memakai UUID. Frontend belum beralih ke URL slug, dan backend belum menyediakan resolver route slug. Tim Software perlu menghubungkan `/student/learn/{chapterSlug}/{subchapterSlug}` ke UUID, menyelesaikan subbab dalam scope bab, dan menangani tautan UUID lama. URL UUID yang ada bukan kerusakan database; permintaan ini memperbaiki keterbacaan URL.

## Penerapan

Perubahan disiapkan pada branch `feat/data-curriculum-slugs`, dari origin/main `3c671a0`. Jangan mengedit SQL/jurnal migrasi lama. Operator perlu memeriksa histori Staging yang sebenarnya sebelum apply, termasuk bridge/histori fork bila relevan. Sesudah backup/restore dan rehearsal terhadap target uji yang disetujui, jalankan jalur migrator Drizzle repo dengan kredensial operator, lalu periksa hasil dan riwayat migrasi. Tidak ada migrasi/seed yang dijalankan ke Supabase Cloud oleh pekerjaan persiapan ini.

**INTEGRATION UPDATE:** sebelum penyerahan PR #54, main mencapai `8680b2f` setelah PR #52/#53 menambahkan migrasi 0012/0013. Kedua migrasi tugas ini belum diterapkan ke Cloud dan dihasilkan ulang sebagai 0014/0015 dari snapshot terbaru. SQL, snapshot dan jurnal upstream dipertahankan; sembilan pemeriksaan SQL diulang terhadap seluruh jalur terbaru dan lulus.

Pemeriksaan mencakup upgrade data lama dan constraint menggunakan PostgreSQL in-memory PGlite, typecheck/build, serta validasi kontrak. PGlite tidak menggantikan uji restore atau rehearsal terhadap snapshot Staging dan bukan uji API HTTP PostgreSQL penuh. Lihat hasil validasi yang diberikan bersama perubahan untuk status pemeriksaan aktual.

**VALIDATION — 3 Oktober 2026:** [bukti dan hash migrasi](evidence/curriculum-migrations-2026-10-03.json): 9 pemeriksaan SQL PGlite lulus; build database/API, typecheck API/web, lint, validasi kontrak dan freshness generated types lulus. Tes database 3 lulus/5 dilewati; API 34 lulus/57 dilewati; tes kontrak 3 lulus. Tes integrasi yang memerlukan TEST_DATABASE_URL, termasuk pengujian HTTP penolakan level yang tidak cocok, belum dijalankan. Cloud, backup/restore Staging, dan route frontend belum diuji atau diubah. Script pemeriksaan PGlite beserta dependency terpisah disimpan di outputs workspace, bukan sebagai dependency aplikasi.

Sesudah integrasi main `8680b2f`, `pnpm run ci` lulus: 36 pemeriksaan repo, validasi kontrak/generated types, lint, typecheck seluruh workspace, tes yang tersedia, dan build seluruh workspace. Tes web 80 lulus; worker 6 lulus/7 dilewati. Batas integrasi database di atas tetap berlaku; keberhasilan lokal ini tidak mengklaim bahwa tes integrasi PostgreSQL/HTTP atau E2E telah lulus.

**RECONCILIATION ? 4 October 2026:** setelah PR #51/#60 masuk main, migrasi baru ini ditambahkan sebagai 0019/0020. Seluruh SQL/jurnal/snapshot main 0000?0018 dipertahankan; snapshot lanjutan diregenerasikan dari 0018. Rubrik, reference pins dan dispatch IRT tidak ditimpa. Tes package menggabungkan penolakan level dan preservation versi/rubrik; fixture measurement baru menyertakan slug eksplisit. Bukti PGlite bertanggal 3 Oktober adalah historis; gate PostgreSQL/HTTP dan connected chain baru tercatat pada CI PR #54 dan release integrasi. Tidak ada migrasi Cloud.
