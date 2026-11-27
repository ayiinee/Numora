# Menjalankan alur generator yang sama

## Demo alur anchor dan varian

**ENGINEERING DECISION — permintaan pemilik, 27 November 2026:** satu paket
Tryout lokal tersedia untuk mencoba UI anchor sampai penyimpanan DRAFT tanpa
layanan cloud. Jalankan dari root Numora:

```powershell
pnpm dev:variant-demo
```

Buka tautan `DEMO_READY` di terminal. Login Super Admin fixture otomatis membuka
halaman Generate varian untuk **Tryout Matematika [DEMO LOKAL]** pada port 3100.
Pilih lima anchor, tinjau kesiapan, generate 25 soal, lalu simpan DRAFT. Isi soal
dan generator memakai bank Tryout dari service lokal; bukan respons sukses palsu.
Paket hasil dapat dibuka dan diperiksa. Publikasi mengikuti
[validasi teknis Tryout](TRYOUT_SIMPLE_PUBLICATION.md).

PostgreSQL, auth fixture, API, worker polling dan storage gambar memakai loopback.
Launcher membuat database sementara baru, memakai migrator canonical dan role
Main/compute terbatas. `.env` aplikasi dan database bersama tidak dipakai.
Ctrl+C membersihkan database; hasil demo hilang. Restart menghasilkan tautan login
baru dan mengisi ulang stok konseptual yang terbatas. Katalog dibatasi ke bank Tryout pertama; pin renderer, approval fixture,
fingerprint dan validasi artifact tetap diperiksa. Ini bukan acceptance produksi.

Persiapan sekali bila belum tersedia:

```powershell
python -m venv .tmp/generator-python
.tmp/generator-python/Scripts/python.exe -m pip install -r ../varian-numora/requirements-service-test.txt -r ../varian-numora/requirements-image.txt
```

Launcher mendeteksi sibling `numora-ai-service` atau `varian-numora`, Python venv
service atau `.tmp/generator-python`, serta PostgreSQL Windows 18 di Program Files.
Override tersedia lewat `NUMORA_AI_SERVICE_PATH`, `PYTHON`, `POSTGRES_BIN`, dan
`GENERATOR_DEMO_WEB_PORT`. Build dependency/API mengikuti persiapan di bawah.

Pemeriksaan terhubung, setelah demo siap:

```powershell
node scripts/test-tryout-variant-demo.mjs "<tautan DEMO_READY>"
```

Pemeriksaan menggunakan browser dan endpoint nyata: 25 request, 30 item DRAFT,
lima anchor identik dan seluruh item paket original tetap sama. Hasil serta
screenshot berada di `.tmp/variant-demo-evidence`, tidak dikomit.

Uji terhubung juga menemukan parameter `jsonb_build_object` tanpa tipe pada
penyimpanan paket varian (`42P18`). Parameter identitas sekarang dicast ke `text`;
metadata sumber tetap berupa ID proses dan paket yang sama.

**ENGINEERING VERIFICATION — lokal, 27 November 2026:** pemeriksaan browser
terhubung lulus dengan 5 anchor identik, 25 varian, 30 item DRAFT dan original
tetap sama. Build API, tiga tes unit varian, lint/format JS/TS yang berubah dan
pemeriksaan sintaks Python juga lulus. Tidak ada deployment atau migrasi bersama.

**ENGINEERING DECISION:** generator paket memakai service Python terpisah. Demo lokal membuat PostgreSQL sementara, 30 sumber Tryout dari bank lokal dan role database terbatas; tidak menambahkan approval sintetis ke database bersama. Datanya dihapus ketika proses berhenti. Publikasi tetap mengikuti validasi konten asli.

## Mencoba Generate Variant Tryout tanpa production

**ENGINEERING IMPLEMENTATION — 17 November 2026:** `pnpm dev:generator` memakai generator-service-v2, 27 config numeric dan 3 stok konseptual. Paket sumber bernama `SHAFWAN MAU TRY OUT [LOCAL TEST]`. UUID, metadata kurikulum, rubrik dan approval adalah fixture TEST ONLY di PostgreSQL loopback; isi soal berasal dari bank lokal. Ini tidak membuktikan approval akademik atau kesiapan production.

Setelah dependency dan build di bawah siap:

