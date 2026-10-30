# Galeri audit Generator dan pencarian sekolah

Bukti sintetis localhost, 30 Oktober 2026. Baseline main `bf3d87b`; implementasi `feat/admin-generator-ux`. Tidak memuat akun, token atau soal produksi. [Laporan dan batas verifikasi](../../ADMIN_GENERATOR_UX_2026-10-30.md).

| Area                           | Sebelum                                                               | Sesudah                                          |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------ |
| Generator Super Admin, 1440 px | [Form mendominasi](before-generator-super-1440.png)                   | [Direktori utama](generator-super-1440.png)      |
| Generator Content, 390 px      | [Form permanen dan riwayat panjang](before-generator-content-390.png) | [Direktori responsif](generator-content-390.png) |
| Pencarian Operations, 390 px   | [Ikon menimpa teks](before-school-operations-390.png)                 | [Jarak teks dan ikon](school-operations-390.png) |

- [Dialog pada 390×568, zoom CSS 125%](generator-dialog-short-zoom.png): judul dan tombol tetap terjangkau; isi form dapat digulir.
- Dialog pada hasil build production lokal: [desktop 1440 px](generator-dialog-1440.png) dan [mobile 390 px](generator-dialog-390.png).
- [Detail proses aktif, 1280 px](generator-progress-1280.png): progres, status otomatis, kembali ke riwayat dan identitas paket bertahap. Outline menunjukkan fokus keyboard yang dipindahkan ke judul detail.

Browser final mengaudit lebar 320/390/768/1024/1440 px untuk Super Admin dan Content, serta geometri pencarian Operations/Super Admin. Galeri ini merupakan pilihan screenshot; screenshot tidak menggantikan pengujian interaksi, otorisasi backend, CI atau review manusia.
