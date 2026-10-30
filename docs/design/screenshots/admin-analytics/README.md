# Analytics — galeri audit UI-04

30 Oktober 2026. **Data sintetis**, Admin DEMO, 22 metrik yang sama sebelum/sesudah. Ini bukti tampilan localhost, bukan data produksi, pengujian agregasi PostgreSQL atau persetujuan QA rilis. Timestamp contoh: 30 Oktober 2026, 15.00 WIB.

Baseline commit UI-03 `45bf3d8`; hasil pada branch `feat/admin-analytics-dashboard`. Screenshot full-page menyembunyikan overlay development dan membuat topbar statis hanya saat capture; kode aplikasi dan perilaku scroll tidak diubah oleh capture. Tes overflow, keyboard, zoom, menu dan state berjalan terpisah.

| Viewport   | Sebelum                         | Sesudah                             |
| ---------- | ------------------------------- | ----------------------------------- |
| 1440 × 900 | [Desktop awal](before-1440.png) | [Dashboard desktop](after-1440.png) |
| 1024 × 900 | —                               | [Tablet landscape](after-1024.png)  |
| 768 × 900  | —                               | [Tablet portrait](after-768.png)    |
| 390 × 900  | [Ponsel awal](before-390.png)   | [Dashboard ponsel](after-390.png)   |
| 320 × 900  | —                               | [Layar sempit](after-320.png)       |

Audit putaran kedua/ketiga: tidak ada overflow horizontal halaman pada kelima lebar; seluruh 22 key tampil satu kali. Screenshot sesudah berasal dari putaran ketiga setelah perbaikan wrapping angka besar pada KPI. Workspace 320 px diperiksa dengan Axe WCAG 2 A/AA dan 2.1 AA: nol pelanggaran otomatis. Angka, satuan, alasan keterbatasan, urutan baca, konsistensi skala dan penempatan tindakan ditinjau pada screenshot. Hasil automated accessibility tidak membuktikan kesempurnaan aksesibilitas.

Lihat [laporan implementasi, semantik dan verifikasi](../../ADMIN_ANALYTICS_UX_2026-10-30.md).
