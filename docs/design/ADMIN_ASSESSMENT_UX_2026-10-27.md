# Konten & assessment: audit UI/UX

**ENGINEERING DECISION - instruksi pemilik, 27 Oktober 2026:** lanjutkan arah Admin yang telah disetujui untuk Konten & assessment. Tata ulang layout, komponen dan tipografi agar ringkas dan jelas, termasuk soal yang tertutup metadata teknis. Tidak mengubah konten akademik, kunci, policy, publikasi atau versi historis.

## Audit dan rencana desain

Baseline direkam untuk Super Admin dan Content pada 1440/1024/768/390/320 px. Super memakai banner ungu dan kanvas krem, dengan editor selalu terbuka di samping daftar yang sempit. Kode LOCAL dan path sumber panjang mendahului isi; MCMA hanya menunjukkan dua cuplikan tanpa nomor/perbedaan tipe yang jelas. Detail menampilkan ID opsi sebagai kunci, sehingga hubungan pertanyaan dan jawaban sulit diperiksa.

Gunakan fondasi Akun Admin/Sekolah/Pengguna: kanvas #F7F8FA, putih, teks #27313F, metadata #626D7C, border #DDE1E8 dan aksen #722CCE. Font lokal Plus Jakarta Sans: judul 28/36, bagian 18/26, kontrol 14/22; isi soal 16 px dengan spasi baris 1.7. Panel review menempatkan isi soal di area utama, keputusan/kesiapan pada area tersendiri. Identitas teknis tersedia melalui disclosure.

```text
Konten & assessment
[Konten: Materi | Soal | Video] [Assessment: Paket ...] [Peninjauan: ...]
Bank soal                         [Impor soal] [Tambah soal PG]
[Filter: tujuan, status, materi, sumber]   [Terapkan] [Reset]
Soal 1  Pilihan ganda kompleks     Tryout / Draf / v1
Pertanyaan yang terbaca utuh
[Lihat pilihan & pembahasan]
  1. ...  2. ...  3. ...  4. ...
  Pembahasan sumber; kunci lengkap di detail versi
[Sumber & identitas]                       [Detail, review & kesiapan]
[Sebelumnya] Halaman 1 [Berikutnya]
```

Kritik rencana: tabel metadata saja tetap menyembunyikan persoalan matematika. Gunakan daftar soal dengan pratinjau yang dapat dibuka dan area baca lebar, bukan kartu statistik besar. Editor dibuka saat dibutuhkan. Tipe/tujuan/status memakai bahasa manusia; opsi bernomor atau berhuruf tetap dipetakan ke ID asli, bukan perubahan kunci. Rumus memakai renderer KaTeX existing; HTML tetap teks dan media privat tetap lewat preview bertanda tangan.