```powershell
cd "D:\collages\semester 5\numora\Numora"
Remove-Item Env:GENERATOR_REAL_QA_EMAIL -ErrorAction SilentlyContinue
$env:GENERATOR_DEMO_WEB_PORT = '3100'
pnpm dev:generator
```

1. Buka URL `DEMO_READY` yang dicetak terminal. URL ini memasukkan akun Super Admin fixture lokal.
2. Buka **Generate Variant**, pilih Tryout dan `SHAFWAN MAU TRY OUT [LOCAL TEST]`.
3. Isi nama paket, lalu mulai. Main membuat 30 request; service Python menghasilkan kandidat nyata.
4. Setelah selesai, periksa preview, validasi, lalu **Import sebagai DRAFT**.
5. Hasil tetap DRAFT. Ctrl+C menghentikan demo dan menghapus database sementara beserta hasilnya.

API, autentikasi fixture, penyimpanan gambar dan polling outbox memakai localhost. Demo tidak memakai Redis atau R2 bersama. Port 3100 menjaga aplikasi biasa pada port 3000 tetap terpisah. Masuk melalui URL `DEMO_READY` baru setelah setiap restart.

Pada aplikasi biasa, pesan `Content import and preview are disabled.` berarti `CONTENT_IMPORT_PREVIEW_ENABLED` belum `true` pada proses API. Ubah `.env` development lalu restart API. Flag ini hanya membuka preview/import; generator juga memerlukan runtime AI, role terbatas, context, config SEALED dan approval yang cocok. `pnpm dev:full` sendiri tidak menyiapkan semuanya.

## Persiapan sekali (Windows)

Gunakan Node 24, Corepack/pnpm 12.6 dan Python 3.11+. Clone kedua repository berdampingan:

```powershell
git clone https://github.com/ayiinee/Numora.git
git clone https://github.com/ShafwanAdhi/numora-ai-service.git
cd numora-ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ../Numora
corepack pnpm install --frozen-lockfile
# Jika binary PostgreSQL belum tersedia, arahkan ke instalasi lokal:
$env:POSTGRES_BIN = 'C:\Program Files\PostgreSQL\18\bin'
corepack pnpm --filter @tka/database build
corepack pnpm --filter @tka/assessment-engine build
corepack pnpm --filter @tka/irt-orchestration build
corepack pnpm --filter @tka/api build
```

Jika lokasi service berbeda, set `NUMORA_AI_SERVICE_PATH`. Launcher memakai `.venv` bila tersedia, atau `python` dari PATH; `PYTHON` dapat menentukan executable. Binary PostgreSQL dari `node_modules/@embedded-postgres/windows-x64/native/bin` terdeteksi otomatis jika paket sudah terpasang; `POSTGRES_BIN` mengesampingkannya. Linux/macOS memakai PostgreSQL lokal dengan `POSTGRES_BIN` menunjuk direktori `initdb` dan `pg_ctl`, serta `.venv/bin/python`.

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

Buka `http://localhost:3000/admin/login`, login dengan akun di atas, lalu Generator paket. Pilih Tryout 30 dan paket original lokal; selesai generate otomatis masuk ke Impor soal langkah 2, lalu validasi dan simpan DRAFT. Download JSON opsional. Endpoint lain tetap menuju API utama port 3001. Tutup frontend lain di port 3000 sebelum menjalankan perintah ini.

Tanpa `.env` tim, hapus `GENERATOR_REAL_QA_EMAIL` untuk demo terisolasi dengan login fixture yang dicetak launcher. Ini bukan akun Supabase asli. Untuk menguji paket dengan Python/service sebenarnya, jalankan launcher Python dengan `GENERATOR_PACKAGE_TEST=true` tanpa `GENERATOR_DEMO`; lihat laporan verifikasi `docs/testing/GENERATOR_V1_VERIFICATION_2026-10-07.md`.

## Verifikasi PR setelah merge main

API/web typecheck, root lint, 12 schema kontrak dan generated types check lolos. Regresi upload/preview/routing: 18 tes; generator/Drill Bab 3/PvP bank: 18 tes. Mapping/Excel importer: 23 tes lolos, satu integrasi database dilewati tanpa TEST_DATABASE_URL. Build serial seluruh 10 package lolos. Bukti connected generator desktop/mobile sebelum merge tercatat pada laporan generator. Launcher handoff baru telah diperiksa sintaksnya; setup dari clone bersih belum diuji otomatis.
