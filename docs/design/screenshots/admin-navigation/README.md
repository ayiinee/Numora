# Galeri audit navigasi Admin — 2 November 2026

Seluruh data, nama, sesi dan API pada gambar adalah fixture sintetis lokal. Gambar akhir berasal dari build produksi frontend di port 3300 dengan layanan yang diintersep oleh Playwright, bukan deployment atau akun Development nyata. Baseline direkam sebelum perubahan menggunakan dev server terisolasi.

## Sebelum dan sesudah

| Tampilan                                                                                                    | Bukti                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Sebelum, Super Admin 1536×695: label membungkus, logo/akun ikut bergeser saat scroll                        | [Baseline](before-super-1536.png)             |
| Sesudah, Super Admin 1440×900: lebar 248 px, tombol tutup, kelompok/pembatas jelas, nama panjang membungkus | [Desktop](after-super-1440.png)               |
| Content 1024×900: bank soal lebih dulu, struktur baca saja, nama/peran lengkap                              | [Desktop kecil](after-content-1024.png)       |
| Drawer 390×844: menu lengkap dan akun di bawah                                                              | [Ponsel](after-mobile-390.png)                |
| Operations 1280×240: area menu dapat di-scroll tanpa menghilangkan logo/akun                                | [Viewport pendek](after-operations-short.png) |
| Super Admin 1536×695 pada zoom 200%: menu terakhir terjangkau dengan keyboard, akun tetap dalam layar       | [Zoom 200%](after-zoom-200.png)               |

Ukuran baseline dan gambar desktop final berbeda dan ditandai eksplisit. Label/nama panjang sengaja dipakai pada audit final; screenshot keyboard juga mempertahankan indikator fokus.

Tambahan feedback pemilik: [iterasi awal 304 px](before-wide-304.png) dipersempit menjadi 248 px. [Sidebar tertutup](after-collapsed-1280.png) memperlihatkan tombol Buka sidebar di header serta konten yang memakai ruang tersedia. Status diuji bertahan saat berpindah halaman/reload pada tab yang sama, dengan pengembalian fokus keyboard dan drawer ponsel yang independen.

## Hasil pemeriksaan final

- Web unit: **424/424 lulus**, 58 berkas, termasuk **29** tes portal Admin.
- TypeScript web: `pnpm --filter @tka/web exec tsc --noEmit --incremental false` lulus. Tidak menjalankan pembersihan cache dev milik pengguna.
- ESLint pada berkas TypeScript/TSX yang berubah serta `pnpm lint` seluruh repository: lulus tanpa warning.
- Build frontend: **lulus**, Next.js 16.4.1, Node 24.22.1; output `.next-e2e`, lingkungan publik fixture dan mode low-memory. Output dev `.next` tidak ditimpa.
- Browser pada build produksi: **28/28 lulus**. Empat belas tes sidebar/drawer/buka–tutup, empat tes Analytics (boundary Operations/Content/tanpa assignment serta landing pertama), delapan regresi portal lintas peran di 390/1280 px, dan dua regresi rute Student di 320/1440 px.
- Axe WCAG 2 A/AA dan 2.1 AA pada sidebar dan drawer tiga peran: **tidak ada pelanggaran** pada scope yang dipindai.
- Menu diperiksa pada 320/390 px, landscape 844×390, tinggi 240/360/480 px, desktop 1024/1280/1440/1536 px, zoom 125/200%, reduced motion, nama panjang, keyboard, fokus modal, Escape, perpindahan rute dan perubahan breakpoint.
- Prettier pada seluruh berkas kode/dokumentasi yang berubah dan `git diff --check`: lulus. Perubahan hanya pada navigasi, tes dan dokumentasi.

Command regresi browser:

```powershell
$env:NUMORA_E2E_PRODUCTION = 'true'
pnpm --filter @tka/web exec playwright test e2e/admin-sidebar.spec.ts e2e/admin-analytics-ux.spec.ts e2e/admin.spec.ts e2e/student.spec.ts --grep 'Admin sidebar|Admin desktop sidebar closes|Admin mobile menu|Admin navigation visual|Admin drawer|first landing|Analytics role boundary|Unified Admin portal|student routes at (320|1440)px'
```

Command memerlukan build fixture `.next-e2e` terlebih dahulu sesuai konfigurasi Playwright. Hasil ini tidak menyatakan tes layanan nyata, CI branch, review manusia atau deploy sudah selesai. Tidak ada mutasi database, migrasi, publikasi konten atau perubahan skor/XP.

[Audit, alasan desain dan batas implementasi](../../ADMIN_NAVIGATION_UX_2026-11-02.md).
