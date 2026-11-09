# Audit kepadatan hero PvP dan Leaderboard — 31 Oktober 2026

**Tindak lanjut — 4 November 2026:** pemilik meminta penerapan perbaikan. Temuan di bawah merupakan baseline historis; [implementasi dan verifikasi terbaru](STUDENT_HERO_REFINEMENT_2026-11-04.md) menerapkan penyederhanaan artwork, ruang teks mobile dan warna pendukung.

**Kesimpulan audit:** ukuran hero sudah ringkas. Kepadatan visual masih menengah hingga tinggi pada mobile, terutama PvP pada 320px dan arena Sulit. Desktop memiliki pemisahan teks dan gambar yang lebih baik. Penilaian ini bersifat heuristik dari screenshot, bukan hasil uji pengguna.

**ENGINEERING DECISION — instruksi pemilik:** empat gambar yang disediakan pemilik menggantikan artwork hasil generasi sebelumnya. Hero dan font mengikuti Home/Belajar. Implementasi tersebut sudah ada sebelum audit kepadatan ini. Semua saran berikut berlabel **PROPOSED** dan belum diterapkan; audit ini tidak mengubah kode produk.

## Implementasi yang diaudit

Sumber: `pvp.png`, `mudah.png`, `sedang.png`, `sulit.png` dari pemilik. Salinan WebP berada di `apps/web/public/illustrations/student-heroes/`, masing-masing 98.172, 86.816, 90.538 dan 106.418 byte. CSS memakai crop untuk menyingkirkan bingkai putih sumber. Ukuran file saja tidak membuktikan performa pemuatan.

`student-hero-foundation.css` menjadi sumber ukuran bersama Home dan `StudentIllustratedHero`. Verifikasi implementasi sebelumnya membandingkan Home, PvP dan tiga arena pada tiga lebar: 15 pengukuran, tanpa perbedaan tinggi/font/radius pada lebar yang sama. Itu verifikasi ukuran, bukan bukti bahwa komposisi semua gambar sama baiknya.

| Lebar viewport | Tinggi hero | Judul | Deskripsi | Badge |
| --- | --- | --- | --- | --- |
| 320px | 156px | 16px | 10px | 10px |
| 390px | 160px | sekitar 17,57px | 10px | 10px |
| 1280px | 180px | 24px | 12px | 10px |

Pada sesi audit ini tinggi 160px/body 10px dikonfirmasi di PvP 390px; tinggi 180px/judul 24px/body 12px dikonfirmasi di Leaderboard 1280px. Tombol Buat room di PvP 390×844 berada di y=650,75 dengan tinggi 44px, sehingga masih terlihat sebelum navigasi bawah. Hero tidak membuat aksi utama keluar dari viewport tersebut.

## Langkah dan temuan

Semua screenshot diambil pada sesi audit ini melalui Product Design/browser in-app dari preview lokal dengan data sintetis. [Galeri bukti](screenshots/pvp-hero-density-2026-10-31/README.md) memuat crop hero dan halaman penuh untuk setiap langkah.

| Langkah | Layar | Kesehatan umum | Temuan dan saran PROPOSED |
| --- | --- | --- | --- |
| 1 | Mudah, 390px | Paling seimbang; kepadatan menengah | Hijau memberi ruang tenang untuk teks. Maskot/trofi terbaca, tetapi mahkota, medali, daun dan podium menambah detail. Pertahankan hijau dan maskot; kurangi ornamen serta podium dekoratif. |
| 2 | Sedang, 390px | Cukup ramai | Ungu menyatu dengan identitas Numora, tetapi sorot trofi dan mahkota mendominasi bagian atas. Kurangi sorot dan daun; beri jarak aman dari badge. Tab Sedang aktif masih hijau, sehingga tidak selaras dengan hero. |
| 3 | Sulit, 390px | Paling ramai | Merah–cokelat–ungu, trofi besar, mahkota, cahaya, daun, pita, permata dan podium menarik perhatian bersamaan. Pertahankan warna arena, jadikan maskot dan trofi dua unsur utama; kurangi cahaya dan ornamen kecil. |
| 4 | PvP, 390px | Aksi jelas; hero cukup padat | Dua karakter menjelaskan duel dengan baik. Pensil sudah sangat dekat dengan akhir judul; teks putih kecil bersaing dengan detail gambar. Perbaiki komposisi mobile dan sisakan area kiri yang tenang. |
| 5 | PvP, 320px | Perlu perbaikan keterbacaan | Pensil/karakter bersinggungan dengan judul dan deskripsi. Prioritas tertinggi: crop khusus layar kecil, geser/perkecil ilustrasi tanpa memotong wajah, atau pisahkan ilustrasi foreground dari latar agar ruang teks dapat dijaga. |
| 6 | PvP, 1280px | Baik | Teks dan karakter terpisah; judul, tombol dan pilihan kesulitan jelas. Pertahankan tinggi sekarang. Kurangi cahaya trofi/petir hanya bila dibutuhkan setelah perbaikan mobile. |
| 7 | Sulit, 1280px | Hero terbaca; halaman masih ramai | Area teks luas dan tenang. Namun hero, podium aktual, baris peringkat lavender dan banyak aksen warna bersaing. Tenangkan permukaan data agar peringkat siswa lebih dominan. |

