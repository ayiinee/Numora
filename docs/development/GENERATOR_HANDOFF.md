# Menjalankan alur generator yang sama

**ENGINEERING DECISION:** generator paket memakai service Python terpisah. Demo lokal membuat PostgreSQL sementara, 60 keluarga sumber TEST ONLY dan role database terbatas; tidak menambahkan approval sintetis ke database bersama. Datanya dihapus ketika proses berhenti. Publikasi tetap mengikuti validasi konten asli.

## Persiapan sekali (Windows)

Gunakan Node 24, Corepack/pnpm 12.6 dan Python 3.11+. Clone kedua repository berdampingan:

```powershell
git clone https://github.com/ayiinee/Numora.git
git clone https://github.com/ShafwanAdhi/numora-ai-service.git
cd numora-ai-service
git checkout 3a0f21e
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ../Numora
corepack pnpm install --frozen-lockfile
npm install --prefix .tmp/pg-runtime --no-save @embedded-postgres/windows-x64@16.14.0-beta.17
corepack pnpm --filter @tka/database build
corepack pnpm --filter @tka/assessment-engine build
corepack pnpm --filter @tka/irt-orchestration build
corepack pnpm --filter @tka/api build
```

Jika lokasi service berbeda, set `NUMORA_AI_SERVICE_PATH`. Linux/macOS dapat memakai PostgreSQL lokal dengan `POSTGRES_BIN` menunjuk direktori `initdb` dan `pg_ctl`, serta `.venv/bin/python`.

## Aplikasi penuh dan akun Super Admin yang sama

Salin `.env.example` menjadi `.env`, lalu isi koneksi Development/Supabase/R2 melalui kanal privat tim. Jangan commit `.env`. Identitas `numora-qa-adminsuper@example.invalid` tetap menggunakan autentikasi Supabase proyek yang sama; password tidak disertakan dalam repository. Jalankan migrasi sesuai prosedur database tim (`corepack pnpm db:migrate`); generator produksi memerlukan role/grant dan mapping ORIGINAL yang disetujui, lihat `docs/content/GENERATOR_SERVICE_V1.md`.

Terminal pertama (API utama port 3001):

```powershell
corepack pnpm dev:prepare
node --env-file=.env apps/api/dist/main.js
```

Terminal kedua (generator dan frontend port 3000):

```powershell
$env:GENERATOR_REAL_QA_EMAIL='numora-qa-adminsuper@example.invalid'
corepack pnpm dev:generator
```

Buka `http://localhost:3000/admin/login`, login dengan akun di atas, lalu Generator paket. Pilih Drill 10 / Pretest 20 / Tryout 30; selesai generate otomatis masuk ke Impor soal langkah 2, lalu validasi dan simpan DRAFT. Download JSON opsional. Endpoint lain tetap menuju API utama port 3001. Tutup frontend lain di port 3000 sebelum menjalankan perintah ini.

Tanpa `.env` tim, hapus `GENERATOR_REAL_QA_EMAIL` untuk demo terisolasi dengan login fixture yang dicetak launcher. Ini bukan akun Supabase asli. Untuk menguji paket dengan Python/service sebenarnya, jalankan launcher Python dengan `GENERATOR_PACKAGE_TEST=true` tanpa `GENERATOR_DEMO`; lihat laporan verifikasi `docs/testing/GENERATOR_V1_VERIFICATION_2026-10-07.md`.

## Verifikasi PR setelah merge main

API/web typecheck, root lint, 12 schema kontrak dan generated types check lolos. Regresi upload/preview/routing: 18 tes; generator/Drill Bab 3/PvP bank: 18 tes. Mapping/Excel importer: 23 tes lolos, satu integrasi database dilewati tanpa TEST_DATABASE_URL. Build serial seluruh 10 package lolos. Bukti connected generator desktop/mobile sebelum merge tercatat pada laporan generator. Launcher handoff baru telah diperiksa sintaksnya; setup dari clone bersih belum diuji otomatis.
