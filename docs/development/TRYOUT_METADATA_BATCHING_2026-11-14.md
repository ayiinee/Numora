# Tryout metadata batching and targeted monitoring reads

**ENGINEERING DECISION — 14 November 2026:** gabungkan pembacaan metadata
Tryout per halaman dan batasi lookup monitoring ke siswa yang diminta.
Optimasi ini mempertahankan kontrak API dan aturan assessment/otorisasi.
Dasar branch adalah `main` `7288b4b380ceb4c30800f670cd8e8949217a7109`;
PR upload #175/#176 dan learning reads #177 terpisah.

## Perubahan

- Daftar maksimal 20 paket memakai satu waktu halaman dan satu lookup paket
  aktif. Kolom paket dan attempt dibatasi ke kebutuhan metadata. Cursor tetap
  memakai pasangan `release_at,id`, termasuk kepemilikan paket arsip.
- Attempt diambil dalam satu round trip dengan `JOIN LATERAL`, mempertahankan
  predicate student/type/package dan `LIMIT 1` per paket. Tidak diasumsikan
  satu attempt per paket untuk seluruh histori managed batch, dan tidak
  ditambahkan aturan pemilihan attempt baru.
- Jumlah item dan kelayakan versi dihitung dalam satu agregasi per halaman.
  Left join mempertahankan jumlah package item walau versi tidak terlihat;
  validasi tetap membutuhkan 30 versi terlihat, seluruhnya READY. Guard
  curriculum approval, blueprint, frozen manifest, policy yang disetujui dan
  batas canonical PG tetap diperiksa. Policy unik dibaca sekali per halaman.
- Rilis hasil dibaca sekaligus hanya untuk paket dengan attempt GRADED. Hasil
  yang belum dirilis tetap disembunyikan. Jalur detail memakai formatter yang
  sama; pending reason `null` tetap berarti siap, bukan CONTENT_PENDING.
- Attempt IN_PROGRESS tetap melewati finalizer existing, dengan transaksi,
  deadline, locking dan XP idempotent yang sama. Attempt tersebut dibaca ulang
  dalam satu query sebelum DTO dibuat. Jumlah query finalisasi masih tergantung
  attempt aktif; pengukuran halaman di bawah tidak memasukkan finalisasi.
- Monitoring menjalankan seluruh pemeriksaan identitas, verifikasi guru,
  ownership kelas dan sekolah aktif sebelum lookup siswa. Query roster diberi
  filter student internal; endpoint roster penuh tetap mengembalikan semua
  anggota aktif. Progress memilih kolom yang dipakai DTO dan mempertahankan
  skor nol serta null.

Tidak ada migrasi, environment baru, perubahan interval worker/scheduler,
penambahan cache atau perubahan transaksi bisnis. Status personal, permission,
deadline dan rilis hasil selalu dibaca melalui guard existing.

## Pengukuran lokal

Suite membuat database/role runtime non-owner RLS khusus localhost, menerapkan
75 migrasi dan memakai fixture identitas. Fixture berisi 26 paket dengan metadata
import 4 KiB, 23 paket terlihat pada dua halaman, 30 item per paket normal,
paket kosong/tidak lengkap/revisi, policy invalid, approval invalid, histori
rilis IRT dan kelas berisi 200 siswa. Data ini bukan persetujuan akademik.

Proxy menghitung respons PostgreSQL DB ke API serta pesan Execute/Query sesudah
koneksi dihangatkan. Harness memakai satu koneksi agar startup/pool tambahan
tidak tercampur; konfigurasi pool runtime tidak berubah. Angka berikut mencakup
read service dengan identitas fixture, bukan request Auth/HTTP lengkap.

| Service/fixture                        |    Sebelum (`7288b4b3`) |               Sesudah |   Penurunan |
| -------------------------------------- | ----------------------: | --------------------: | ----------: |
| Halaman 20 paket Tryout                | 361.598 byte, 151 query | 19.988 byte, 11 query | 94,47% byte |
| Monitoring satu siswa dari 200 anggota |    14.970 byte, 8 query |   1.552 byte, 8 query | 89,63% byte |

Tiga tes perilaku baru juga lulus pada baseline. Tes batas query/payload sengaja
gagal pada baseline (151 query melampaui batas 16), kemudian seluruh empat tes
lulus setelah optimasi. Timestamp fixture dapat menyebabkan variasi byte kecil.

