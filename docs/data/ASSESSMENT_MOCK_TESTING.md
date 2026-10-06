# Mock Pretest dan Tryout untuk testing

**ENGINEERING DECISION — permintaan owner, 6 Oktober 2026:** gunakan soal sintetis berlabel DEMO untuk mencoba lifecycle Pretest dan Tryout sambil menunggu handoff akademik. Ini bukan bank atau blueprint yang disetujui Curriculum.

**PRD RULE:** Pretest 20 soal/bab, paling banyak sekali completed, tanpa XP; Tryout 30 soal dengan satu attempt/paket. Mock tidak mengubah aturan tersebut atau menghapus hasil lama.

**OPEN / ditunda owner:** blueprint/konten approved, rubrik numerik PGK, serta rumus dan validasi IRT/fallback. Kunci faktual soal mock tidak menjadi persetujuan rubrik skor parsial. Mixed Tryout DEMO menyimpan jawaban mentah dan dapat submit, tetapi hasil numerik/XP tetap belum tersedia. Tidak dibuat hasil IRT atau fallback palsu.

## Paket testing

| Paket                                    | Isi                                              | Akses Student                     |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------- |
| DEMO Pretest Bilangan                    | 20 PG                                            | Materi → bab Bilangan → Pretest   |
| DEMO Pretest Persamaan & Fungsi Kuadrat  | 20 PG                                            | Materi → bab Aljabar → Pretest    |
| DEMO Pretest Pythagoras & Geometri Ruang | 20 PG                                            | Materi → bab Geometri → Pretest   |
| DEMO Pretest Statistika & Peluang        | 20 PG                                            | Materi → bab Statistika → Pretest |
| DEMO Mock Tryout 5 Oktober 2026          | 10 PG, 10 multi-jawaban, 10 kategori Benar/Salah | Tryout → Ongoing                  |

Total **110 soal**, lengkap dengan pilihan/pernyataan, kunci dan pembahasan. Posisi jawaban benar bervariasi. Distribusi topik/difficulty mock dibuat untuk menguji UI dan transport, bukan kalibrasi atau blueprint akademik. Metadata review READY hanya untuk fixture DEMO; tidak menandakan approval Curriculum.

Tryout minggu ini dibuka Senin **5 Oktober 00:00 WIB**, ditutup Minggu **11 Oktober 23:59:00 WIB**. Timer 10 menit dibatasi batch close. Pretest tanpa timeout. Skip, save/resume, satu sesi aktif, additive placement dan batas completed mengikuti lifecycle yang sudah diimplementasikan.

File kunci untuk QA: [assessment-mocks-v1.json](../../packages/database/seeds/assessment-mocks-v1.json). File ini hanya di tooling database; tidak diimpor ke bundle frontend atau dipakai untuk membuka pembahasan sebelum release.

## Seed ulang

Seed khusus ini hanya menerima Supabase development sandbox `pkamenfnwmoeisccnrnk` dengan koneksi owner TLS direct/session, atau localhost dengan `NODE_ENV=test`. Guard seed lokal lama `db:seed:lifecycle` tetap berlaku.

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_DEMO_SEED = 'true'
pnpm exec dotenv -e .env -- pnpm --filter @tka/database db:seed:assessments:mock
```

Gunakan file env operator yang sesuai; CLI mengutamakan `DATABASE_MIGRATION_URL` bila tersedia. Tidak menulis/mengubah file env. Seed membutuhkan empat bab DEMO READY yang sudah ada, competency READY dan Admin aktif dengan subrole Content/Data/Moderation atau Super Admin. Tidak membuat akun, mengubah subrole, atau menambahkan taxonomy akademik.

Seed bersifat aditif, transaksional dan menggunakan UUID stabil serta advisory lock. Ulang pada minggu yang sama menghasilkan paket/item yang sama. Minggu berikutnya membuat paket Tryout baru dengan pin versi soal yang sama; Pretest tetap sama. Paket Tryout mingguan lain tidak diganti. Perubahan fixture harus menaikkan namespace/versi; drift menyebabkan rollback, bukan overwrite. `maxPoints=1` adalah placeholder wajib schema; PGK DEMO tidak dinilai menggunakan placeholder ini dan tidak mempunyai rubrik numerik.

Jika Student sudah completed Pretest, seed tidak mereset kesempatan tersebut. Jika sudah submit Tryout minggu ini, tetap satu attempt. Gunakan akun testing lain yang tersedia untuk start baru; save/resume tetap menggunakan akun dan attempt yang sama.

## Verifikasi

Rehearsal dilakukan pada restore database Cloud lokal PostgreSQL 17: 110 soal lolos decoder backend, lima paket lolos `package_can_distribute`, seed ulang idempotent, dan fingerprint seluruh 111 tabel yang sudah ada tetap sama setelah mengecualikan baris mock baru. Journal migrasi tidak berubah. Unit test meliputi jumlah/format, kunci aritmetika, format jawaban PGK, artifact, UUID/jadwal WIB dan penolakan target yang tidak diizinkan.

**Cloud — 6 Oktober 2026:** lima paket dan 110 soal berhasil ditambahkan ke Supabase development sandbox. Seluruh 146 tabel existing mempertahankan fingerprint baris lama setelah mengecualikan fixture baru; journal migrasi tidak berubah. Seluruh soal Cloud lolos decoder backend dan paket lolos distribution gate. Seed dijalankan dua kali dengan hasil identik tanpa duplikasi. Evidence privat agregat berada di `.tmp/pretest-mock-20261006/cloud-after.json`.

Tidak ada perubahan schema atau deployment hosting dalam pekerjaan mock ini. API/UI lifecycle di workspace menggunakan data Cloud melalui backend NestJS.
