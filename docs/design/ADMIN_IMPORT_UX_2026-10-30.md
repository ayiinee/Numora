# Impor soal — UI-03, 30 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik, 30 Oktober 2026:** lanjutkan implementasi UI-03 sekarang tanpa menunggu review UI-01/UI-02. Pekerjaan dipisah pada branch `feat/admin-import-ux`, berbasis `97a0733` (PR #113). Instruksi ini menggantikan urutan menunggu review pada audit awal. PR #113 tetap fokus pada Generator dan pencarian sekolah.

**Status:** implementasi lokal untuk review. Aturan produk mengikuti PRD/API; bukti developer lokal tidak sama dengan penerimaan akademik, QA layanan nyata, CI branch baru atau deployment.

## Audit dan hasil desain

Arah mengikuti [fondasi Akun Admin yang disetujui](ADMIN_ACCOUNTS_UX_2026-10-27.md): kanvas #f7f8fa, putih, ungu #722cce, teks #27313f / #626d7c, Plus Jakarta Sans lokal, hierarki 28/36, 18/26, 14/22, metadata 12/18. [Galeri sebelum/sesudah](screenshots/admin-import/README.md).

| Temuan baseline                                                              | Hasil implementasi                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excel, JSON dan hasil Generator berbeda heading, frame dan warna.            | Ketiga jalur memakai management frame dan navigasi impor bersama; warna biru lokal Excel dikembalikan ke token Admin.                                                           |
| Tabel preview mobile mengharuskan scroll horizontal untuk membaca soal/aksi. | Preview menjadi baris soal responsif dengan stem, seluruh opsi/pernyataan, kunci dan status terbaca. Materi/provenance dapat dibuka. Tidak mengubah teks matematika atau kunci. |
| Pilihan paket JSON dan petunjuk panjang mendominasi sebelum tugas file.      | Langkah diringkas, paket tujuan dibuka saat diperlukan dan menutup setelah dipilih; jalur DRAFT/preview tetap dijelaskan.                                                       |
| Reload dari riwayat kembali ke Upload Excel.                                 | Tab, pencarian, jenis, status dan offset riwayat disimpan di URL; reload dan Back menjaga konteks.                                                                              |
| Filter riwayat permanen mendorong daftar ke bawah pada mobile.               | Filter dibuka saat diperlukan dan tetap terbuka ketika aktif; tabel berubah menjadi baris berlabel di layar sempit.                                                             |
| Perpindahan sumber berisiko meninggalkan preview yang belum disimpan.        | Dialog memberi pilihan kembali mengedit atau meninggalkan perubahan. Pindah tab Excel/riwayat tetap menjaga draft lokal.                                                        |
| Audit implementasi menemukan lebar minimum 260 px dari CSS tabel lama.       | Selector scoped memperbaiki minimum kolom pada 320 px. CSS consumer lain tidak direset global.                                                                                  |

## Kontrak dan batas fungsi

- NestJS tetap memegang permission, master materi, versi, validasi, penyimpanan, review dan publikasi. DTO generated, endpoint dan skema tidak berubah.
- Excel tetap upload, preview/tujuan, pemetaan/validasi, DRAFT dan satu konfirmasi Publish. Kegagalan 409 tidak memuat ulang atau menimpa koreksi lokal; retry DRAFT mempertahankan body/key existing.
- JSON kanonis tetap impor DRAFT dan preview tanpa nilai. Tidak ditambahkan Publish, scoring, XP atau kewajiban upload Excel pada jalur ini.
- Generator tetap masuk melalui `generatorPackage`, preview/validasi dan workflow DRAFT/Publish existing. Hasil generator bukan publikasi otomatis.
- Seluruh pilihan/pernyataan, label kategori, matematika, gambar yang tersedia dan provenance tetap dibaca dari sumber. Metadata dapat dibuka; error/validasi penting tetap terlihat.
- Riwayat tetap memakai pagination server lima item, total dari server, serta filter existing. UUID sesi di URL bukan credential; token tidak ditambahkan ke URL/storage.
- Respons detail lama diabaikan setelah navigasi. Loading detail memiliki retry tersendiri; error riwayat dibedakan dari daftar kosong. 401/403 tetap membuang workspace berizin melalui guard existing.
- Komponen paket hanya mendapat opsi presentasi embedded untuk menghindari kartu bertingkat. Consumer lain mempertahankan default.
- Tidak mengubah migrasi, policy/result/XP historis, rubrik PGK, keputusan ilmiah, flag lingkungan atau data cloud.

