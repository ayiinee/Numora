# Bukti pengujian penyesuaian data PRD v0.6 — 5 Oktober 2026

**ENGINEERING IMPLEMENTATION:** branch `feat/data-prd-v06-alignment`, baseline `d81c098`. Cakupan dan keputusan ada pada [data alignment](../data/PRD_V06_DATA_ALIGNMENT.md). XP Tryout memakai benar ekuivalen ×10 sesuai klarifikasi Reyhan; sumber PRD dan hasil historis tidak ditulis ulang.

## Hasil

| Pemeriksaan                         | Hasil                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Database, PostgreSQL 17             | 25/25, 11 file, tanpa skip                                                                 |
| API, HTTP + PostgreSQL              | 138/138, 33 file, tanpa skip                                                               |
| Worker, PostgreSQL + Redis 7        | 15/15, 6 file, tanpa skip                                                                  |
| Web, unit/component                 | 188/188, 26 file, tanpa skip                                                               |
| Assessment engine                   | 3/3, formula XP, batas dan input invalid                                                   |
| IRT orchestration                   | 2/2, tanpa skip                                                                            |
| Script checks                       | 57/57, tanpa skip                                                                          |
| SQL PGlite, fresh + upgrade fixture | 2/2, tanpa skip                                                                            |
| Lint                                | ESLint workspace lulus tanpa warning                                                       |
| Kontrak                             | Delapan JSON Schema valid; OpenAPI dan tipe web dihasilkan ulang dan freshness check lulus |
| Typecheck                           | API, worker, database, assessment engine, IRT orchestration, UI dan web lulus              |
| Build                               | Database, assessment engine, IRT orchestration, API, worker dan web (Webpack) lulus        |

Total tes paket adalah **371**, ditambah **59** script/SQL checks. Tes memakai PostgreSQL 17 dan Redis 7 terisolasi di localhost; tidak menggunakan koneksi Cloud, akun nyata, atau credential R2. Dua akun Auth pada fixture hanya menguji preservasi data dummy, bukan asumsi jumlah akun proyek.

## Regresi yang dibuktikan

- Migrator resmi menjalankan rantai 0000–0024 pada database kosong. Replay mempertahankan isi/hash journal tanpa apply kedua kali. Unique index referensi dibuat sebelum composite foreign key terbaru.
- Pada PostgreSQL nyata, dua transaksi join dari empat kelas aktif menghasilkan satu sukses dan satu `CLASS_LIMIT_REACHED`; total tetap lima. Duplicate membership dan rejoin ketika diban ditolak oleh database.
- Leave/ban/unban mempertahankan histori; siswa dapat join ulang sesudah unban. Guru keluar dari sekolah melepas kepemilikan, dan takeover memerlukan verifikasi sekolah yang sama serta kelas tanpa guru aktif.
- API memisahkan capability Operations, Content/Data/Moderation dan Super Admin. Role null tidak memperoleh capability. Audit umum tidak diberikan kepada Content Admin.
- Submit Drill memperbarui bintang terbaru, mempertahankan best score/unlock, dan menulis satu ledger XP. Submit Tryout policy baru menulis XP sebelum release IRT; submit berulang tidak memberi XP kedua kali.
- Proyeksi aktivitas memakai XP akun untuk kelas aktif dan global. Ledger XP runtime bersifat append-only, termasuk nilai pecahan.
- Upgrade fixture mempertahankan Auth, jawaban/hasil attempt, policy lama dan ledger lama. Seed demo v0.6 memakai ID deterministik, satu paket berisi sepuluh butir dan policy baru; replay tidak mengubah pin policy paket lama.
- Tabel ban/global aktivitas memakai RLS dan privilege runtime yang eksplisit; Data API tidak mendapatkan akses ke tabel baru.

## Reproduksi

Gunakan instalasi dependency workspace biasa, Node 24 dan pnpm 12 sesuai lockfile. Siapkan PostgreSQL/Redis **khusus test di localhost** dengan database bernama mengandung `test`. Jangan arahkan variabel test ke Cloud. Runner integrated migration dan fixture Supabase test memerlukan role `anon`, `authenticated`, dan `service_role` pada instance terisolasi.

```powershell
$env:NODE_ENV = 'test'
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55435/numora_test_prd_v06?sslmode=disable'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:DATABASE_MIGRATION_URL = $env:TEST_DATABASE_URL
$env:TEST_REDIS_URL = 'redis://127.0.0.1:56385'

corepack pnpm --filter @tka/database db:migrate
corepack pnpm --filter @tka/database test
corepack pnpm --filter @tka/assessment-engine test
corepack pnpm --filter @tka/irt-orchestration test
corepack pnpm --filter @tka/api test
corepack pnpm --filter @tka/worker test
corepack pnpm --filter @tka/web test
corepack pnpm test:checks
corepack pnpm contracts:validate
corepack pnpm contracts:types:check
corepack pnpm lint
corepack pnpm typecheck
```

URL dan port di contoh hanya menunjuk fixture localhost sementara. Kredensial trust PostgreSQL pada fixture ini tidak menjadi konfigurasi deployment. Periksa guard environment dan sesuaikan koneksi test milik operator sebelum menjalankan.

Uji tambahan `corepack pnpm test:prd-v06` memerlukan `CURRICULUM_TEST_PGLITE_MODULE` yang menunjuk file entry PGlite terpasang di luar repo. Tanpa variabel tersebut dua tes tambahan akan skip. Suite database PostgreSQL di atas tetap menjalankan regresi migrasi/race/seed dan tidak bergantung pada PGlite.

## Batas bukti dan Cloud

Build web menggunakan `next build --webpack`. Turbopack menolak junction `node_modules` worktree yang mengarah ke checkout lain di luar root proyek. Ini batas environment pengujian ini; konfigurasi build dan dependency manifest tidak diubah. Build default Turbopack tetap perlu diperiksa oleh CI pada instalasi dependency normal. Web typecheck juga dijalankan tanpa cache incremental setelah cache awal memberikan diagnosis lama.

Hash SHA-256 SQL 0024 pada pengujian ini: `ac3eb1f3de3f71e34b06ad3930a6450e633198b8386ab24b58a5e94301bbea71`. Migrasi 0000–0023 tidak diubah.

Supabase Cloud belum menerima 0024. Audit baca menunjukkan jurnal terakhir 0023 dan 128 akun Auth; semuanya harus dipertahankan. Permintaan admin sebelumnya mensyaratkan backup yang berhasil diuji restore sebelum perubahan Staging. [Bukti restore lama](CONTENT_IMPORT_PREVIEW_ACCEPTANCE_2026-10-04.md) bukan bukti upgrade 0024 atas snapshot Cloud terbaru; arsip backup privat itu tidak tersedia pada host pekerjaan ini.

Pengujian ini menggunakan data dummy. Restore snapshot Cloud terbaru, CI branch/PR, browser/E2E alur baru, UI aksi kelas, bank Curriculum/rubrik PGK, runtime Pretest, acceptance IRT dan R2 tetap perlu diselesaikan sesuai [rollout](../data/PRD_V06_DATA_ALIGNMENT.md). Tidak ada klaim seluruh acceptance aplikasi v0.6 sudah selesai.
