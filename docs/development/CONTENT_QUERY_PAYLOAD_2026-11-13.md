# Content query payload optimization

**ENGINEERING DECISION — 13 November 2026:** tahap berikutnya optimasi DB
mengurangi payload daftar upload dan hasil insert import. Scope ini merupakan
bagian dari prioritas pengurangan payload query; optimasi count/progress,
batch Tryout dan cache curriculum tetap pekerjaan terpisah.

## Perubahan dan kontrak

- Daftar upload memilih tujuh kolom dasar dan scalar metadata yang dibutuhkan
  DTO. PostgreSQL menghitung panjang `selectedIds`, item laporan dan isu parsing,
  lalu mengekstrak judul/jenis tujuan, jumlah masalah dan status laporan.
  Seluruh JSON preview, laporan, provenance dan isi soal tidak dikirim untuk
  membentuk ringkasan. Pembacaan detail tetap mengambil konten yang diperlukan.
- Formatter ringkasan dipakai bersama oleh list dan detail. Nilai nol pada
  `selectedIds` tidak jatuh ke jumlah item laporan. SQL NULL/JSON null, error,
  prioritas pesan validasi dan override judul/jenis/status dari paket diuji.
- Filter, total, pagination, otorisasi Admin dan feature flag tetap berlaku.
- Insert question, variant, import identity dan question version memakai
  `RETURNING id`. Isi stem, pilihan, kunci, pembahasan, media dan provenance
  tetap disimpan penuh. Transaksi, lineage, idempotensi dan audit dipertahankan.

Tidak ada perubahan schema, migrasi, kontrak HTTP atau environment runtime.
Branch berangkat dari `main` `7288b4b3`; perubahan batas transaksi upload
di PR #175 merupakan perubahan terpisah.

## Pengukuran lokal

Baseline memakai dua file service dari `7288b4b3`. Implementasi baru diuji
dengan skenario fixture yang sama di database localhost terisolasi, melalui
role runtime non-owner dan HTTP NestJS. Fixture memakai soal/provenance besar
agar pengambilan JSON berlebih terdeteksi. Proxy TCP menghitung byte respons
PostgreSQL ke API, tidak termasuk koneksi/autentikasi awal.

| Skenario              |        Sebelum |    Sesudah | Penurunan pada fixture |
| --------------------- | -------------: | ---------: | ---------------------: |
| List 20 upload        | 3.358.724 byte | 5.020 byte |                 99,85% |
| Import satu soal baru |   116.152 byte | 2.922 byte |                 97,48% |

Tes pembanding sengaja gagal pada batas payload di baseline. Pada implementasi
baru, seluruh **28 tes import/preview lulus tanpa skip**. Tes mencakup format
PG/PGK, revisi, rollback, replay/konkurensi, media, otorisasi dan data historis.
Fixture baru memeriksa kesamaan ringkasan/filter/pagination serta isi soal yang
disimpan. Hasil import pada run suite lengkap adalah 2.903 byte; metadata
curriculum fixture dapat berubah oleh tes sebelumnya. Angka lokal bukan SLO
atau proyeksi persentase Usage produksi.

## Pengukuran Supabase cloud

Skrip [measure-content-upload-payload.mjs](../../scripts/measure-content-upload-payload.mjs)
menjalankan query ekuivalen proyeksi list lama/baru beserta count pada baris
yang sama dalam satu transaksi `REPEATABLE READ READ ONLY`. Mode read-only
diperiksa sebelum query data. Batas statement 10 detik dan lock 1 detik.
Skrip membandingkan seluruh field ringkasan dan total di memori tanpa mencetak
baris, ID, nama, isi soal, URL atau kredensial.

Pemilihan sampel memeriksa maksimal 20 upload terbaru. Estimasi ukuran row
dihitung di server; sampel berhenti sebelum estimasi kumulatif melebihi
512 KiB. Bila row pertama terlalu besar, skrip mengembalikan status khusus
tanpa mengunduh payloadnya. Data kosong tidak dianggap bukti penghematan.

Pengukuran 13 November 2026 memakai konfigurasi cloud yang tersedia:

| Konfigurasi                  | Sampel                                    |          Sebelum |        Sesudah | Kesamaan ringkasan |
| ---------------------------- | ----------------------------------------- | ---------------: | -------------: | ------------------ |
| Development/Staging (`.env`) | 6 dari 20 kandidat, estimasi 472.001 byte | 473.245 byte TLS | 2.126 byte TLS | Sama               |
| Production (`.env.prod`)     | Tabel upload kosong                       |   Tidak tersedia | Tidak tersedia | Tidak ada sampel   |

Pada sampel Development/Staging, transfer kedua query turun **99,55%**;
jumlah query tetap dua. Durasi teramati 738 ms sebelum dan 289 ms sesudah,
tetapi ini satu run berurutan yang dipengaruhi cache dan jaringan. Angka
tersebut tidak menetapkan SLO atau besarnya perbaikan latency produksi.

Byte cloud dihitung di proxy TCP sebelum dekripsi sehingga mencakup overhead
TLS. Counter dimulai setelah koneksi, persiapan sampel dan BEGIN. Ini pengukuran
transfer query ekuivalen, bukan hasil rollout endpoint atau angka billing
Supabase. Tidak ada fixture, import, migrasi, publikasi atau data bisnis yang
ditulis ke cloud. Pengukuran write/import tetap dilakukan di localhost.

## Reproduksi dan rollout

Pilih environment secara eksplisit. Skrip tidak memuat `.env` secara otomatis,
tidak memakai `DATABASE_MIGRATION_URL`, dan hanya menerima DSN Supabase dengan
TLS `require`/`verify-full`. Pertahankan pengaturan TLS DSN yang tersedia.
Pastikan `DATABASE_URL` pada shell tidak menimpa file yang dipilih; Node
memprioritaskan environment shell. Jangan mencetak atau menyalin DSN.

```powershell
node --env-file=.env scripts/measure-content-upload-payload.mjs
node --env-file=.env.prod scripts/measure-content-upload-payload.mjs
```

Untuk integrasi lokal, gunakan `NODE_ENV=test` dan `TEST_DATABASE_URL` ke
PostgreSQL localhost khusus. Kosongkan `DATABASE_URL` dan
`DATABASE_MIGRATION_URL`; harness membuat database/role sementara sendiri.

```powershell
pnpm --filter @tka/api exec vitest run src/modules/content/content-preview.integration.spec.ts
pnpm --filter @tka/api typecheck
pnpm --filter @tka/api build
```

Sesudah review, merge dan restart/deploy API, bandingkan Usage Supabase pada
jendela trafik yang sebanding. Kuota yang sudah terpakai tidak berkurang
retroaktif. Pengukuran cloud di atas memvalidasi proyeksi query sebelum rollout;
aktivitas lain dalam proyek yang sama tetap tercampur pada Usage.
