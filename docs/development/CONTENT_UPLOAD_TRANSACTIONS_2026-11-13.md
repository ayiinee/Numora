# Content upload transaction optimization

**ENGINEERING DECISION — 13 November 2026:** tahap pertama optimasi DB
mengikuti prioritas pemilik. Perilaku produk, otorisasi Admin, kontrak HTTP,
schema, histori dan aturan publikasi tetap mengikuti sumber aktif.

## Perubahan

- `ContentService.curriculum(tx)` memakai koneksi transaksi pemanggil pada
  validasi preview dan penyimpanan draft. Pemanggil di luar transaksi tetap
  menggunakan pool biasa.
- Validasi menambah satu lookup legacy berdasarkan ID dan expected revision.
  Hanya preview lama dengan sumber workbook dan tanpa `intakeVersion` yang
  dikembalikan untuk pemulihan. JSON preview modern tidak dikirim dua kali.
  Pembacaan R2 dan parsing workbook berlangsung sebelum transaksi mutasi.
- Setelah persiapan, lock upload dan paket tetap diambil. Revision upload,
  checksum/object key/preview sumber serta status dan content revision paket
  diperiksa kembali. Error R2 tidak menyimpan hasil persiapan parsial.
- Import konten, paket, revision upload dan audit tetap memakai satu transaksi.
  Replay idempotency key tetap diperiksa sebelum validasi revision penyimpanan.

Tidak diperlukan migrasi, perubahan environment, atau regenerasi kontrak.
Lookup tambahan pada validasi adalah tradeoff eksplisit. PR ini tidak
mengklaim penurunan byte Supabase atau memperluas cache.

## Pengukuran runtime

Event debug `content_upload_transaction` hanya memuat:

| Field           | Arti                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `operation`     | `validate` atau `save`                                                                                                                           |
| `outcome`       | `success` setelah commit atau `error` setelah kegagalan                                                                                          |
| `acquireMs`     | Waktu dari permintaan transaksi sampai callback dimulai, termasuk antrean koneksi dan round trip BEGIN                                           |
| `transactionMs` | Waktu dari callback dimulai sampai commit/rollback selesai, termasuk query dan waktu tunggu lock di dalamnya; `null` bila callback tidak dimulai |

Event tidak memuat ID pengguna, nama file, isi soal, SQL, token atau pesan
exception. Emisinya mengikuti level debug logger yang sudah ada. Kegagalan
persiapan R2 terjadi sebelum transaksi, sehingga tidak menghasilkan event
transaksi. Ini log durasi, bukan metrik byte, lock wait murni atau dashboard
global. Pengukuran byte/query per endpoint merupakan tahap lanjutan backlog.

## Pengujian lokal

Harness memakai PostgreSQL localhost khusus, database dan login runtime yang
dibuat per run, HTTP NestJS nyata dan fixture R2 dalam memori. Runtime memakai
role non-owner dengan RLS; provider identitas adalah fixture. Tidak ada akses
Supabase atau R2 cloud. Database dan role run dibersihkan oleh suite.

Kasus baru menguji:

1. Receive, validate dan save dengan `DB_POOL_MAX=1`.
2. Rollback setelah import selesai menulis, termasuk paket, identitas impor
   dan revision upload, kemudian retry key yang sama.
3. Dua save bersamaan dengan key yang sama menghasilkan satu import, paket
   dan audit; request preview dengan revision lama ditolak.
4. Workbook legacy ditahan di fixture R2 sementara koneksi lain mengambil
   `FOR UPDATE` pada upload dengan `lock_timeout=300ms`.
5. Perubahan revision, perubahan preview sumber tanpa bump revision,
   pengarsipan paket selama persiapan, serta kegagalan R2 tidak menimpa data.
6. Isi event pengukuran hanya field yang diizinkan, termasuk outcome error.

Pembanding memakai dua file service dari `main` commit `f649fe16` dengan tes
lock probe yang sama. Pemeriksaan pool satu koneksi dijalankan pada implementasi
baru. Hasil lock probe bukan benchmark throughput, SLO produksi atau angka
Usage Supabase. `probeMs` mengukur seluruh transaksi probe koneksi kedua;
`durationMs` mengukur request fixture yang mencakup gate R2.

Pengukuran lokal pada 13 November 2026, Node 24.19.0 dan PostgreSQL 16.15:

| Implementasi, kasus tanpa perubahan bersamaan | Probe mengambil lock saat R2 ditahan                 | `probeMs` |
| --------------------------------------------- | ---------------------------------------------------- | --------- |
| `main` `f649fe16`                             | Gagal dengan `55P03`, batas tunggu 300 ms terlampaui | 349       |
| Perbaikan                                     | Berhasil                                             | 3         |

Tes pembanding sengaja gagal pada assertion `blocked=false`, sehingga
mereproduksi masalah pada baseline. Sesudah mengembalikan implementasi baru,
seluruh **28 tes** file import/preview lulus tanpa skip. Lima probe baru
tidak terblokir; seluruh transaksi probe membutuhkan 2–27 ms pada run tersebut.
Perbedaan waktu request keseluruhan tidak dipakai sebagai persentase
penghematan karena parsing, I/O lokal dan beban mesin ikut memengaruhinya.

Pemeriksaan ESLint dan Prettier untuk file yang berubah, typecheck API dan
build API lulus. Pemeriksaan seluruh workspace tetap dijalankan oleh CI PR.

## Reproduksi

Siapkan `TEST_DATABASE_URL` ke PostgreSQL localhost test yang mengizinkan
pembuatan database dan role sementara. Kosongkan `DATABASE_URL` dan
`DATABASE_MIGRATION_URL` dari shell; suite mengatur koneksi runtime sendiri.
Gunakan `NODE_ENV=test`. Jangan memuat `.env` Development.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/content/content-preview.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
pnpm exec eslint apps/api/src/modules/content/content.service.ts apps/api/src/modules/content/content-uploads.service.ts apps/api/src/modules/content/content-preview.integration.spec.ts --max-warnings=0
```

Sebelum merge, reviewer memeriksa bahwa pemulihan sumber hanya terjadi sebelum
transaksi, revision diperiksa kembali setelah lock dan seluruh write beserta
audit memakai `tx` yang sama. Sesudah deploy dan restart API, amati log durasi
sesuai level logger yang dipakai.
