# Galeri Konten & assessment

**ENGINEERING VERIFICATION - 27 Oktober 2026:** hasil audit Playwright memakai data sintetis lokal. Contoh soal mereproduksi bentuk masalah screenshot pemilik; persamaan, opsi dan kunci tetap mengikuti fixture, bukan bank Curriculum yang telah disahkan. Tidak ada data pengguna, signed URL atau kredensial cloud di galeri. Bukti frontend ini terpisah dari acceptance backend/cloud, CI dan rilis.

| Area                                        | Bukti                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bank soal Super Admin                       | [Desktop](super-bank-1440.png), [ponsel](super-bank-390.png)                                                             |
| Bank soal Content                           | [Tablet](content-bank-768.png)                                                                                           |
| Isi, kunci, pembahasan dan keputusan        | [Super desktop](super-review-1440.png), [Super ponsel](super-review-390.png), [Content desktop](content-review-1440.png) |
| Materi                                      | [Desktop](section-curriculum-1440.png), [ponsel](section-curriculum-390.png)                                             |
| Video                                       | [Desktop](section-videos-1440.png)                                                                                       |
| Paket & Pretest                             | [Desktop](section-directedPackages-1440.png)                                                                             |
| Draf Tryout                                 | [Desktop](section-packages-1440.png)                                                                                     |
| Paket Drill                                 | [Desktop](section-drillPackages-1440.png)                                                                                |
| Verifikasi & riwayat                        | [Desktop](section-verification-1440.png)                                                                                 |
| Laporan                                     | [Desktop](section-reports-1440.png), [320 px](section-reports-320.png)                                                   |
| Riwayat IRT                                 | [Desktop](section-irt-1440.png)                                                                                          |
| Audit                                       | [Desktop](section-audit-1440.png)                                                                                        |
| Editor dan kegagalan yang dapat dicoba lagi | [Desktop](editor-error-1440.png), [320 px](editor-error-320.png)                                                         |
| State daftar                                | [Memuat](bank-loading.png), [gagal](bank-error.png), [kosong](bank-empty.png)                                            |

Dialog editor sengaja berupa screenshot viewport: isi panjang dapat digulir, sementara header/aksi tutup tetap dapat diakses. Fokus pada pesan gagal terlihat setelah submit; draft dipertahankan. Galeri bukan bukti pengesahan jawaban akademik atau publikasi PGK.

[Audit, batas perubahan dan hasil verifikasi](../../ADMIN_ASSESSMENT_UX_2026-10-27.md).

Suite dapat dijalankan dari `apps/web` dengan `pnpm exec playwright test admin-assessment-ux.spec.ts admin-content-lifecycle.spec.ts`. Regresi lama ada pada skenario Content/workbench/pagination di `admin.spec.ts`. Lingkungan lokal audit memakai konfigurasi base yang sama dengan cache pada drive D; API/Auth diintersep fixture, bukan layanan cloud.