## Prioritas perbaikan

1. **PROPOSED — tinggi:** perbaiki crop PvP mobile (langkah 4–5) sebelum mengubah ukuran keseluruhan hero. Membesarkan atau mengecilkan semua hero tidak menyelesaikan tabrakan komposisi pada 320px.
2. **PROPOSED — menengah:** sederhanakan artwork Sulit, lalu Sedang (langkah 2–3). Jaga area kiri untuk HTML text. Hindari glow/sparkle di belakang badge dan teks; pertahankan karakter khas setiap arena.
3. **PROPOSED — menengah:** kurangi podium dekoratif di tiga gambar leaderboard (langkah 1–3, 7), karena podium peringkat nyata langsung menyusul di bawah. Utamakan hasil siswa sebagai pusat halaman.
4. **PROPOSED — menengah:** selaraskan indikator tab kesulitan dengan warna arena atau gunakan indikator netral yang konsisten. Tab aktif sekarang hijau `rgb(47, 143, 107)` termasuk Sulit (langkah 2–3, 7).
5. **PROPOSED — menengah:** gunakan baris peringkat netral dan simpan aksen untuk baris sendiri. Pada Sulit, baris biasa dan sendiri sama-sama `rgb(251, 240, 255)`; marker kiri masih membedakan baris sendiri, tetapi warna isi kurang membantu (langkah 3, 7).
6. **PROPOSED — pendukung:** evaluasi deskripsi 11–12px di mobile setelah ruang teks diperbaiki. Deskripsi 10px memang mengikuti Home, tetapi latar yang padat menambah risiko sulit dibaca (langkah 1–5). Perubahan ini perlu diselaraskan dengan fondasi hero bersama; jangan hanya memperbesar font tanpa memeriksa ulang wrap.

## Yang sudah baik

- Tinggi hero ringkas dan konsisten; tidak perlu menambah tinggi untuk memberi kesan premium.
- Warna arena berbeda dan judul menyebut tingkat kesulitan, sehingga makna tidak hanya bergantung pada warna.
- Teks berupa HTML, bukan bagian bitmap. Tombol bermain tetap terpisah dan jelas.
- Desktop memberi ruang teks yang cukup; tema ilustrasi sesuai konteks duel/pencapaian.

## Batas pemeriksaan

Audit fokus pada kepadatan, hierarki, crop dan keterbacaan halaman lobby serta peringkat, bukan alur pertandingan. Tidak menguji pengguna nyata, screen reader, kontras setiap piksel, seluruh ukuran viewport, koneksi lambat, LCP/CLS atau performa produksi. Tidak mengklaim kepatuhan WCAG. Tidak mengubah scoring, durasi, API atau data. Posisi navigasi fixed di tengah screenshot panjang merupakan artefak full-page capture, bukan posisi statis dalam halaman.

Validasi implementasi sebelum audit: 64 tes relevan lulus pada run sukses terpisah; lint serta build/TypeScript web lulus. Sesi audit ini tidak menambahkan perubahan produk atau tes baru.

**Langkah berikut yang disarankan:** satu iterasi terfokus pada crop PvP 320/390px dan pengurangan ornamen Sulit, lalu bandingkan kembali dengan screenshot ini.
