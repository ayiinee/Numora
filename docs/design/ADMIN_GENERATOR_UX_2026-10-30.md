# Generator paket dan pencarian sekolah — 30 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik, 30 Oktober 2026:** lanjutkan urutan backlog setelah integrasi: sinkronisasi main, smoke Admin, UI-01, lalu audit dan implementasi UI-02. DRI: Ferdi. Branch: `feat/admin-generator-ux`. Baseline: `bf3d87bad7211151326d0a68b6add436dcd3bf87` (#100 sudah tercakup).

**Status:** implementasi lokal; review manusia dan CI branch belum tercatat. Bukti berikut memakai fixture sintetis di localhost, bukan penerimaan Development, kesiapan deployment, atau persetujuan akademik.

## Audit dan keputusan tampilan

Arah mengikuti [Akun Admin yang disetujui](ADMIN_ACCOUNTS_UX_2026-10-27.md): abu terang, permukaan putih, aksen ungu, Plus Jakarta Sans lokal, daftar tampil lebih awal dan dialog terfokus.

| Temuan baseline                                                                            | Perubahan                                                                                                               |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Padding reset Operations mengalahkan padding khusus pencarian; teks dimulai di dalam ikon. | Selector `#school-search` di dalam shell sekolah menjaga padding awal 38 px. Tidak mengubah reset global.               |
| Banner dan form Generator permanen mendorong riwayat ke bawah; judul Content tersembunyi.  | Frame management dengan judul terlihat, satu aksi Generate paket, dan direktori utama.                                  |
| Riwayat berupa kartu besar tanpa batas halaman; status memakai enum teknis.                | Tabel desktop dan baris mobile, lima paket per halaman, label status Indonesia, tanggal WIB.                            |
| Scope, jumlah sumber dan kelayakan sulit dipindai.                                         | Dialog pembuatan dengan label input, ringkasan jumlah dari katalog server dan alasan sumber tidak cukup.                |
| Proses aktif bercampur dengan konfigurasi.                                                 | Detail progres terpisah, kembali ke riwayat, status otomatis, retry pada paket yang sama dan UUID dalam disclosure.     |
| Audit pertama: dialog layar pendek dengan zoom 125% memotong tombol.                       | Isi dialog dapat digulir; judul dan footer tetap terjangkau. Retest mencakup scroll isi, Tab, Escape dan fokus kembali. |
| Polling berpotensi bertumpuk bila respons melebihi interval.                               | Poll berikutnya dijadwalkan setelah permintaan sebelumnya selesai; respons lama diabaikan setelah navigasi.             |

[Galeri sebelum/sesudah](screenshots/admin-generator/README.md) berisi data sintetis yang bisa dibaca reviewer di checkout lain.

## Batas fungsi yang dipertahankan

- NestJS tetap menentukan permission, sumber yang disetujui, scope, jumlah soal, eligibility dan status. DTO generated dan endpoint existing dipakai tanpa perubahan.
- Super Admin dan Content/Data/Moderation dapat mengakses Generator; Operations dan assignment null ditolak. Respons 401/403 tetap melalui workspace guard dan menghapus tampilan berizin.
- Katalog dimuat saat dialog dibuka. Kegagalan katalog terpisah dari kegagalan daftar, loading terpisah dari daftar kosong. `GENERATOR_DISABLED` memiliki penjelasan khusus.
- Submit eksplisit dengan kunci idempotensi existing; input dan kunci dipertahankan saat gagal untuk payload yang sama. Pending memblokir submit ganda dan penutupan dialog. Perubahan payload mengganti kunci.
- Riwayat API saat ini mengembalikan maksimal **50 paket terbaru**, tanpa total global. Pagination lokal menampilkan lima dari kumpulan yang dimuat dan menyebut **paket yang dimuat**. Tidak mengubah kontrak pagination #100 pada modul lain atau mengklaim seluruh riwayat tersedia.
- `?package=` menjaga identitas detail; `?offset=` menjaga halaman riwayat. Reload, Back dan kembali ke riwayat tidak membuat paket baru.
- Status READY/IMPORTED tetap membuka `/admin/content/imports?generatorPackage=…` pada langkah Preview & tujuan. Route detail hasil existing tetap didukung; tidak membuat direktori hasil kedua.
- Preview memakai pembaca soal existing: stem, seluruh opsi/pernyataan dan matematika sumber dipertahankan. Pengujian handoff memakai satu contoh PGK sintetis, bukan bank akademik lengkap.
- Generate menyimpan kandidat. DRAFT, review dan publikasi tetap melalui workflow impor existing. Tidak mengubah scoring, policy XP, versi historis, migrasi, flag layanan atau konfigurasi cloud.
- Impor soal secara menyeluruh tetap UI-03; Analytics dan Request IRT tetap UI-04/UI-05.

