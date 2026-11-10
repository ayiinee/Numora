# Audit tampilan Admin

**ENGINEERING DECISION — instruksi pemilik, 10 November 2026.** Halaman Admin mengikuti fondasi tampilan batch Tryout: lebar konten tersedia, card jelas, field tipis tetapi kontras, tabel mudah dipindai, dan layout responsif. Aturan produk, otorisasi dan hasil historis tetap mengikuti implementasi serta kontrak existing.

## Temuan dan perbaikan

| Bagian          | Temuan                                            | Perbaikan                                                                                  |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Frame           | Batas lebar berbeda antar modul                   | Frame Admin, Akun, Sekolah dan Pengguna memakai lebar tersedia                             |
| Card            | Radius, border dan bayangan berbeda               | Fondasi card 12px, border 1px dan bayangan ringan; warna status lokal dipertahankan        |
| Form            | Ketebalan border field berbeda                    | Border 1px, permukaan putih, minimum tinggi 44px; padding ikon pencarian tetap milik modul |
| Validasi        | Field memerlukan pembeda fokus dan error          | Outline fokus, disabled dan `aria-invalid` dipertahankan secara eksplisit                  |
| Tabel           | Sebagian tabel tidak memenuhi card                | Lebar 100%, heading bernuansa lembut, isi sejajar vertikal                                 |
| Header          | Hero dekoratif terlalu dominan pada sebagian role | Judul halaman ringkas, permukaan netral                                                    |
| Navigasi ponsel | Logo dan breadcrumb berhimpitan pada 320px        | Logo topbar disembunyikan di bawah 600px; menu, breadcrumb dan keluar tetap tersedia       |

## Implementasi dan cakupan

`apps/web/src/app/admin-foundation.css` dimuat setelah stylesheet modul. Selector terbatas pada shell Admin dan dialog pengelolaan. Tidak mengubah UI Siswa/Guru, skema data atau API. Field checkbox, radio, file dan range tidak mendapat ukuran field teks.

Pemeriksaan browser menggunakan fixture sintetis existing untuk Akun, Sekolah, Pengguna/Kelas, Operasional, paket Pretest/Drill/Tryout, batch Tryout, Generator, Impor, Analitik dan IRT. Screenshot lokal berada di `apps/web/test-results/`; bukan bukti penerimaan layanan produksi. Suite menguji ukuran 320–1440px, overflow, keyboard/modal, state gagal/kosong, dan batas role sesuai skenario masing-masing.

## Hasil verifikasi — selesai 11 November 2026

- Lint file terkait, TypeScript dan build produksi Web lolos.
- Putaran utama: 129 dari 132 tes lolos. Tiga pemeriksaan warna Operasional gagal; warna latar dikembalikan ke baseline `#f7f8fa` dan ketiganya lolos pada putaran berikutnya.
- Putaran tambahan: 54 dari 55 tes lolos. Satu ekspektasi navigasi Operations masih memakai daftar sebelum penambahan akses baca Batch Tryout. Ekspektasi diperbarui mengikuti matriks izin existing; retest satu skenario tersebut lolos.
- Total cakupan 178 skenario unik setelah menghapus pengulangan Operasional. Semua memiliki hasil lolos setelah perbaikan/retest. Bukti putaran tambahan tersimpan lokal di `.tmp/admin-audit-retest/` dan `.tmp/admin-audit-navigation-retest/`.
- Dev server mencatat peringatan hydration saat skenario zoom serta satu peringatan library React `use()` saat navigasi; tidak menyebabkan assertion gagal. Build produksi lolos, tetapi tes fixture bukan pengganti acceptance dengan layanan terintegrasi.

**ENGINEERING DECISION � instruksi pemilik, 11 November 2026:** modal penerbitan batch menonjolkan judul batch, memisahkan jadwal mulai/tutup, menjelaskan akses delegasi dan penguncian pengaturan, serta memakai footer Kembali / Ya, terbitkan batch. Dialog existing tetap menangani fokus dan mencegah penutupan selama pengiriman.
