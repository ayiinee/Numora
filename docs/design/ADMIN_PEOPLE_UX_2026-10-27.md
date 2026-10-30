# Pengguna & kelas: audit dan perombakan UI/UX

**ENGINEERING DECISION - instruksi pemilik, 27 Oktober 2026:** rombak layout, komponen dan tipografi Pengguna & kelas agar ringkas, mudah dilihat dan tidak membingungkan. Terapkan arah Akun Admin/Sekolah yang telah disetujui, tanpa mengubah hak akses atau aturan produk.

## Audit dan rencana

Tampilan lama memisahkan filter, hasil dan detail menjadi panel bertingkat. UUID sekolah/Guru tampil sebagai isian utama; detail kosong mengambil ruang sebelum dibutuhkan. Kartu hasil mengulang label dan memperpanjang halaman. Riwayat keanggotaan/roster memakai status mentah dan timestamp yang belum konsisten dalam WIB.

Gunakan fondasi `admin-management.css`: kanvas #F7F8FA, putih, teks #27313F, metadata #626D7C, border #DDE1E8 dan aksen #722CCE. Plus Jakarta Sans lokal, judul 28/36, bagian 18/26, isi 14/22, metadata 12/18; kontrol minimum 44 px.

Referensi: [Dribbble Admin UI](https://dribbble.com/tags/admin-ui), [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines), serta [Akun Admin](ADMIN_ACCOUNTS_UX_2026-10-27.md) dan [Sekolah](ADMIN_SCHOOLS_UX_2026-10-27.md) yang sudah dikerjakan. Rekomendasi otomatis UI/UX Pro Max tentang comparison/pricing dan warna teal tidak dipakai karena bertentangan dengan konteks operasional dan arah pemilik. Pola flat dan Plus Jakarta Sans sesuai baseline; aturan aksesibilitas tetap diterapkan.

```text
Pengguna & kelas                                  [Baca saja]
Telusuri akun, keanggotaan dan anggota kelas.
[Pengguna] [Kelas]
[Cari nama...                         ] [Cari] [Filter]
[Filter tambahan dibuka jika dibutuhkan; pilih sekolah/Guru menurut nama]
Nama             Peran / Guru       Status        [Lihat detail]
Menampilkan ...                               Sebelumnya Berikutnya

[Tutup detail]
Identitas pengguna / kelas dan metadata utama
Keanggotaan & verifikasi sekolah / Anggota kelas
Riwayat atau roster lima data + pencarian/status yang didukung API
[Identitas data: identifier untuk penelusuran jika dibutuhkan]
```

Kritik rencana: mengganti warna tanpa memisahkan penelusuran dan detail akan mempertahankan kepadatan lama. Tabel menjadi fokus; detail membuka area penuh dengan tombol kembali. Identifier tetap dapat diperiksa, tetapi filter memakai pencarian nama melalui API existing. Tidak menambah bulk action, angka agregat, CRUD, ban/unban atau filter akademik.

## Batas fungsional

- Super Admin dan Operations aktif dengan OPERATIONS_MANAGE; Content tetap hanya memakai limited structures. NestJS memeriksa izin setiap request.
- DTO generated/API existing tetap menjadi sumber. Daftar pengguna tidak menampilkan email/afiliasi/verifikasi yang hanya tersedia pada detail. Siswa Mandiri/School, Guru belum terverifikasi, kelas tanpa Guru aktif, arsip dan mantan anggota tetap terbaca.
- URL view/filter/offset/userId/classId, reload, Back/Forward dan pagination lima data dipertahankan. Pilihan sekolah/Guru adalah filter baca, bukan perubahan relasi.
- Request detail/keanggotaan/roster/lookup yang terlambat diabaikan setelah identitas atau target berubah. 401/403 melepas seluruh workspace; tidak memulihkan PII dari cache.
- Tidak ada mutasi, schema, endpoint atau dependency baru. Tidak ada kode gabung kelas atau aksi khusus Guru yang ditambahkan.

## Verifikasi

Audit sebelum perubahan merekam daftar dan detail lama. Putaran pertama memeriksa kedua subrole di 1440, 1024, 768, 390 dan 320 px. Kritik screenshot memperbaiki lebar tombol pencarian anggota pada ponsel. Putaran kedua menemukan Reset belum membersihkan draft yang belum diterapkan dan label filter perlu eksplisit; keduanya diperbaiki serta ditutup tes unit/browser. Respons lookup terlambat dan pemulihan nama pilihan juga diuji.

Putaran ketiga meloloskan 24 tes browser, tetapi peninjauan screenshot Operations di tablet menemukan CSS workspace lama mengubah form pencarian menjadi grid vertikal dan menimpa padding ikon. CSS halaman dipertegas; form pencarian memakai grid responsif. Putaran keempat meloloskan 11 tes terkait visual/picker/pagination/sidebar, termasuk pemeriksaan koordinat kontrol dan ruang teks di sebelah ikon. Galeri akhir menunjukkan daftar/detail kedua subrole, tablet/ponsel, filter dan pemulihan.

| Pemeriksaan                                            | Hasil                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit web keseluruhan                                   | 54 file, 385 tes lulus                                                                                                                      |
| Browser Pengguna & kelas + regresi Operations/Content  | 24 lulus                                                                                                                                    |
| Audit ulang visual/picker + regresi pagination/sidebar | 11 lulus; 3 mengulang skenario di atas, 32 skenario unik total                                                                              |
| Viewport dan aksesibilitas                             | 1440/1024/768/390/320 px; keyboard tab/panah, focus trap/Escape, viewport pendek, zoom 125%, reduced motion; tidak ada overflow horizontal  |
| Kontrak/izin                                           | query server, limit 5, URL/reload/Back, read-only GET, kelas tanpa Guru, mantan anggota, retry 503, penolakan 401/403 dan role Content/null |
| Struktur                                               | komponen direktori/detail, panel presentasi dan picker terpisah; DTO generated dan helper API existing dipertahankan                        |

Lint repository (`--max-warnings=0`), TypeScript web (`tsc --noEmit --incremental false`), build produksi Next.js dan `git diff --check` lulus. Cache build/browser diarahkan ke drive D untuk lingkungan Windows ini; tidak ada perubahan konfigurasi runtime atau schema. [Galeri portabel](screenshots/admin-people/README.md) memakai data sintetis lokal. Tes browser tidak memakai database/cloud. Acceptance backend nyata, CI, review manusia dan rilis tetap bukti yang terpisah.