## Verifikasi

- Sebelum perubahan UI: **23/23 smoke browser lulus** pada baseline terbaru. Mencakup assignment Admin, kontrak pagination #100, akun, sekolah, Pengguna & kelas, bank soal, Pretest dan handoff impor yang relevan.
- Repro geometri pencarian sebelum perbaikan: Super Admin lulus, Operations gagal. Setelah perbaikan, kedua role lulus pada 320/390/768/1440 px, untuk placeholder dan input terisi; screenshot kedua role juga lulus.
- Putaran pertama Generator menemukan satu masalah visual (dialog pendek/zoom), serta locator tes yang perlu mengikuti loading label dan announcer Next. Setelah koreksi: **13/13 browser Generator lulus**. Audit kedua merapatkan metadata baris mobile.
- Pemeriksaan akhir developer: **31/31 tes browser lulus** — 15 Generator dan 16 sekolah. Mencakup geometri input, responsif kedua role, form gagal/pending, idempotensi create/retry, katalog kurang sumber, list/katalog gagal dan kosong, akses dicabut, role terlarang, polling lambat, respons terlambat, reload/pagination dan preview PGK lengkap.
- **410/410 tes unit web lulus** (57 berkas), lint repository tanpa warning, route typegen + TypeScript web lulus, serta build production web `next build --webpack` lulus. Node 24.22.1, pnpm 12.6.0, satu worker untuk pemeriksaan berat. Typecheck memanggil typegen/tsc langsung agar tidak menghapus tipe cache development yang sedang digunakan.
- Pada hasil build production lokal: **6/6 smoke browser lulus** — audit kedua role, submit dengan recovery/idempotensi, polling→impor dan geometri sekolah kedua role. Direktori/dialog pada 320 px juga diperiksa dengan axe untuk tag `wcag2a`, `wcag2aa`, `wcag21aa`: **0 pelanggaran pada area yang diperiksa**. Ini tidak menggantikan audit aksesibilitas manual seluruh produk.
- Semua pemeriksaan memakai layanan test localhost/fixture; tidak menjalankan migrasi atau mengubah cloud. CI branch dan review manusia masih menunggu publikasi/review, bukan dinyatakan lulus oleh tes lokal.

Untuk mengulang regresi tersimpan, jalankan dari `apps/web` dengan konfigurasi API/Supabase test sintetis seperti `playwright.config.ts`:

```sh
pnpm exec playwright test admin-generator-ux.spec.ts admin-schools-ux.spec.ts
pnpm exec vitest run --maxWorkers=1
```

Audit menggunakan output/cache build khusus ke drive D dan port 3300, terpisah dari development 3000/3001. Log produksi berada di subfolder `production-smoke`. Build sintetis bukan artefak untuk deploy ke layanan nyata.

Bukti mentah lokal: `D:/CodexCache/Numora-admin-generator-20261030/`, dipisah menjadi `baseline-smoke`, `search-before`, `search-after`, `round1`, `round2` dan `final`. Galeri tracked merangkum bukti visual; trace/JSON lengkap tidak dimasukkan ke Git.

## Handoff

**PROPOSED:** review UI-01/UI-02 pada branch ini, kemudian proses PR sesuai alur tim. Setelah review, lanjutkan audit UI-03. Persetujuan manusia, pemeriksaan CI branch baru, layanan nyata dan target/SHA deployment dicatat terpisah. Aini tetap pemilik integrasi/deployment; Farel tetap pemilik runtime/QA yang terbuka. Perubahan ini tidak menutup SIS-001 atau gate QA lain.
