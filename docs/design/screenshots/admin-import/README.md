# Galeri UI-03 — Impor soal

Bukti developer sintetis localhost pada 30 Oktober 2026. Baseline `97a0733`; branch implementasi `feat/admin-import-ux`. [Laporan dan batas pengujian](../../ADMIN_IMPORT_UX_2026-10-30.md).

| Area                  | Sebelum                                                                  | Sesudah                                            |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| Upload Excel, desktop | [Frame lama](before-excel-source-1440.png)                               | [Layout management](excel-source-1440.png)         |
| Preview, mobile       | [Tabel yang membutuhkan scroll horizontal](before-excel-preview-390.png) | [Contoh soal terbaca lengkap](question-390.png)    |
| JSON, mobile          | [Banner dan urutan lama](before-json-source-390.png)                     | [Navigasi dan konteks sumber](json-source-390.png) |

- [Riwayat mobile](upload-history-390.png): daftar lima per halaman, metadata berlabel dan filter yang dibuka saat diperlukan.
- [Preview soal desktop](question-1440.png): seluruh opsi, kunci, status dan disclosure sumber.
- [Pemetaan](mapping-390.png) dan [pemeriksaan DRAFT/konfirmasi Publish](draft-publish-390.png) memakai keputusan server existing.

Data/jumlah contoh antar-screenshot dapat berbeda. Semua merupakan fixture TEST ONLY, bukan workbook akademik yang disahkan. Capture full-page membuat topbar statis dan capture soal terpisah menyembunyikannya agar isi tidak tertutup chrome pada gambar panjang. Seluruh screenshot dan hasil tes bukan bukti layanan cloud, parsing workbook nyata atau deployment.
