# Pagination dan pencarian Admin — 7 Oktober 2026

**ENGINEERING DECISION — instruksi pemilik:** daftar pada fitur Admin menampilkan maksimal lima data per halaman. Pencarian dan filter menggunakan ruang horizontal yang tersedia, dengan wrapping pada layar kecil.

## Perilaku UI

- Daftar pengguna dan kelas meminta `limit=5` dan mengikuti `nextOffset` dari API. Menerapkan pencarian/filter mengembalikan daftar ke halaman pertama.
- Versi soal, video, laporan, draf Tryout, paket Drill, batch/parameter IRT, audit umum, dan pilihan paket menampilkan lima data. Endpoint tanpa metadata pagination dibaca dengan satu baris tambahan untuk menentukan ketersediaan halaman berikutnya; baris tambahan tidak ditampilkan.
- Sekolah, token Guru, materi, soal dalam detail paket, preview Excel, dan laporan impor memakai pagination lokal atas respons/file lengkap yang sudah tersedia. Dropdown referensi, opsi jawaban, dan checklist validasi tetap memuat informasi yang diperlukan oleh editor.
- Tombol Sebelumnya/Berikutnya dan nomor halaman memakai komponen bersama. Tombol dinonaktifkan pada batas halaman dan selama operasi yang memerlukan lock.
- Pagination tidak menghapus draf editor atau pilihan soal Excel. Pergantian sekolah/paket mengembalikan halaman daftar detail ke awal.
- Toolbar pencarian pengguna/kelas dan filter soal berada selebar area konten di atas daftar/editor. Filter paket dan laporan memakai tata letak horizontal yang sama. Input pencarian utama mendapat ruang lebih lebar; filter membungkus sesuai lebar layar tanpa overflow halaman.

## Batas implementasi

Kontrak NestJS, schema database, assignment Admin, dan aturan akademik tetap mengikuti sumber yang berlaku. Daftar memakai mekanisme offset yang telah tersedia; perubahan ke cursor bukan bagian dari revisi tampilan ini. Audit umum hanya dimuat dan ditampilkan untuk Super Admin.

## Verifikasi

Suite Admin memeriksa request limit, batas halaman, navigasi lima baris, reset pagination, pemeliharaan draf dan pilihan Excel. Skenario browser memakai AuthProvider dan REST clients nyata dengan fixture sintetis pada 390 px dan 1280 px untuk pengguna, kelas, soal, sekolah, serta geometri toolbar dan overflow.

Hasil lokal: **63 tes Admin PASS**, lint fitur Admin/E2E PASS, TypeScript dan build produksi web PASS, serta **3 skenario browser terverifikasi**. Screenshot pengguna/soal pada desktop dan pengguna pada ponsel diperiksa secara visual. Run browser awal terhenti oleh HMR Turbopack; run produksi menemukan selector label Role terlalu ketat. Selector diubah ke combobox berdasarkan accessible name, lalu skenario desktop lulus pada rerun. Dua skenario lain (ponsel dan recovery/batas halaman workbench) lulus pada run produksi pertama. Tidak ada pengujian atau penulisan data Cloud yang diklaim.