Referensi: [Dribbble Admin UI](https://dribbble.com/tags/admin-ui), [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) untuk penelusuran/progressive disclosure; implementasi Admin yang telah disetujui tetap menjadi acuan visual. Pencarian lokal UI/UX Pro Max menegaskan keterbacaan mobile, kontras, konten panjang dan minim pergeseran layout. Tidak mengambil grafik/statistik fiktif dari referensi.

## Batas fungsional

- Super Admin dan Content/Data/Moderation dengan CONTENT_MANAGE; Operations/null tetap ditolak. AUDIT_READ tetap diperlukan untuk tab Audit.
- Seluruh sepuluh bagian dan endpoint existing dipertahankan. Catalog COMPACT_DEMO khusus Content, pagination lima soal, status versi/keluarga, lineage dan pemisahan review editorial dari publikasi akademik tetap berlaku.
- Soal, rumus dan kunci ditampilkan dari sumber, termasuk ekspresi yang secara akademik perlu diperiksa; frontend tidak memperbaiki atau menilai sendiri.
- Tidak menambah mutasi saat penelusuran. READY/arsip/revisi mempertahankan konfirmasi, alasan, expectedStatus dan idempotensi existing. Draft tidak hilang saat gagal.
- Tidak ada perubahan schema/backend/dependency. Browser Supabase tetap hanya untuk autentikasi.

## Verifikasi

Audit berulang memakai screenshot kedua subrole dan setiap bagian. Putaran awal memperbaiki penumpukan akun Content di topbar mobile, label select yang ambigu dan pesan simpan yang berada di belakang dialog. Audit berikutnya menemukan form moderasi melebar pada 320 px: track grid dibuat `minmax(0, 1fr)`, label aksi panjang dapat membungkus, dan editor tidak lagi melebarkan halaman. Navigasi ponsel diganti pemilih bagian, serta filter bank menjadi disclosure agar pertanyaan lebih cepat terlihat.

Editor PG dipertahankan dalam dialog native yang tetap terpasang saat ditutup; pagination tidak menghapus isian. Kegagalan menahan draft, menampilkan pesan di dialog dan memindahkan fokus/scroll ke pesan tersebut. Dialog nama materi/URL video menggantikan prompt browser dengan simpan eksplisit dan retry. Audit tambahan menemukan padding ganda pada editor sempit; form dan fieldset diselaraskan, ruang input diperiksa melalui ukuran aktual, dan header dialog tetap dapat dicapai saat isi panjang.

| Pemeriksaan     | Hasil                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit web        | 54 file, 387 tes lulus; termasuk kunci MCMA dari ID panjang, fallback ID tak dikenal, HTML/media dan alur editorial existing                                                     |
| Regresi browser | 36 skenario unik lulus (35 regresi dan 1 tambahan initial loading): bank, review, sepuluh bagian, catalog Content, pagination, Back/reload, hak akses dan moderasi historis      |
| Audit visual    | 1440/1024/768/390/320 px untuk bank; review/seluruh bagian juga di ponsel dan tablet. Regresi workbench mencakup 320/360/375/390/393/430/768/1024/1280/1440 px                   |
| Interaksi       | Dialog native, keyboard/focus trap/Escape, viewport pendek, zoom 125%, reduced motion, source disclosure, filter eksplisit, reset, retry 503 dan penghapusan payload setelah 403 |
| Batas sumber    | Semua empat pernyataan pada contoh dipertahankan, termasuk ekspresi yang perlu tinjauan akademik; penomoran mengikuti urutan sumber dan kunci tetap memetakan ID sumber          |

Recheck akhir meloloskan 6 skenario visual/interaksi; dua state daftar dan satu pemeriksaan editor diulang setelah perbaikan fokus. Screenshot dan tes posisi memastikan pesan gagal tidak tertutup header sticky, ruang form terpakai dan tidak ada overflow horizontal. Lint repository (`--max-warnings=0`), TypeScript web, build produksi Next.js, Prettier untuk file perubahan dan `git diff --check` lulus. Tidak ada konflik Git atau perubahan dependency/schema. [Galeri portabel](screenshots/admin-assessment/README.md) memakai data sintetis lokal, termasuk contoh operasi bilangan yang mereproduksi masalah screenshot pemilik. Tidak ada mutasi cloud/database. CI, acceptance layanan nyata, validasi akademik Curriculum dan review manusia tetap bukti yang terpisah.


## Panel akses dan kesiapan paket - 10 November 2026

**ENGINEERING DECISION - instruksi pemilik:** gunakan panel bersama yang ringkas untuk akses siswa, informasi versi dan syarat penerbitan pada Pretest, Drill, Tryout serta hasil impor. Header menampilkan ikon, status atau jumlah syarat terpenuhi; checklist memakai baris berstatus dan petunjuk, tanpa bullet kosong. Metadata teknis memakai disclosure dengan label dan nilai terpisah. Gunakan token, ikon, badge dan disclosure native existing; pertahankan keyboard, fokus dan tata letak ponsel. Tidak mengubah syarat server, otorisasi atau lifecycle publikasi. Teks draf Pretest mengikuti validasi otomatis existing, tanpa meminta persetujuan manual.

**ENGINEERING DECISION - koreksi pemilik, 10 November 2026:** panel akses dan checklist ditampilkan selalu terbuka, berurutan vertikal dengan lebar penuh. Hindari dua dropdown berdampingan yang menghasilkan tinggi timpang; hanya informasi teknis versi tetap dapat dilipat.

**ENGINEERING DECISION - instruksi terakhir pemilik, 10 November 2026:** ganti dua panel terbuka dengan tombol Akses siswa dan Syarat penerbitan. Setiap tombol membuka dialog existing yang terpisah; Escape menutup dan mengembalikan fokus. Berlaku pada workspace Pretest, Drill dan Tryout.


## Tambah batch Tryout - 10 November 2026

**ENGINEERING DECISION - permintaan pemilik:** formulir memakai tiga bagian bernomor: nama/jadwal WIB, paket soal, dan penerima. Pencarian pilihan berada di bagian paket dan memakai form HTML terpisah melalui atribut `form`, sehingga pencarian tidak memicu validasi/simpan batch. Ringkasan jumlah paket/sekolah serta aksi simpan berada di footer. Tampilan bertumpuk pada ponsel; pengaturan modal memakai formulir yang sama. Otorisasi, delegasi, jadwal, validasi server dan publikasi tidak berubah.


**ENGINEERING DECISION - pembaruan pemilik:** pada layar mulai 1200 px, form Tambah Batch memakai dua kolom: nama/jadwal dan penerima di kiri, paket soal di kanan. Footer simpan dan pesan gagal melintasi kedua kolom. Layar lebih kecil serta dialog pengaturan tetap satu kolom. Header bagian berupa judul tanpa nomor, border, latar atau subteks. Panel dan input tetap memiliki border kontras.
