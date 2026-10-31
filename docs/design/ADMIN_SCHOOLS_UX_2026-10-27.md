# Sekolah & credential: perombakan UI/UX

**ENGINEERING DECISION - pemilik, 27 Oktober 2026:** arah Akun Admin disetujui untuk perbaikan berikutnya. Halaman Sekolah & credential harus ringkas, mudah dilihat dan tidak membingungkan Admin. Aturan sekolah, credential, izin dan kontrak API dipertahankan.

## Audit dan arah desain

Baseline Super Admin dan Operations direkam dan dua skenario browser lulus sebelum perubahan. Super Admin masih menampilkan banner gradien, statistik halaman dan form tambah permanen sebelum daftar sekolah. Panel detail sempit menumpuk edit nama/alamat, status, tautan Guru/kelas, token baru dan seluruh riwayat credential. Pada ponsel, daftar dan detail terpisah oleh scroll panjang. Kode token dan identifier riwayat belum memiliki hierarki yang jelas.

Pemilik menginginkan konsistensi dengan [Akun Admin yang disetujui](ADMIN_ACCOUNTS_UX_2026-10-27.md). Gunakan kanvas #F7F8FA, putih, teks #27313F, metadata #626D7C, border #DDE1E8 dan ungu #722CCE. Plus Jakarta Sans lokal; judul 28/36, bagian 18/26, isi 14/22, metadata 12/18 dan target interaksi minimal 44 px.

