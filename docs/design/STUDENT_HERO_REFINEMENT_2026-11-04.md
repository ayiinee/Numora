# Penyempurnaan hero siswa — 4 November 2026

**Koreksi lanjutan pemilik — PvP:** ilustrasi foreground PvP dianggap terlalu kecil. PvP kembali memakai `pvp.webp` dari pemilik dengan skala desktop 104% (sebelumnya 108%) dan mobile 116% (sebelumnya 124%). Area gambar mobile diberi inset vertikal 12px/4px dan area teks 48%, agar pensil terlihat tanpa bertabrakan dengan teks. Tinggi hero tetap mengikuti Home. Perbaikan leaderboard tetap berlaku. [Bukti PvP setelah koreksi](screenshots/pvp-hero-restored-2026-11-04/README.md). Uraian ilustrasi PvP transparan di bawah menjadi riwayat iterasi, bukan aset aktif.

**ENGINEERING DECISION — instruksi pemilik:** terapkan rekomendasi audit kepadatan 31 Oktober untuk hero PvP dan tiga arena leaderboard. Pertahankan identitas karakter dan palet, tinggi/sudut/judul seperti Home. Pisahkan ilustrasi transparan dari latar agar ruang teks aman pada mobile; sederhanakan ornamen dan hilangkan podium dekoratif yang mengulang podium data.

Deskripsi hero statis mobile menjadi 12px dengan line-height 1,35 untuk keterbacaan; Home tetap memakai fondasi existing. Indikator kesulitan menggunakan warna arena. Baris peringkat biasa netral dan baris sendiri mempertahankan highlight serta label KAMU. Perubahan ini hanya presentasi dan tidak mengubah aturan produk, scoring, API atau data.

## Hasil

- PvP: dua karakter dan buku bintang dipertahankan; pensil tinggi, petir, trofi melayang dan sparkle dihilangkan agar tidak bersinggungan dengan teks.
- Mudah: burung hantu, medali pita biru dan trofi; mahkota, podium, daun dan cahaya dihilangkan.
- Sedang: burung hantu, medali pita merah, mahkota sederhana dan trofi; podium, daun dan sorot berlebih dihilangkan.
- Sulit: burung hantu, mahkota dengan satu permata merah dan trofi; kristal, pita, daun, podium dan cahaya dihilangkan.

Background warna serta gelombang halus dirender dengan CSS; ilustrasi memakai alpha transparan dan `background-size: contain`. Gambar tidak lagi bergantung pada pembesaran/crop banner berbingkai putih. Batas area gambar di kanan terpisah dari teks dan wajah tetap utuh.

Aset WebP baru berjumlah 254.014 byte (sekitar 248 KiB), dibandingkan 381.944 byte sebelumnya: berkurang sekitar 33,5%. Ini ukuran berkas, bukan pengukuran LCP. Sumber lama tetap tersimpan. [Aset dan prompt](../../apps/web/public/illustrations/student-heroes/README.md).

## Validasi

Preview lokal memakai fixture sintetis dan browser in-app. Empat hero diperiksa pada viewport 320, 390, 768 dan 1280px: 16 kombinasi. Seluruh teks muat dalam hero, tidak ada overflow horizontal, dan rentang teks judul/deskripsi tidak memasuki area ilustrasi. Jarak horizontal minimum yang tercatat adalah 11px. Tinggi tetap 156/160/180px mengikuti breakpoint Home; judul/badge tetap memakai fondasi ukuran Home.

| Viewport | PvP   | Mudah | Sedang | Sulit |
| -------- | ----- | ----- | ------ | ----- |
| 320px    | Lulus | Lulus | Lulus  | Lulus |
| 390px    | Lulus | Lulus | Lulus  | Lulus |
| 768px    | Lulus | Lulus | Lulus  | Lulus |
| 1280px   | Lulus | Lulus | Lulus  | Lulus |

Di arena Sulit, tab aktif terukur `rgb(150, 52, 64)`, baris biasa putih, dan baris sendiri `rgb(244, 226, 255)` dengan marker serta label KAMU. Pemilihan arena melalui kontrol halaman tetap berfungsi.

- Unit PvP/Leaderboard: 12 tes lulus.
- Build web dan TypeScript: lulus.
- Lint repository: lulus. Format file implementasi dan dokumentasi baru: lulus.
- Bukti: [galeri screenshot](screenshots/pvp-hero-refinement-2026-11-04/README.md) dan [pengukuran DOM](screenshots/pvp-hero-refinement-2026-11-04/measurements.jsonl).

Pemeriksaan ini memverifikasi presentasi lokal, bukan penerimaan layanan terintegrasi, uji pengguna, performa produksi atau sertifikasi aksesibilitas. Tidak ada perubahan TypeScript/domain/API.

## Lingkungan lokal

Drive C penuh saat mulai bekerja. Atas arahan melanjutkan di D, cache npm `_cacache` dipindahkan ke `.tmp/hero-refinement-runtime/npm-cacache` pada D dan junction mempertahankan akses dari lokasi semula. Folder tujuan berisi cache aktif; jangan menghapusnya sebagai cleanup `.tmp` tanpa memindahkan cache kembali atau memperbarui junction. Berkas sementara serta screenshot pekerjaan berada pada D.
