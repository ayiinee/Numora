# Pretest Authoring: audit dan perombakan UI/UX

**ENGINEERING DECISION - instruksi pemilik, 27 Oktober 2026:** lanjutkan arah Admin yang telah disetujui untuk halaman Pretest Authoring. Layout, komponen dan tipografi harus ringkas, mudah dilihat dan tidak membingungkan; tetap memakai kontrak, izin dan aturan akademik existing.

## Audit dan rencana

Baseline: form selalu terbuka sebelum daftar, soal hanya dapat dimasukkan melalui UUID, status bercampur dengan kode, setiap kartu memuat form review, dan arsip memakai dialog browser. Deskripsi halaman menyatakan dependensi Student secara menyeluruh, padahal UI seharusnya menampilkan kesiapan paket dari API. List memakai enam baris untuk menampilkan lima; kontrak ini dipertahankan.

Pakai kanvas #F7F8FA, putih, teks #27313F, metadata #626D7C, border #DDE1E8, ungu #722CCE dan Plus Jakarta Sans lokal. Judul 28/36, bagian 18/26, isi 14/22; teks soal 16 px, target kontrol 44 px. Direktori menjadi fokus pertama. Detail memisahkan komposisi, review editorial dan kesiapan publikasi. Pembuatan/edit/revisi dibuka dalam editor terfokus, dengan pemilih soal baca melalui API existing dan informasi teknis pada disclosure.

```text
Pretest Authoring                              [Buat draf Pretest]
Susun paket 20 soal per bab ...
Daftar paket       [Muat ulang]
Nama / bab              Status          Soal       [Lihat detail]
[Sebelumnya] Halaman 1 [Berikutnya]

Detail paket        [Edit draf / Buat versi baru] [Arsipkan]
Informasi paket     Review editorial       Kesiapan publikasi
Susunan soal: nomor dan isi; identitas asli dapat dibuka

Editor: Informasi & blueprint | Pilihan soal berdasarkan bab (5 per halaman)
        ID manual opsional    | Kelola urutan soal terpilih (maks. 20)
                                   [Batal] [Simpan draf]
```

Kritik rencana: memperindah textarea UUID tidak menyelesaikan pencarian dan pemeriksaan isi. Picker menampilkan stem/format yang terbaca dan mempertahankan pilihan di halaman lain; urutan eksplisit menjaga susunan. Draf kosong/belum lengkap tetap boleh disimpan. Batas dan validasi final tetap milik NestJS. Detail/revisi tidak mengubah versi historis, dan tidak ada tombol publikasi baru.

Referensi: [Dribbble Admin UI](https://dribbble.com/tags/admin-ui), [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines), serta [Konten & assessment](ADMIN_ASSESSMENT_UX_2026-10-27.md). Pencarian UI/UX Pro Max menekankan label form, validasi dekat isian dan feedback simpan. Baseline Admin yang disetujui mengungguli rekomendasi generik.

## Batas fungsional

- Super Admin/Content aktif dengan CONTENT_MANAGE; NestJS tetap otoritatif. 401/403 menutup workspace dan melepas data/draft; respons terlambat diabaikan setelah navigasi/identitas berubah.
- GET list/detail, blueprint/curriculum dan bank versi memakai DTO generated. Picker memakai filter PRETEST/READY/bab existing; tidak menebak blueprint, scope atau rubrik akademik.
- Draf boleh 0–20 versi unik; review memerlukan 20 soal siap dan bab yang sesuai, diperiksa server. Pin yang tidak ada di halaman bank dipertahankan sampai admin menghapusnya secara eksplisit.
- POST create, PUT edit dan POST revisions/review/archive tetap pada endpoint existing. Konfirmasi, alasan review, feedback dan retry tidak mengubah kebijakan publikasi.
- Tidak ada migrasi, perubahan backend, dependency, scoring/XP atau mutasi cloud.

## Verifikasi

Audit baseline merekam kedua subrole pada desktop/tablet/ponsel. Putaran awal menemukan tombol detail terpotong pada tabel dan footer editor terlalu tinggi. Lebar kolom/kartu responsif diperbaiki, footer disederhanakan, lalu header serta aksi simpan dipisahkan dari area gulir. Penjelasan blocker komposisi ditambahkan tanpa mengganti kode server. Susunan soal dibagi lima per halaman agar pemeriksaan 20 pin tetap ringkas.

Pengujian alur menemukan pagination di dalam form dapat ikut mengirim draf, karena tombol tidak mempunyai type. Komponen `AdminPagination` diperbaiki pada sumber dengan `type="button"`; tes memeriksa tidak ada mutasi sebelum Simpan. Regresi paket/soal/Content serta alur upload Pretest existing ikut dijalankan. Lookup yang gagal mempertahankan pin; payload tidak lengkap ditangani sebagai fallback baca, dan 401/403 melepas seluruh workspace.

| Pemeriksaan               | Hasil                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit web keseluruhan      | 54 file, 392 tes lulus                                                                                                                                                                                      |
| Browser utama dan regresi | 21 skenario unik lulus, termasuk authoring, review, revisi, arsip, permission, pagination bersama dan upload-first Pretest existing                                                                         |
| Audit akhir               | 6 skenario visual/interaksi diulang; screenshot katalog disegarkan untuk label fixture yang sesuai bab                                                                                                      |
| Viewport                  | 1440/1024/768/390/320 px untuk direktori/editor; detail draf, reviewed dan archived di desktop/ponsel. Tombol tabel diperiksa terhadap batas tabel, bukan hanya overflow dokumen                            |
| Aksesibilitas             | Keyboard/focus trap/Escape, fokus pada kegagalan, short viewport 320×568, zoom 125%, reduced motion dan kontrol 44 px                                                                                       |
| Komposisi                 | Pilihan lintas halaman, urutan eksplisit, 20 pin di halaman berbeda, penggantian satu versi, UUID manual/duplikat/limit/perubahan yang belum diterapkan, blueprint asal yang tidak tersedia di pilihan baru |
| Kegagalan                 | Retry referensi/list/label, draft/alasan tetap saat 503/409, denial lookup/mutasi, respons detail terlambat, loading/empty dan batas halaman terakhir                                                       |

Lint repository (`--max-warnings=0`), TypeScript web, build produksi Next.js, format file perubahan dan `git diff --check` lulus. [Galeri portabel](screenshots/admin-pretest/README.md) memakai data sintetis lokal. Tidak ada migrasi, perubahan API/backend/dependency atau mutasi cloud. CI, acceptance layanan nyata, validasi akademik Curriculum dan review manusia tetap bukti yang terpisah.