Referensi: [Dribbble Admin UI](https://dribbble.com/tags/admin-ui), [school management directory](https://dribbble.com/search/school-management-dashboard), dan [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines). Referensi hanya memberi pola komposisi; tidak menambah modul sekolah, jumlah agregat, filter atau aturan produk. Rekomendasi otomatis UI/UX Pro Max tentang marketplace/claymorphism tidak digunakan karena tidak sesuai pekerjaan operasional dan arah yang disetujui. Aturan fokus, konfirmasi dan keyboard tetap digunakan.

```text
Sekolah & credential                         [Tambah sekolah]
Kelola sekolah dan token verifikasi Guru.
[Cari nama atau kode sekolah             ] [Cari]
Sekolah / kode          Alamat       Status       [Kelola]
Rentang halaman                          Sebelumnya / Berikutnya

[Kembali ke daftar sekolah]
Nama sekolah terpilih                            [Edit sekolah]
Kode / status / alamat                 [Lihat Guru] [Lihat kelas]
Token Guru                                   [Terbitkan token]
Satu kali pakai, berlaku 3 x 24 jam.
[Token baru hanya saat tersedia, salin / sembunyikan]
Diterbitkan       Status       Berlaku hingga       Pemakai / aksi
```

Kritik rencana: mempertahankan dua panel besar hanya memindahkan kepadatan lama ke warna baru. Daftar dan ruang sekolah terpilih menjadi dua tampilan berurutan dengan schoolId/search/offset tetap di URL. Form tambah/edit memakai dialog; tindakan status/reissue/revoke menyebut target dan memerlukan konfirmasi. Riwayat lebih ringkas, tetapi detail identifier/timestamp tetap dapat diperiksa. Tidak menambahkan statistik karena API tidak menyediakan total global.

## Batas fungsional

- Super Admin/Operations aktif dengan OPERATIONS_MANAGE; Content memakai limited structures yang sudah ada. NestJS tetap otoritatif.
- Single-use dan 3 x 24 jam mengikuti server. Status credential memakai nilai server, tidak dihitung ulang di browser.
- Sekolah nonaktif tidak dapat menerbitkan atau menerbitkan ulang; pencabutan tetap tersedia sesuai kontrak. Credential USED/REVOKED tidak menawarkan reissue/revoke.
- Token mentah hanya disimpan dalam state tampilan, tidak di URL/localStorage/sessionStorage/log. Clipboard ditulis hanya saat pengguna memilih Salin. Hilangkan tampilan token saat berpindah sekolah, nonaktif, atau akses dicabut. Pertahankan proteksi hasil request terlambat.
- Kesalahan tidak menghapus isian. Operasi tertunda tidak dapat dikirim ganda. Pencabutan akses menutup data/dialog; tidak memulihkan akses dari cache.
- Pagination lima data dan nextOffset server; Back/Forward/deep link tetap berfungsi. Tidak mengubah backend, schema, Auth atau data bersama.

## Audit dan bukti

1. **Baseline:** dua skenario Super/Operations lulus. Screenshot daftar/detail pada desktop dan ponsel ditinjau sebelum implementasi.
2. **Struktur baru:** 15 skenario lulus, terdiri dari dua audit visual sekolah dan 13 regresi Akun Admin. Fondasi token/shell/button dipindahkan ke `admin-management.css` tanpa mengganti layout Akun Admin. Audit menemukan fokus judul saat awal masuk terlalu menonjol dan label pagination ponsel terlalu panjang; fokus awal dihapus dan label disingkat menjadi Sebelumnya/Berikutnya dengan konteks pada nama navigasi.
3. **Alur kerja:** 14 skenario sekolah lulus, mencakup CRUD, status, draft gagal/simpan, URL/Back/Forward, pagination, detail riwayat, issue/copy/reissue/revoke, sekolah nonaktif, 401/403, role denial, loading/error/empty, keyboard, viewport pendek dan zoom 125%.
4. **Umpan balik token:** audit screenshot menemukan detail sempat hilang saat refresh dan token baru bisa berada di luar viewport. Detail kini dipertahankan saat request ulang untuk sekolah yang sama; respons PATCH langsung memperbarui tampilan, token baru mendapat fokus dan digulir ke area pandang. Tes unit menahan respons detail untuk membuktikan token tetap terlihat. Screenshot halaman penuh direkam dari posisi atas agar chrome fixed tidak bergeser dalam artefak.
5. **Regresi final:** 38 skenario gabungan lulus: 14 skenario baru dan 24 alur lama/menu/pagination. Selector legacy yang ambigu pada empty state diperjelas ke tombol header; tidak menghilangkan CTA empty state yang berguna. Termasuk pemeriksaan 320/390/768/1024/1440 px, tidak ada overflow horizontal, fokus Escape, dan zoom 125%. Audit kode juga menormalisasi schoolId agar deep link dengan huruf kapital tetap memuat identitas kanonis.

| Pemeriksaan                                             | Hasil                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Regresi unit frontend lengkap                           | 373 tes / 53 berkas lulus                                      |
| Verifikasi akhir modul sekolah, termasuk normalisasi ID | 20 tes lulus; mencakup tes yang juga ada dalam regresi lengkap |
| Browser                                                 | 51 skenario unik lulus: 38 sekolah/regresi + 13 Akun Admin     |
| Refresh galeri token setelah penyesuaian fixture waktu  | Satu skenario issue/copy/reissue/revoke lulus ulang            |
| Root lint, web TypeScript, build produksi               | Lulus                                                          |
| Format, diff whitespace dan galeri                      | Diperiksa; [screenshot](screenshots/admin-schools/README.md)   |

`schools.tsx` memiliki state URL, request dan operasi. `schools-panels.tsx` berisi tabel, field dan detail riwayat, menggunakan tipe API generated yang sudah ada. Token/shell/button bersama berada di `admin-management.css`; layout sekolah di `admin-schools.css`. Dialog/Button/Icon/Pagination dan mekanisme workspace tetap memakai primitive proyek. Tidak menambah dependensi, schema atau endpoint. Pembatasan respons terlambat, kunci workspace per identitas dan penghapusan secret tetap diuji.

Jalankan ulang dari root dengan port 3300 bebas:

```powershell
pnpm --filter @tka/web test
pnpm --filter @tka/web exec playwright test admin-schools-ux.spec.ts admin-accounts.spec.ts admin-sidebar.spec.ts
pnpm lint
pnpm --filter @tka/web exec tsc --noEmit --incremental false
pnpm --filter @tka/web build
```

Pemeriksaan lokal memakai cache Next/Playwright terisolasi di drive D. Seluruh data browser termasuk token/clipboard bersifat sintetis; tidak ada sekolah, Guru atau credential nyata yang dibuat/diubah. Hasil membuktikan UI dan penanganan respons API, bukan Cloud Auth, distribusi credential ke Guru, pengujian database terhubung, independent review, CI atau kesiapan rilis. Aturan single-use, eligibility dan 3 x 24 jam tetap milik NestJS/PostgreSQL. Tidak ada push atau deployment dalam pekerjaan ini.
