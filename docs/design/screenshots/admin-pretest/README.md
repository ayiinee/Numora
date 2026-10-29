# Galeri Pretest Authoring

**ENGINEERING VERIFICATION - 27 Oktober 2026:** screenshot Playwright memakai data sintetis lokal. Paket, soal dan blueprint fixture bukan pengesahan Curriculum atau publikasi produksi. Tidak ada data pengguna, token atau signed URL cloud di artefak.

| Area                          | Bukti                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Direktori Super Admin         | [Desktop](super-directory-1440.png), [ponsel](super-directory-390.png)                                     |
| Direktori Content             | [Tablet](content-directory-768.png)                                                                        |
| Detail draf dan readiness     | [Desktop](super-detail-1440.png), [ponsel](super-detail-390.png)                                           |
| Editor informasi/pemilih soal | [Desktop](super-editor-1440.png), [320 px](super-editor-320.png), [Content 390 px](content-editor-390.png) |
| Paket sudah direview          | [Super desktop](super-reviewed-1440.png), [Content ponsel](content-reviewed-390.png)                       |
| Paket diarsipkan              | [Ponsel](super-archived-390.png)                                                                           |
| Pengelolaan susunan           | [Urutan dan pagination pilihan](selected-order.png)                                                        |
| Draft dan retry               | [Gagal simpan, isian tetap tersedia](edit-retry.png), [referensi gagal](reference-recovery.png)            |
| State direktori               | [Memuat](loading.png), [kosong](empty.png)                                                                 |

Editor mempunyai area gulir sendiri; header dan tombol simpan tidak ikut tergulir. Direktori, pemilih dan susunan masing-masing menampilkan lima data. Lima baris bukan batas jumlah pin: semua 20 ID/urutan tetap dikirim ke endpoint existing. Review editorial tidak otomatis menerbitkan paket.

[Audit, batas perubahan dan verifikasi](../../ADMIN_PRETEST_UX_2026-10-27.md).

Dari `apps/web`, jalankan `pnpm exec playwright test admin-pretest-ux.spec.ts admin-assessment-publisher.spec.ts`. Regresi bersama mencakup skenario `Admin five-row` dan `Upload-first PRETEST` dalam `admin.spec.ts`. Cache lokal audit diarahkan ke drive D dengan konfigurasi base yang sama; API/Auth diintersep fixture. CI dan penerimaan layanan nyata tetap bukti terpisah.
