# Penyelarasan UI Admin Content

**ENGINEERING DECISION — instruksi pemilik, 2 November 2026:** lanjutkan penyelarasan Content setelah Operations menggunakan fondasi Super Admin yang disetujui: ringkas, profesional, mudah dipindai dan tetap sesuai izin. Review teknis serta pengembangan lokal dapat berjalan sambil menunggu review independen integrasi sebelumnya.

**ENGINEERING IMPLEMENTATION — lokal:** branch `feat/admin-content-ui-parity` berangkat dari `b92105d` (Operations). Belum menyatakan approval, merge, deploy atau penerimaan layanan nyata. Catatan ini menggantikan gaya legacy Oktober hanya pada layar/state yang diperbarui; aturan akses tetap mengikuti [matriks izin](../api/ADMIN_PERMISSION_MATRIX.md).

## Audit dan keputusan desain

Bank soal, impor utama, Pretest, Generator dan IRT sudah memakai komponen modern bersama. Perbedaan tersisa ada pada limited structures, detail laporan, pintu masuk JSON generator lama dan frame pemeriksaan/penolakan akses Content. Menyalin halaman Super Admin akan menambah duplikasi dan berisiko menampilkan aksi di luar izin.

Pakai Plus Jakarta Sans lokal, kanvas #F7F8FA, permukaan putih, teks #27313F, aksen #722CCE dan kontrol minimum 44 px dari fondasi management existing. Daftar tetap menjadi fokus; rincian status credential dibuka bila diperlukan. Tabel berubah menjadi susunan berlabel pada layar kecil. Tidak ada statistik tambahan atau dependensi visual baru.

## Perubahan

- **Sekolah & kelas (baca saja):** judul terlihat, penanda akses, tab native bersama, tabel lima data, pencarian, label status sekolah dan ketersediaan Guru. Credential hanya berupa jumlah; rincian terpakai/kedaluwarsa/dicabut tersedia melalui disclosure. Filter, pagination dan penelusuran kelas sekolah memakai URL serta mendukung reload/Back. Daftar kosong/error/loading memiliki pemulihan. Penolakan server menghapus daftar dan formulir pencarian.
- **Detail laporan:** frame, tautan kembali, kartu dan kontrol mengikuti fondasi assessment. Label status memakai penerjemahan yang sama dengan daftar laporan; nilai enum yang dikirim ke server dipertahankan. Tombol dan catatan tindak lanjut memakai bahasa Indonesia; waktu dinyatakan dalam WIB. Breadcrumb dan menu aktif kembali menunjuk Konten & assessment, hanya jika menu itu memang tersedia bagi akun.
- **JSON generator lama:** frame modern dan panel/navigasi memakai gaya impor existing. File tetap diperiksa terhadap sumber, lineage dan approval oleh workflow yang sama; tidak menambah jalur publikasi.
- **Akses Content:** frame loading/akses ditolak/dicabut memakai management. Data privat tetap tidak dipasang sebelum otorisasi frontend dan request server; retry tidak menganggap akses telah pulih.
- **Layar modern existing:** komponen serta alur bank/impor/Pretest/Generator/IRT dipertahankan dan diperiksa kembali melalui regresi.

## Batas fungsional

Limited structures hanya memakai `/admin/structures/schools` dan `/admin/structures/classes`. Tidak menampilkan identitas/email siswa atau Guru, roster, join code, nilai, token credential, atau aksi pengelolaan sekolah. Data agregat berasal dari respons API; jumlah nol tidak diubah menjadi angka contoh. Content tetap tidak memiliki menu Analytics, Akun Admin atau pengelolaan Operations.

Tidak ada perubahan API/DTO, capability, guard NestJS, database/migrasi, scoring, publikasi, kebijakan akademik atau histori XP. Pergantian akun/capability membuang panel lama. Impor/preview tetap terpisah dari persetujuan akademik dan publikasi.

## Validasi dan bukti

- **112/112 regresi browser produksi lulus**, sembilan file: assessment, lifecycle, Content parity, Generator, impor, IRT, Operations, Pretest dan sidebar. Tidak ada skip/retry.
- Audit visual kemudian menemukan breadcrumb detail laporan masih menunjuk Beranda. Setelah pemetaan menu dan label metadata diperbaiki, build diulang dan **23/23 pemeriksaan akhir lulus** pada build terakhir: Content parity, lifecycle dan sidebar untuk ketiga role. Batas perbedaan antara regresi luas dan pemeriksaan dampak terakhir ini dipertahankan.
- **45/45 tes unit lulus**, empat file: structures, admin-workspace, portal dan content-review. Pemeriksaan mencakup perubahan akun/capability, pembersihan data, menu induk yang diizinkan, serta label status Indonesia yang tetap mengirim enum `IN_REVIEW` ke API.
- Build produksi frontend beserta TypeScript, lint seluruh repositori dan format berkas perubahan lulus. Runtime pemeriksaan: Node 24.22.1, pnpm 12.6.0.
- Desktop/tablet/ponsel diperiksa pada 320, 390, 768, 1024 dan 1440 px; sidebar/keyboard/Escape/fokus dan pembesaran 125/200% juga diperiksa dalam suite terkait. Pemeriksaan axe pada layar terkait lulus; ini bukan sertifikasi aksesibilitas menyeluruh.

Putaran browser pertama menghasilkan 107/112 lulus: lima tes baru gagal karena locator `alert` terlalu luas (ikut memilih announcer Next.js) atau membaca ukuran judul sebelum halaman selesai tampil. Locator dibatasi ke konten aplikasi dan judul ditunggu; assertion akses tetap dipertahankan. Bukti gagal tetap tersimpan terpisah di `.tmp/admin-content-parity-results`; putaran hijau berada di `.tmp/admin-content-parity-final-results` dan `.tmp/admin-content-parity-navigation-final-results`.

Pengujian browser memakai identitas/respons sintetis terisolasi; hasilnya tidak menggantikan connected backend, OAuth nyata, layanan media/ilmiah, CI branch baru atau review manusia. Tidak ada perubahan cloud atau database selama pekerjaan ini.

### Galeri build terakhir

Gambar berisi **data sintetis**, diambil dari kode aplikasi tanpa mengubah class DOM untuk pratinjau.

| Layar               | Desktop                                                                | Ponsel                                                               |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Sekolah baca saja   | [1440 px](screenshots/admin-content-parity/schools-desktop.png)        | [390 px](screenshots/admin-content-parity/schools-mobile.png)        |
| Kelas baca saja     | [1440 px](screenshots/admin-content-parity/classes-desktop.png)        | [390 px](screenshots/admin-content-parity/classes-mobile.png)        |
| JSON generator lama | [1440 px](screenshots/admin-content-parity/generator-json-desktop.png) | [390 px](screenshots/admin-content-parity/generator-json-mobile.png) |
| Detail laporan      | [1440 px](screenshots/admin-content-parity/report-desktop.png)         | [320 px](screenshots/admin-content-parity/report-mobile.png)         |

Integrasi berikutnya tetap mempertahankan dependency #117/#118 dan perubahan Operations. Sebelum PR ke main, sinkronkan basis yang telah diterima, periksa diff tersisa, jalankan pemeriksaan wajib dan minta review independen. Tidak ada bypass branch protection atau merge otomatis.