## Verifikasi dan loop audit

- Audit baseline: dua role, lima keadaan × tiga lebar (30 screenshot) pada build sebelumnya; probe mengonfirmasi kehilangan tab saat reload. Artefak lokal `D:/CodexCache/Numora-admin-generator-20261030/ui03-audit*`.
- Putaran pertama: 10/12 browser UI-03 lulus; dua audit visual menemukan overflow 320 px. Tes unit terkait: 26/27 lulus; satu locator diperbarui mengikuti nama aksi riwayat yang kini menyebut file.
- Putaran berikutnya mengaudit screenshot, mengoreksi minimum kolom, mengembalikan aksen ungu, merapikan metadata/filter dan menguji ulang sumber yang terdampak. Kegagalan/trace dipertahankan dalam cache audit.
- Pemeriksaan browser pada build production: **17/17 lulus** — 13 UI-03 ditambah regresi Generator→impor, namespace JSON/preview tanpa nilai, blocker review Pretest dan penyimpanan PGK Student. Mencakup 320/390/768/1024/1440 px, keyboard, editor dan dialog pada 390×568/zoom 125%, 409, retry/idempotensi DRAFT, konfirmasi Publish, akses, histori dan respons terlambat. Axe pada entry Excel/preview kedua role dengan tag WCAG A/AA yang diperiksa: **0 pelanggaran**; bukan audit seluruh produk.
- Run unit web penuh: **409/410 lulus** pada 57 berkas. Satu kegagalan mengungkap sesi dengan ID sama tidak dimuat ulang dari riwayat. Setelah perbaikan, seluruh **8/8 tes modul impor lulus** pada retest; Pada penyempurnaan disclosure paket JSON, kedua modul Excel/JSON juga diulang: **24/24 tes lulus** (`final-unit-retest.log`). Berkas unit lain tidak berubah. Kegagalan awal dipertahankan di `web-unit.log`, retest di `upload-retest.log`.
- **Lint repository tanpa warning, typegen + TypeScript web, build production web `next build --webpack`, format berkas berubah dan `git diff --check` lulus.** Node 24.22.1 / pnpm 12.6.0, cache dan server test terpisah dari development.
- Putaran browser terakhir sebelum build memiliki satu locator editor yang terlalu ketat terhadap implicit label textarea; locator diperbaiki ke role/nama textbox yang terlihat pada accessibility snapshot. Retest editor lulus, kemudian 17 kasus production lulus bersama. Assertion tidak dilemahkan.
- Pemeriksaan ini memakai fixture localhost. Rencana partisi browser memuat 349 kasus (175/174), tanpa kasus hilang/duplikat; ini pemeriksaan katalog, bukan klaim 349 eksekusi. CI branch UI-03, review manusia, parser/workbook nyata, R2 dan deployment belum dinyatakan lulus oleh hasil ini.

Tes tersimpan: `admin-import-ux.spec.ts` dan fixture sintetis `admin-import.ts`, ditambah regresi JSON namespace/detail tertunda, Generator, publisher serta unit importer/preview/paket existing. Workbook pada tes browser merupakan respons mock; tidak diklaim sebagai pengujian parser Excel nyata, unggah R2 atau persetujuan Curriculum.

Bukti mentah tetap ignored di `D:/CodexCache/Numora-admin-import-20261030/` serta fase `ui03-*` pada cache Generator. Galeri tracked berisi pilihan screenshot sintetis tanpa akun, token atau soal produksi.

## Review dan langkah berikutnya

**PROPOSED:** review UI-03 terpisah dari PR #113. Jika #113 belum masuk main, bandingkan UI-03 terhadap `feat/admin-generator-ux`; setelah fondasi disepakati, sesuaikan base tanpa mencampur perubahan. CI, approval manusia, layanan Development dan deployment dicatat terpisah. UI-04 Analytics dan UI-05 IRT belum termasuk implementasi ini.