Regresi mencakup cursor tie/pagination, empty page, archive ownership, detail
parity, content/scoring pending, mixed question restrictions, rilis hasil,
start/resume, deadline otomatis, refresh status setelah finalisasi, jawaban
terlambat ditolak dan XP satu kali. Monitoring mencakup roster penuh, skor nol,
siswa bukan anggota, guru lain, guru belum terverifikasi, sekolah nonaktif,
kelas arsip, ban dan membership guru yang berakhir.

## Pengukuran Supabase cloud

[measure-tryout-metadata-reads.mjs](../../scripts/measure-tryout-metadata-reads.mjs)
memakai snapshot `REPEATABLE READ READ ONLY`, memeriksa mode read-only,
statement timeout 10 detik dan lock timeout 1 detik. Sampel kandidat dibatasi
20 paket dan estimasi transfer baseline 512 KiB per grup. Skrip mempertahankan
TLS DSN dan hanya mencetak agregat, tanpa ID, nama, jawaban atau connection URL.

| Konfigurasi                | Grup SQL                 | Sampel                      | Byte TLS sebelum → sesudah | Query  |
| -------------------------- | ------------------------ | --------------------------- | -------------------------: | ------ |
| Development/Staging `.env` | Attempt + jumlah item    | 7 kandidat paket, 3 attempt |              2.696 → 1.232 | 14 → 2 |
| Production `.env.prod`     | Attempt + jumlah item    | 7 kandidat paket, 1 attempt |              1.997 → 1.043 | 14 → 2 |
| Development/Staging `.env` | Lookup target monitoring | 34 anggota → 1 siswa        |                2.341 → 214 | 1 → 1  |
| Production `.env.prod`     | Lookup target monitoring | 1 anggota → 1 siswa         |                  209 → 213 | 1 → 1  |

Attempt terpilih, status, jumlah item dan identitas target sama sebelum/sesudah
pada setiap snapshot. Dengan satu anggota, projection roster tidak mengurangi
row; selisih empat byte merupakan overhead protokol. Pengurangan pada sampel
Tryout sekitar 54,3% Development/Staging dan 47,8% Production; lookup monitoring
Development/Staging sekitar 90,9%.

Grup cloud membandingkan SQL attempt/count dan roster yang berubah. Sampel
paket adalah kandidat berdasarkan type/purpose/status/waktu, bukan simulasi
visibility/routing endpoint; guard runtime, Auth, policy dan rilis hasil tidak
termasuk pengukuran ini. Agregasi sesudah menyertakan statistik versi READY dan
tipe soal, walau baseline yang diukur hanya attempt/count. Pengukuran ini tidak
mengekstrapolasi seluruh endpoint atau persentase billing Supabase.

**Jangan menjalankan `TryoutService.packages()` untuk benchmark cloud read-only.**
Endpoint tersebut dapat memfinalisasi attempt kedaluwarsa dan menulis XP/outbox.
Skrip pengukuran hanya menjalankan SQL baca. Tidak ada fixture, import, migrasi,
finalisasi atau perubahan data bisnis cloud dari pengukuran ini.

## Verifikasi dan reproduksi

24 tes pada enam file lulus tanpa skip, termasuk empat tes integrasi baru pada
database runtime terisolasi. ESLint/Prettier file terkait dan typecheck API lulus.
Build API diverifikasi sebelum PR. Tidak ada perubahan kontrak/schema.

Untuk lokal gunakan database test localhost yang sudah dimigrasikan,
`NODE_ENV=test`, `TEST_DATABASE_URL` dan kosongkan `DATABASE_URL` serta
`DATABASE_MIGRATION_URL`. Suite metadata membuat/menghapus database dan role
sendiri; suite existing memakai database test tersebut.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/learning/tryout-metadata.integration.spec.ts src/modules/learning/tryout.flow.integration.spec.ts src/modules/learning/pretest-tryout.integration.spec.ts src/modules/learning/tryout-partial-reward.integration.spec.ts src/modules/schools/teacher-flow.integration.spec.ts src/modules/classes/classes.service.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Untuk cloud pilih file secara eksplisit; `DATABASE_URL` dari shell jangan
menimpa file pilihan. Tidak ada file environment yang dimuat otomatis.

```powershell
node --env-file=.env scripts/measure-tryout-metadata-reads.mjs
node --env-file=.env.prod scripts/measure-tryout-metadata-reads.mjs
```

Sesudah review/merge serta restart/deploy API, bandingkan Usage pada jendela
trafik sebanding. Byte query dan benchmark lokal tidak menggantikan pengamatan
Usage Supabase; kuota yang sudah digunakan tetap tercatat pada billing cycle.
